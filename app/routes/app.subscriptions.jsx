import { useActionData, useLoaderData, useSubmit } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Frame,
  Icon,
  InlineStack,
  Layout,
  Modal,
  Page,
  Text,
  TextField,
  Toast,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { UsageCard } from "../components/UsageCard";
import { PlansGrid } from "../components/PlansGrid";
import { useSubscription } from "../contexts/SubscriptionContext";
import Subscription from "../models/subscription.server";
import { authenticate } from "../shopify.server";
import { plans } from "../utils/plans";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const subscription = new Subscription(session.shop, admin.graphql);
  const url = new URL(request.url);
  const charge_id = url.searchParams.get('charge_id');
  const planParam = url.searchParams.get('plan');
  
  // Handle successful payment callback with charge_id
  if (charge_id && planParam) {
    console.log("LOADER: SW IS Charge ID and Plan Params has been called???");
    try {
      // Get the active subscription from Shopify to get the subscription ID
      const activeResult = await subscription.getActiveSubscription(session.shop, session.accessToken);
      console.log("SW: Loader active result after active subscription");
      if (activeResult.status === 200 && activeResult.subscriptions.length > 0) {
        const activeSubscription = activeResult.subscriptions[0];
        
        // Find the plan details
        const selectedPlan = plans.find(plan => plan.planId === planParam);
        if (selectedPlan) {
// Check for plan downgrade and handle catalog limits
        const currentSubscription = await subscription.getCurrentSubscription();
        console.log("SW Loader: what is currentSubscription", currentSubscription);
        
        const newMaxCatalogs = selectedPlan.planId === "free" ? 1 : selectedPlan.planId === "basic" ? 5 : 999;
        const newMaxCompanies = selectedPlan.planId === "free" ? 5 : selectedPlan.planId === "basic" ? 20 : 999;
        const newMaxOrders = selectedPlan.planId === "free" ? 50 : selectedPlan.planId === "basic" ? 200 : 999999;
        
        // Handle plan downgrade - deactivate excess catalogs if needed
        if (currentSubscription.subscription && currentSubscription.subscription.isActive) {
          const currentMaxCatalogs = currentSubscription.subscription.maxCatalogs;
          
          // Check if this is a downgrade (lower catalog limit)
          if (newMaxCatalogs < currentMaxCatalogs) {
            try {
              // Get current catalogs count
              const db = (await import("../db.server")).default;
              const shop = await db.shop.findUnique({
                where: { shopDomain: session.shop },
                select: { id: true }
              });
              
              if (shop) {
                const currentCatalogs = await db.catalog.findMany({
                  where: { shopId: shop.id },
                  orderBy: { createdAt: 'desc' }
                });
                
                // If current catalogs exceed new limit, deactivate excess catalogs
                if (currentCatalogs.length > newMaxCatalogs) {
                  const excessCount = currentCatalogs.length - newMaxCatalogs;
                  const catalogsToDeactivate = currentCatalogs.slice(newMaxCatalogs); // Get excess catalogs
                  
                  // Update catalog status to inactive
                  await db.catalog.updateMany({
                    where: {
                      id: {
                        in: catalogsToDeactivate.map(catalog => catalog.id)
                      }
                    },
                    data: {
                      status: "inactive"
                    }
                  });
                  
                  console.log(`Successfully deactivated ${excessCount} catalogs due to plan downgrade from ${currentMaxCatalogs} to ${newMaxCatalogs} catalogs limit`);
                }
              }
            } catch (error) {
              console.error("Error handling plan downgrade:", error);
              // Continue with subscription creation even if deactivation fails
            }
          }
        }

        const planData = {
          planId: selectedPlan.planId,
          planName: selectedPlan.name,
          planPrice: selectedPlan.price,
          maxCatalogs: newMaxCatalogs,
          maxCompanies: newMaxCompanies,
          maxOrders: newMaxOrders,
            features: selectedPlan.features.join(','),
          };

          // Update subscription with charge_id to confirm successful payment
          await subscription.createSubscription(planData, activeSubscription.id, charge_id);
          
          console.log(`Successfully created subscription for plan ${selectedPlan.planId} with charge_id ${charge_id}`);
          
          // Redirect to clean URL with success message
          const cleanUrl = new URL(request.url);
          cleanUrl.searchParams.delete('charge_id');
          cleanUrl.searchParams.delete('plan');
          cleanUrl.searchParams.set('status', 'success');
          cleanUrl.searchParams.set('message', `Successfully subscribed to ${selectedPlan.name} plan!`);
          
          console.log("SW Loader BEFORE: throw url clearURLS" );
          throw new Response(null, {
            status: 302,
            headers: {
              Location: cleanUrl.toString(),
            },
          });
        }
      }
      
      console.error("Failed to find active subscription or plan details");
      const errorUrl = new URL(request.url);
      errorUrl.searchParams.delete('charge_id');
      errorUrl.searchParams.delete('plan');
      errorUrl.searchParams.set('status', 'error');
      errorUrl.searchParams.set('message', 'Failed to verify subscription details');
      
      console.log("SW Loader BEFORE: throw url error" );
      throw new Response(null, {
        status: 302,
        headers: {
          Location: errorUrl.toString(),
        },
      });
      
    } catch (error) {
      console.log("SW LOADER: Error has been called");
      if (error instanceof Response) {
        throw error; // Re-throw redirect responses
      }
      console.error("Error updating subscription after payment:", error);
      const errorUrl = new URL(request.url);
      errorUrl.searchParams.delete('charge_id');
      errorUrl.searchParams.delete('plan');
      errorUrl.searchParams.set('status', 'error');
      errorUrl.searchParams.set('message', 'Failed to activate subscription');
      
      console.log("SW Loader BEFORE: throw url error FROM ERROR" );
      throw new Response(null, {
        status: 302,
        headers: {
          Location: errorUrl.toString(),
        },
      });
    }
  }
  
  // Get active subscription from Shopify (primary source of truth)
  const activeShopifySubscription = await subscription.getActiveSubscription(
    session.shop, 
    session.accessToken
  );
  
  // Get current subscription from database for usage limits
  const currentSubscription = await subscription.getCurrentSubscription();

  // Handle discount code validation
  const discountCode = url.searchParams.get('discount');
  let discountData = null;
  
  // Get usage statistics for current month
  let ordersData = { total: 0, thisMonth: 0, today: 0 };
  let catalogsData = { total: 0 };
  let companiesData = { total: 0 };
  
  try {
    const db = (await import("../db.server")).default;
    const shop = await db.shop.findUnique({
      where: { shopDomain: session.shop },
      select: { id: true }
    });
    
    if (shop) {
      // Get orders data
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const totalOrders = await db.order.count({
        where: { shopId: shop.id }
      });
      
      const monthOrders = await db.order.count({
        where: {
          shopId: shop.id,
          createdAt: { gte: monthStart }
        }
      });
      
      const todayOrders = await db.order.count({
        where: {
          shopId: shop.id,
          createdAt: { gte: dayStart }
        }
      });
      
      ordersData = { total: totalOrders, thisMonth: monthOrders, today: todayOrders };
      
      // Get catalogs count
      const totalCatalogs = await db.catalog.count({
        where: { shopId: shop.id }
      });
      catalogsData = { total: totalCatalogs };
      
      // Get companies count
      const totalCompanies = await db.company.count({
        where: { shopId: shop.id }
      });
      companiesData = { total: totalCompanies };
    }
  } catch (error) {
    console.error("Failed to fetch usage data:", error);
  }

  // Handle callback status messages (success/error messages from callback)
  const status = url.searchParams.get('status');
  const message = url.searchParams.get('message') ? decodeURIComponent(url.searchParams.get('message')) : null;

  // Determine the active subscription (prioritize Shopify GraphQL over database)
  // If Shopify returns no active subscriptions, assume the store is on the free plan
  // — this gives a fast UI update after cancelling to free. If the database still
  // reports an active subscription, prefer the DB value (helps avoid race conditions).
  let activeSubscription = null;
  if (activeShopifySubscription.subscriptions && activeShopifySubscription.subscriptions.length > 0) {
    const shopifySubscription = activeShopifySubscription.subscriptions[0];
    // Map Shopify subscription to our plan structure
    const matchingPlan = plans.find(plan => shopifySubscription.name.includes(plan.name)) || plans.find(plan => plan.planId === "basic"); // Default fallback
    
    activeSubscription = {
      planId: matchingPlan ? matchingPlan.planId : "basic",
      planName: shopifySubscription.name,
      planPrice: shopifySubscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || matchingPlan?.price || 0,
      maxCatalogs: matchingPlan ? (matchingPlan.planId === "free" ? 1 : matchingPlan.planId === "basic" ? 5 : 999) : 999,
      maxCompanies: matchingPlan ? (matchingPlan.planId === "free" ? 5 : matchingPlan.planId === "basic" ? 20 : 999) : 999,
      maxOrders: matchingPlan ? (matchingPlan.planId === "free" ? 50 : matchingPlan.planId === "basic" ? 200 : 999999) : 999999,
      features: matchingPlan ? matchingPlan.features.join(',') : '',
      isActive: shopifySubscription.status === 'ACTIVE',
      status: shopifySubscription.status,
      shopifySubscriptionId: shopifySubscription.id,
      expiresAt: null, // Shopify subscriptions don't have expiry dates like our database ones
    };
  } else {
    // No active Shopify subscription -> treat as free plan for immediate UI update
    const freePlan = plans.find(p => p.planId === 'free');
    activeSubscription = {
      planId: 'free',
      planName: freePlan ? freePlan.name : 'Free',
      planPrice: 0,
      maxCatalogs: 1,
      maxCompanies: 5,
      maxOrders: 50,
      features: freePlan ? freePlan.features.join(',') : '',
      isActive: false,
      status: 'FREE',
      shopifySubscriptionId: null,
      expiresAt: null,
    };

    // If DB still reports an active subscription, prefer the DB record to avoid edge cases
    if (currentSubscription.subscription && currentSubscription.subscription.isActive) {
      activeSubscription = currentSubscription.subscription;
    }
  }

  return {
    currentSubscription: activeSubscription,
    activeShopifySubscription: activeShopifySubscription.subscriptions,
    plans: plans,
    callbackStatus: status,
    callbackMessage: message,
    discountData: discountData,
    usageData: {
      totalCatalogs: catalogsData.total || 0,
      totalCompanies: companiesData.total || 0,
      totalOrders: ordersData.total || 0,
      thisMonthOrders: ordersData.thisMonth || 0,
      todayOrders: ordersData.today || 0,
    },
  };
}

