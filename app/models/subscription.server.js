import db from "../db.server";

export default class Subscription {
  constructor(shopifyUrl, graphql) {
    this.shopifyUrl = shopifyUrl;
    this.graphql = graphql;
  }

  async getCurrentSubscription() {
    try {
      const subscription = await db.subscription.findUnique({
        where: {
          shopifyUrl: this.shopifyUrl,
        },
      });

      return {
        status: 200,
        subscription: subscription || null,
      };
    } catch (error) {
      console.error("Error getting current subscription:", error);
      return {
        status: 500,
        message: "Failed to get current subscription",
        error: error.message,
      };
    }
  }

  async createSubscription(planData, shopifySubscriptionId = null, chargeId = null) {
    try {
      const existingSubscription = await db.subscription.findUnique({
        where: {
          shopifyUrl: this.shopifyUrl,
        },
      });

      let subscription;

      if (existingSubscription) {
        // Update existing subscription
        subscription = await db.subscription.update({
          where: {
            shopifyUrl: this.shopifyUrl,
          },
          data: {
            ...planData,
            shopifySubscriptionId: shopifySubscriptionId,
            chargeId: chargeId,
            isActive: true,
            startedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new subscription
        subscription = await db.subscription.create({
          data: {
            shopifyUrl: this.shopifyUrl,
            shopifySubscriptionId: shopifySubscriptionId,
            chargeId: chargeId,
            ...planData,
            isActive: true,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          },
        });
      }

      return {
        status: 200,
        message: "Subscription created/updated successfully",
        subscription,
      };
    } catch (error) {
      console.error("Error creating subscription:", error);
      return {
        status: 500,
        message: "Failed to create/update subscription",
        error: error.message,
      };
    }
  }

  async cancelSubscription() {
    try {
      const subscription = await db.subscription.update({
        where: {
          shopifyUrl: this.shopifyUrl,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      return {
        status: 200,
        message: "Subscription cancelled successfully",
        subscription,
      };
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      return {
        status: 500,
        message: "Failed to cancel subscription",
        error: error.message,
      };
    }
  }

  async updateSubscriptionStatus(isActive) {
    try {
      const subscription = await db.subscription.update({
        where: {
          shopifyUrl: this.shopifyUrl,
        },
        data: {
          isActive: isActive,
          updatedAt: new Date(),
        },
      });

      return {
        status: 200,
        message: `Subscription ${isActive ? "activated" : "deactivated"} successfully`,
        subscription,
      };
    } catch (error) {
      console.error("Error updating subscription status:", error);
      return {
        status: 500,
        message: "Failed to update subscription status",
        error: error.message,
      };
    }
  }

  // Graphql query
  async createGraphqlSubscription(
  shopDomain,
  accessToken,
  planName,
  returnUrl,
  price,
  planId = null
) {
  try {
    const mutation = `
      mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int, $test: Boolean) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          lineItems: $lineItems
          trialDays: $trialDays
          test: $test
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
          appSubscription {
            id
            name
            status
          }
        }
      }
    `;

    const variables = {
      name: planName,
      returnUrl,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              interval: "EVERY_30_DAYS",
              price: { amount: price.toString(), currencyCode: "USD" }
            }
          }
        }
      ],
      trialDays: 5,
      test: true,
    };

    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken
        },
        body: JSON.stringify({ query: mutation, variables })
      }
    );

    const result = await response.json();
    console.log("SW subscription result", JSON.stringify(result, null, 2));

    const data = result.data?.appSubscriptionCreate;

    if (data?.userErrors?.length) {
      return {
        status: 400,
        message: "Failed to create subscription",
        errors: data.userErrors
      };
    }

    return {
      status: 200,
      message: "Subscription created successfully",
      confirmationUrl: data.confirmationUrl,
      subscription: data.appSubscription
    };
  } catch (error) {
    console.error("Error creating subscription:", error);
    return {
      status: 500,
      message: "Failed to create subscription",
      error: error?.message || String(error)
    };
  }
}


 async getActiveSubscription(shopDomain, accessToken) {
  try {
    const query = `
      {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            trialDays
            lineItems {
              plan {
                pricingDetails {
                  __typename
                  ... on AppRecurringPricing {
                    interval
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query }),
      }
    );

    const result = await response.json();
    console.log(
      "SW what is result for get result",
      JSON.stringify(result, null, 2)
    );

    const subscriptions =
      result.data?.currentAppInstallation?.activeSubscriptions || [];
    console.log(
      "SW what subscriptions subscriptions",
      JSON.stringify(subscriptions, null, 2)
    );

    return {
      status: 200,
      message: "Fetched active subscriptions successfully",
      subscriptions,
    };
  } catch (error) {
    console.error("Error fetching active subscription:", error);
    return {
      status: 500,
      message: "Failed to fetch active subscription",
      error: error?.message || String(error),
    };
  }
}

  async cancelShopifySubscription(shopDomain, accessToken) {
    try {
      // First, get the active subscription ID
      const activeResult = await this.getActiveSubscription(shopDomain, accessToken);
      
      if (activeResult.status !== 200 || !activeResult.subscriptions || activeResult.subscriptions.length === 0) {
        return {
          status: 200,
          message: "No active subscription found to cancel",
        };
      }

      const subscriptionId = activeResult.subscriptions[0].id;
      
      const mutation = `
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        id: subscriptionId,
      };

      const response = await fetch(
        `https://${shopDomain}/admin/api/2024-10/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query: mutation, variables }),
        },
      );

      const result = await response.json();
      console.log("SW cancelShopifySubscription result:", JSON.stringify(result, null, 2));

      if (result.errors) {
        return {
          status: 500,
          message: "GraphQL errors occurred",
          errors: result.errors,
        };
      }

      const { appSubscriptionCancel } = result.data;

      if (appSubscriptionCancel.userErrors && appSubscriptionCancel.userErrors.length > 0) {
        return {
          status: 400,
          message: "Failed to cancel subscription",
          errors: appSubscriptionCancel.userErrors,
        };
      }

      return {
        status: 200,
        message: "Shopify subscription cancelled successfully",
        subscription: appSubscriptionCancel.appSubscription,
      };
    } catch (error) {
      console.error("Error cancelling Shopify subscription:", error);
      return {
        status: 500,
        message: "Failed to cancel Shopify subscription",
        error: error?.message || String(error),
      };
    }
  }

  async getSubscriptionWithUsage() {
    try {
      const subscription = await db.subscription.findUnique({
        where: {
          shopifyUrl: this.shopifyUrl,
        },
      });

      // Get current usage counts for B2B features
      const shop = await db.shop.findUnique({
        where: { shopDomain: this.shopifyUrl },
        select: { id: true }
      });

      if (!shop) {
        return {
          status: 404,
          message: "Shop not found",
        };
      }

      // Get current catalog count
      const catalogCount = await db.catalog.count({
        where: {
          shopId: shop.id,
        },
      });

      // Get current company count
      const companyCount = await db.company.count({
        where: {
          shopId: shop.id,
        },
      });

      // Get current month orders count
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const monthOrdersCount = await db.order.count({
        where: {
          shopId: shop.id,
          createdAt: { gte: monthStart }
        }
      });

      // Default limits for free plan
      const defaultLimits = {
        maxCatalogs: 1,
        maxCompanies: 5,
        maxOrders: 50,
        planName: "Free Plan",
        isActive: false,
      };

      const subscriptionData = subscription || defaultLimits;

      return {
        status: 200,
        subscription: subscriptionData,
        usage: {
          catalog_count: catalogCount,
          can_create_more_catalogs: catalogCount < (subscriptionData.maxCatalogs || 1),
          company_count: companyCount,
          can_create_more_companies: companyCount < (subscriptionData.maxCompanies || 5),
          month_orders_count: monthOrdersCount,
          orders_limit: subscriptionData.maxOrders || 50,
          can_process_more_orders: monthOrdersCount <= (subscriptionData.maxOrders || 50),
        },
      };
    } catch (error) {
      console.error("Error getting subscription with usage:", error);
      return {
        status: 500,
        message: "Failed to get subscription usage",
        error: error.message,
      };
    }
  }
}
