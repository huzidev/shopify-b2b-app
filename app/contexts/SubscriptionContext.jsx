import React, { createContext, useContext, useState, useCallback } from 'react';
import { useFetcher } from 'react-router';

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const fetcher = useFetcher();

  // Refresh subscription data
  const refresh = useCallback(() => {
    if (isLoading) return; // Prevent multiple simultaneous calls
    
    console.log("🔄 Refreshing subscription data...", { fetcherState: fetcher.state });
    setIsLoading(true);
    
    fetcher.submit(
      { intent: 'getSubscription' },
      { method: 'post', action: '/app/subscriptions' }
    );
  }, [fetcher, isLoading]);

  // Handle fetcher state changes
  React.useEffect(() => {
    console.log("SW is subscription check running???");
    
    // Debug fetcher state transitions
    console.log('🔁 fetcher.state', fetcher.state, 'fetcher.data', fetcher.data);

    if (fetcher.state === 'idle' && fetcher.data) {
      setIsLoading(false);
      setLastChecked(new Date().toISOString());

      console.log('🔍 fetcher.data (raw):', JSON.stringify(fetcher.data, null, 2));

      if (fetcher.data.success && fetcher.data.subscription) {
        setSubscription(fetcher.data.subscription);
        setHasActiveSubscription(fetcher.data.subscription.status === 'ACTIVE');
        console.log("✅ Subscription data updated:", JSON.stringify(fetcher.data.subscription, null, 2));
      } else if (fetcher.data.success === false || (fetcher.data.success && !fetcher.data.subscription)) {
        // Only set no subscription if we got a successful response with no subscription
        setSubscription(null);
        setHasActiveSubscription(false);
        console.log("❌ No active subscription found (fetcher returned no subscription)");
      }
    } else if (fetcher.state === 'idle' && !fetcher.data && isLoading) {
      // Handle case where fetcher completes but no data - this might be an error
      setIsLoading(false);
      setLastChecked(new Date().toISOString());
      console.log('⚠️ fetcher completed with no data - might be an error');
    }
  }, [fetcher.state, fetcher.data, isLoading]);

  // Helper functions for subscription info
  const getSubscriptionInfo = useCallback(() => {
    if (!subscription) {
      return {
        planName: 'No Plan',
        maxCatalogs: 1,
        maxCompanies: 5,
        maxOrders: 50,
        expiresAt: null
      };
    }

    // Map subscription data to plan info
    return {
      planName: subscription.planName || subscription.name || 'Unknown Plan',
      maxCatalogs: subscription.maxCatalogs || 1,
      maxCompanies: subscription.maxCompanies || 5,
      maxOrders: subscription.maxOrders || 50,
      expiresAt: subscription.expiresAt || subscription.currentPeriodEnd || null
    };
  }, [subscription]);

  const isSubscriptionExpired = useCallback(() => {
    if (!subscription || !subscription.expiresAt) return false;
    return new Date(subscription.expiresAt) < new Date();
  }, [subscription]);

  const isValid = hasActiveSubscription && !isSubscriptionExpired();

  const subscriptionData = {
    subscription,
    isLoading: isLoading || fetcher.state !== 'idle',
    lastChecked,
    hasActiveSubscription,
    isValid,
    refresh,
    fetcher,
    getSubscriptionInfo,
    isSubscriptionExpired,
    error: fetcher.data?.error || null
  };

  // Trigger an initial client-side refresh when provider mounts so we have
  // subscription data after hydration (useEffect runs only on client).
  React.useEffect(() => {
    // Only refresh if we don't already have a subscription and not currently loading
    if (!subscription && !isLoading) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SubscriptionContext.Provider value={subscriptionData}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// HOC for components that need subscription data
export function withSubscription(Component) {
  return function WrappedComponent(props) {
    const subscription = useSubscription();
    return <Component {...props} subscription={subscription} />;
  };
}