export async function action({ request }) {
  console.log("SW call action has been called");
  const { session, admin } = await authenticate.admin(request);
  const subscription = new Subscription(session.shop, admin.graphql);
  const formData = await request.formData();
  const intent = formData.get("intent") || formData.get("action");
  console.log('SW ACTION METHOD: intent', intent);
  
  if (intent === "subscribe") {
    const planId = formData.get("planId");
    const discountCode = formData.get("discountCode");
    let discountedPrice = null;
    let originalPrice = null;
    
    const selectedPlan = plans.find(plan => plan.planId === planId);
    console.log("SW ACTION what is current: selectedPlan", selectedPlan);
    
    if (!selectedPlan) {
      return {
        error: "Invalid plan selected",
        success: false,
      };
    }

    // Handle free plan specially - cancel current subscription instead of creating new one
    if (selectedPlan.planId === "free") {
      console.log("SW ACTION METHOD FOR FREE PLAN HAS BEEN CALLED");
      try {
        // First, cancel the active Shopify subscription via GraphQL
        const cancelResult = await subscription.cancelShopifySubscription(session.shop, session.accessToken);

        console.log("SW what is cancelResult from graphql cancellation", cancelResult);
        
        if (cancelResult.status !== 200) {
          console.error("SW: Failed to cancel Shopify subscription:", cancelResult);
          return {
            success: false,
            message: cancelResult.message || "Failed to cancel current subscription",
          };
        }

        console.log("SW: ACTION METHOD Successfully cancelled Shopify subscription:", cancelResult.message);

        // Now that Shopify subscription is cancelled, create free plan subscription in database
        const planData = {
          planId: selectedPlan.planId,
          planName: selectedPlan.name,
          planPrice: selectedPlan.price,
          maxCatalogs: 1,
          maxCompanies: 5,
          maxOrders: 50,
          features: selectedPlan.features.join(','),
        };

        console.log("SW ACTION METHOD: creating free plan in database initiated");
        const dbResult = await subscription.createSubscription(planData, null);
        console.log("SW ACTION METHOD: db result for free plan", dbResult);

        console.log("SW ACTION METHOD: Subscription has been cancelled and created a FREE ONE ");
          
        if (dbResult.status !== 200) {
          console.error("SW ACTION METHOD: Failed to create free plan subscription in database:", dbResult);
          return {
            success: false,
            message: "Failed to create free plan subscription",
          };
        }

        console.log("SW ACTION METHOD: Successfully created free plan subscription in database");

        // For free plan, do not redirect. Return status and subscription for frontend to handle UI update.
        return {
          success: true,
          status: "deactivated",
          type: "free",
          message: "Your subscription has been successfully deactivated",
          subscription: dbResult.subscription,
        };
        
      } catch (error) {
        console.log("SW ACTION METHOD ERROR OCCUREED!!!!");
        console.log("SW what is ERROR which occured after catch for FREE PLAN", error);
          // Re-throw redirect responses (they're not actual errors)
        if (error instanceof Response) {
          throw error;
        }
        console.log("SW ACTION METHOD: Error handling free plan subscription:", error);
        return {
          success: false,
          message: "Failed to process free plan subscription",
        };
      }
    }

    console.log("SW ACTION METHOD PAID PLANS FUNCTIONS START HERE");
    // For paid plans, proceed with normal Shopify subscription flow
    const storeURL = session.shop.replace('.myshopify.com', '');
    const baseReturnUrl = `https://admin.shopify.com/store/${storeURL}/apps/b2b-staging-dev/app/subscriptions`;
    const returnUrl = `${baseReturnUrl}?plan=${encodeURIComponent(selectedPlan.planId)}&planName=${encodeURIComponent(selectedPlan.name)}&price=${selectedPlan.price}`;
    console.log('SW pre call');
    
    const finalPrice = discountedPrice !== null ? discountedPrice : selectedPlan.price;
    
    const graphqlResult = await subscription.createGraphqlSubscription(
      session.shop,
      session.accessToken,
      selectedPlan.name,
      returnUrl,
      finalPrice,
      selectedPlan.planId
    );

    if (graphqlResult.status !== 200) {
      return {
        success: false,
        message: graphqlResult.message,
        errors: graphqlResult.errors,
      };
    }

    // Note: Database update will be handled when user returns with charge_id after payment confirmation
    const message = "Redirecting to Shopify for payment confirmation...";

    return {
      success: true,
      message: message,
      confirmationUrl: graphqlResult.confirmationUrl,
      planDetails: selectedPlan,
    };
  }

  if (intent === "cancel") {
    try {
      // First cancel the Shopify subscription via GraphQL
      const shopifyResult = await subscription.cancelShopifySubscription(session.shop, session.accessToken);
      
      if (shopifyResult.status !== 200) {
        return {
          success: false,
          message: shopifyResult.message || "Failed to cancel subscription",
          cancelled: false,
        };
      }

      // Then update the database to mark subscription as inactive
      const dbResult = await subscription.cancelSubscription();
      
      return {
        success: dbResult.status === 200,
        message: "Subscription cancelled successfully",
        cancelled: true,
      };
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      return {
        success: false,
        message: "Failed to cancel subscription",
        cancelled: false,
      };
    }
  }

  if (intent === "getSubscription") {
    // Get active subscription from Shopify (primary source)
    const activeShopifySubscription = await subscription.getActiveSubscription(
      session.shop, 
      session.accessToken
    );
    
    // Get current subscription from database (fallback)
    const currentSubscription = await subscription.getCurrentSubscription();

    console.log("SW getSubscription - currentSubscription:", JSON.stringify(currentSubscription, null, 2));
    console.log("SW getSubscription - activeShopifySubscription:", JSON.stringify(activeShopifySubscription, null, 2));

    // Prioritize Shopify GraphQL subscription over database
    let activeSubscription = null;
    
    if (activeShopifySubscription.subscriptions && activeShopifySubscription.subscriptions.length > 0) {
      const shopifySubscription = activeShopifySubscription.subscriptions[0];
      const matchingPlan = plans.find(plan => shopifySubscription.name.includes(plan.name)) || plans.find(plan => plan.planId === "basic");
      
      activeSubscription = {
        status: shopifySubscription.status,
        planId: matchingPlan ? matchingPlan.planId : "basic",
        planName: shopifySubscription.name,
        name: shopifySubscription.name,
        maxForms: matchingPlan ? (matchingPlan.planId === "free" ? 2 : 999) : 999,
        maxSubmissions: matchingPlan ? (matchingPlan.planId === "free" ? 100 : matchingPlan.planId === "basic" ? 500 : 999999) : 999999,
        expiryDate: null, // Shopify subscriptions don't have expiry dates
        currentPeriodEnd: null,
      };
    } else if (currentSubscription.subscription && currentSubscription.subscription.isActive) {
      activeSubscription = {
        status: 'ACTIVE',
        planId: currentSubscription.subscription.planId,
        planName: currentSubscription.subscription.planName,
        name: currentSubscription.subscription.planName,
        maxCatalogs: currentSubscription.subscription.maxCatalogs,
        maxCompanies: currentSubscription.subscription.maxCompanies,
        maxOrders: currentSubscription.subscription.maxOrders,
        expiresAt: currentSubscription.subscription.expiresAt,
        currentPeriodEnd: currentSubscription.subscription.expiresAt,
      };
    }

    return {
      success: true,
      subscription: activeSubscription,
    };
  }

  return { success: false, message: "Invalid intent" };
}

export function PricingPlans() {
  const { currentSubscription, activeShopifySubscription, plans, callbackStatus, callbackMessage, discountData, usageData } = useLoaderData();
  const { subscription: contextSubscription, hasActiveSubscription: contextHasActiveSubscription, refresh: refreshSubscription } = useSubscription();
  const actionData = useActionData();
  const submit = useSubmit();
  const [toastActive, setToastActive] = useState(false);
  const [shownMessages, setShownMessages] = useState(new Set());
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [stableSubscription, setStableSubscription] = useState(null);
  const [showFreePlanModal, setShowFreePlanModal] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState(discountData || null);
  const [discountError, setDiscountError] = useState('');

  const normalizeSubscriptionForUsageCard = useCallback((subscription) => {
    if (!subscription) return null;
    
    if (subscription.maxCatalogs !== undefined || subscription.maxCompanies !== undefined) {
      return subscription;
    }
    
    if (subscription.planId) {
      return {
        ...subscription,
        planId: subscription.planId,
        planName: subscription.planName || subscription.name,
        maxCatalogs: subscription.maxCatalogs || (subscription.planId === "free" ? 1 : subscription.planId === "basic" ? 5 : 999),
        maxCompanies: subscription.maxCompanies || (subscription.planId === "free" ? 5 : subscription.planId === "basic" ? 20 : 999),
        maxOrders: subscription.maxOrders || (subscription.planId === "free" ? 50 : subscription.planId === "basic" ? 200 : 999999),
        isActive: subscription.status === 'ACTIVE'
      };
    }
    
    return subscription;
  }, []);

  const toggleToast = useCallback(() => setToastActive((active) => !active), []);

  const handleDiscountValidation = () => {
    console.log("SW discount validation has been called");
    if (!discountCode.trim()) {
      setAppliedDiscount(null);
      setDiscountError('Please enter a discount code');
      return;
    }

    setValidatingDiscount(true);
    setDiscountError('');
    setAppliedDiscount(null); // Clear any existing discount
    
    const formData = new FormData();
    formData.append("intent", "validateDiscount");
    formData.append("discountCode", discountCode.trim().toUpperCase());
    
    submit(formData, { 
      method: "post",
    });
  };

  const calculateDiscountedPrice = (originalPrice, discount) => {
    if (!discount || originalPrice <= 0) return originalPrice;
    
    // All discounts are percentage-based now
    const discountedPrice = originalPrice * (1 - discount.value / 100);
    
    return Math.round(discountedPrice * 100) / 100;
  };

  const getPlansWithDiscounts = () => {
    if (!appliedDiscount) return plans;
    
    return plans.map(plan => ({
      ...plan,
      originalPrice: plan.price,
      discountedPrice: calculateDiscountedPrice(plan.price, appliedDiscount),
      discount: appliedDiscount
    }));
  };

  const handleSubscribe = (planId) => {
    // Show confirmation modal for free plan downgrade
    if (planId === "free") {
      setShowFreePlanModal(true);
      return;
    }
    
    // Freeze current subscription data during loading - normalize it for consistent structure
    setStableSubscription(normalizeSubscriptionForUsageCard(contextSubscription || currentSubscription));
    setLoadingPlan(planId);
    const formData = new FormData();
    formData.append("intent", "subscribe");
    formData.append("planId", planId);
    if (appliedDiscount && appliedDiscount.code) {
      formData.append("discountCode", appliedDiscount.code);
    }
    submit(formData, { method: "post" });
  };

  const handleFreePlanConfirm = () => {
    setShowFreePlanModal(false);
    // Freeze current subscription data during loading - normalize it for consistent structure
    setStableSubscription(normalizeSubscriptionForUsageCard(contextSubscription || currentSubscription));
    setLoadingPlan("free");
    // If the current URL contains subscription callback/query params (from paid flow),
    // dismiss any visible banner and remove query params now (on click) so they don't persist.
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('planName') || urlParams.has('plan') || urlParams.has('price') || urlParams.has('status') || urlParams.has('message') || urlParams.has('charge_id')) {
        setBannerDismissed(true);
        window.history.replaceState({}, '', '/app/subscriptions');
      }
    } catch (err) {
      console.error('Error cleaning URL params before downgrading to free:', err);
    }
    const formData = new FormData();
    formData.append("intent", "subscribe");
    formData.append("planId", "free");
    submit(formData, { method: "post" });
  };

  const handleCancel = () => {
    setLoadingPlan("cancel");
    const formData = new FormData();
    formData.append("intent", "cancel");
    submit(formData, { method: "post" });
  };

  // Handle confirmation URL redirect and action results
  useEffect(() => {
    if (actionData?.confirmationUrl && actionData?.success) {
      // Show Shopify toast notification for paid plans
      setTimeout(() => {
        window.open(actionData.confirmationUrl, '_top');
      }, 500);
      // Don't reset loading state here - keep it until user returns
      return;
    }

    // Free plan completed (no redirect) — update UI and refresh subscription context
    if (actionData?.success && actionData?.type === "free") {
      setLoadingPlan(null);
      console.log("SW what is actionData.subscription for FREE PLAN", actionData);
      if (actionData.subscription) {
        setStableSubscription(actionData.subscription);
      }

      // Refresh subscription context so UI updates immediately without reload
      try {
        if (typeof refreshSubscription === 'function') {
          refreshSubscription();
        }
      } catch (err) {
        console.error('Failed to refresh subscription context after free downgrade', err);
      }

      // Show the deactivated banner (clear any previous dismissal)
      setBannerDismissed(false);

      // Ensure any subscription-related query params are removed from the URL
      try {
        window.history.replaceState({}, '', '/app/subscriptions');
      } catch (err) {
        console.error('Failed to clear URL after free downgrade', err);
      }

      return;
    }

    if (actionData?.cancelled) {
      setLoadingPlan(null);
      setStableSubscription(null);
      return;
    }

    if (actionData && !actionData.success) {
      setLoadingPlan(null);
      setStableSubscription(null);
      if (actionData.message) {
        shopify.toast.show(actionData.message, { isError: true });
      }
    }
  }, [actionData]);

  // Reset loading state when user returns from subscription flow
  useEffect(() => {
    // If we have a callback status from the loader, it means user returned from subscription flow
    if (callbackStatus) {
      setLoadingPlan(null);
      setStableSubscription(null);
      setBannerDismissed(false); // Ensure banner shows for callback status
    }
  }, [callbackStatus]);

  // Handle discount validation response
  console.log("SW what is actionData outside of useEffect", actionData);
  useEffect(() => {
    console.log("SW useEffect actionData:", actionData);
    
    if (actionData) {
      console.log("SW actionData has success property");
      
      // Check if this is a discount validation response (not subscription confirmation)
      const isDiscountValidation = actionData.type === "DiscountValidation";
      
      console.log("SW isDiscountValidation:", isDiscountValidation);
      
      if (isDiscountValidation) {
        console.log("SW stopping validation loading");
        setValidatingDiscount(false);
        
        if (actionData.success && actionData.discount) {
          console.log("SW setting applied discount:", actionData.discount);
          setAppliedDiscount(actionData.discount);
          setDiscountError('');
        } else {
          console.log("SW setting discount error:", actionData.message);
          setAppliedDiscount(null);
          // Map common error messages to user-friendly text
          let errorMessage = actionData.message || 'Invalid discount code';
          if (errorMessage.toLowerCase().includes('not found')) {
            errorMessage = 'Discount code not found';
          } else if (errorMessage.toLowerCase().includes('inactive') || errorMessage.toLowerCase().includes('deactivated')) {
            errorMessage = 'This discount code is not active';
          } else if (errorMessage.toLowerCase().includes('expired')) {
            errorMessage = 'This discount code has expired';
          }
          setDiscountError(errorMessage);
        }
      }
    }
  }, [actionData]);

  // Also listen for page focus and URL changes (when user returns from popup)
  useEffect(() => {
    const handleFocus = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get('status');
      
      if (status === 'success' || status === 'error') {
        setLoadingPlan(null);
        setStableSubscription(null);
      }
    };
    
    // Check initial URL state
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    if (status === 'success' || status === 'error') {
      setLoadingPlan(null);
      setStableSubscription(null);
    }
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Show toast for messages (only once per unique message)
  useEffect(() => {
    // Prefer callbackMessage, but also handle free plan deactivation from actionData
    const message = callbackMessage || actionData?.message;
    if (message && !toastActive && !shownMessages.has(message)) {
      setToastActive(true);
      setShownMessages(prev => new Set([...prev, message]));
    }
  }, [actionData?.message, callbackMessage, toastActive, shownMessages]);

  const toastMarkup = toastActive ? (
    <Toast
      content={callbackMessage || actionData?.message || "Action completed"}
      onDismiss={toggleToast}
      error={callbackStatus === 'error' || (actionData?.success === false)}
    />
  ) : null;

  const isCurrentPlan = (planId) => {
    // Use context subscription if available, otherwise fallback to loader data
    const activeSubscription = contextSubscription || currentSubscription;
    
    console.log('SW isCurrentPlan check:', {
      planId,
      contextSubscription,
      currentSubscription,
      activeSubscription,
      planIdMatch: activeSubscription?.planId === planId,
      isActive: activeSubscription?.is_active || (contextSubscription?.status === 'ACTIVE')
    });
    
    // Check if we have an active subscription (paid plan)
    if (activeSubscription && (activeSubscription.is_active || contextSubscription?.status === 'ACTIVE')) {
      return activeSubscription?.planId === planId;
    }
    
    // If we have a subscription but it's not active (like free plan), check planId directly
    if (activeSubscription && activeSubscription.planId) {
      return activeSubscription.planId === planId;
    }
    
    // If no active subscription at all, default to free plan
    return planId === "free";
  };

  const hasActiveSubscription = contextHasActiveSubscription || currentSubscription?.is_active;
  console.log("SW in plans page", { 
    hasActiveSubscription, 
    contextHasActiveSubscription,
    currentSubscription,
    contextSubscription 
  });

  // Helper function to determine if a plan is an upgrade or downgrade
  const getPlanRelation = (planId) => {
    const activeSubscription = contextSubscription || currentSubscription;
    if (!activeSubscription || !hasActiveSubscription) {
      return 'new'; // No active subscription
    }

    const currentPlan = plans.find(p => p.planId === activeSubscription.planId);
    const targetPlan = plans.find(p => p.planId === planId);
    
    if (!currentPlan || !targetPlan) {
      return 'new';
    }

    if (currentPlan.planId === targetPlan.planId) {
      return 'current';
    }
    
    // Define plan hierarchy for comparison
    const planHierarchy = { free: 0, basic: 1, pro: 2 };
    const currentTier = planHierarchy[currentPlan.planId] ?? 0;
    const targetTier = planHierarchy[targetPlan.planId] ?? 0;
    
    if (targetTier > currentTier) {
      return 'upgrade';
    } else if (targetTier < currentTier) {
      return 'downgrade';
    } else {
      return 'current';
    }
  };
  
  return (
    <Frame>
      <Page 
        backAction={{ content: "Dashboard", url: "/app" }}
        title="Choose Your Plan"
      >
        <Layout>
          {callbackStatus === 'success' && !bannerDismissed && !(actionData?.type === 'free' || actionData?.status === 'deactivated') && (
            <Layout.Section>
              <Banner
                title="Subscription Activated!"
                status="success"
                onDismiss={() => {
                  setBannerDismissed(true);
                  window.history.replaceState({}, '', '/app/subscriptions');
                }}
              >
                <p>Your subscription has been successfully activated and is now ready to use!</p>
              </Banner>
            </Layout.Section>
          )}
          {(callbackStatus === 'deactivated' || (actionData?.status === 'deactivated' && actionData?.type === 'free')) && !bannerDismissed && (
            <Layout.Section>
              <Banner
                title="Subscription Deactivated"
                status="info"
                onDismiss={() => {
                  setBannerDismissed(true);
                  window.history.replaceState({}, '', '/app/subscriptions');
                }}
              >
                <p>{callbackMessage || actionData?.message || "Your subscription has been successfully deactivated"}</p>
              </Banner>
            </Layout.Section>
          )}
          
          {callbackStatus === 'error' && !bannerDismissed && (
            <Layout.Section>
              <Banner
                title="Subscription Failed"
                status="critical"
                onDismiss={() => {
                  setBannerDismissed(true);
                  window.history.replaceState({}, '', '/app/subscriptions');
                }}
              >
                <p>{callbackMessage || "There was an error processing your subscription. Please try again."}</p>
              </Banner>
            </Layout.Section>
          )}
          
          <Layout.Section>
            <UsageCard 
              currentSubscription={normalizeSubscriptionForUsageCard(
                loadingPlan !== null ? stableSubscription : (contextSubscription || currentSubscription)
              )} 
              usageData={usageData} 
              isLoading={loadingPlan !== null}
              showOverallUsage={true}
            />
          </Layout.Section>

          <Layout.Section>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <Text as="p" variant="bodyLg" tone="subdued">
                Select the perfect plan for your business. Paid plans include a 5-day free trial.
              </Text>
            </div>
          </Layout.Section>

          <Layout.Section>
            <PlansGrid
              plans={getPlansWithDiscounts()}
              isCurrentPlan={isCurrentPlan}
              loadingPlan={loadingPlan}
              handleSubscribe={handleSubscribe}
              getPlanRelation={getPlanRelation}
            />
          </Layout.Section>

          <Layout.Section>
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Need a custom plan?{" "}
                <Button variant="plain">Contact our sales team</Button>
              </Text>
            </div>
          </Layout.Section>
        </Layout>
      </Page>
      {toastMarkup}
      
      <Modal
        open={showFreePlanModal}
        onClose={() => setShowFreePlanModal(false)}
        title="Downgrade to Free Plan"
        primaryAction={{
          content: "Yes, Downgrade",
          destructive: true,
          onAction: handleFreePlanConfirm,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowFreePlanModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            Are you sure you want to downgrade to the free plan? This will cancel your current subscription and:
          </Text>
          <br />
          <Text as="ul" variant="bodyMd">
            <li>• Limit you to 2 forms maximum</li>
            <li>• Limit you to 100 submissions per month</li>
            <li>• Remove email notifications</li>
            <li>• Unpublish any excess forms beyond the 2-form limit</li>
          </Text>
          <br />
          <Text as="p" variant="bodyMd" tone="critical">
            This action cannot be undone, and you'll lose access to premium features immediately.
          </Text>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}

export default PricingPlans;
