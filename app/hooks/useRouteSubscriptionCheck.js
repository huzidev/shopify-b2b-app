import { useLocation } from "react-router";
import { useEffect, useRef } from "react";
import { useSubscription } from "../contexts/SubscriptionContext";

export function useRouteSubscriptionCheck() {
  const location = useLocation();
  const { refresh, isLoading, lastChecked } = useSubscription();
  const lastPathnameRef = useRef(null);
  const lastCheckTimeRef = useRef(null);
  console.log("SW is route check running before use effect???");
  

  useEffect(() => {
    const currentPathname = location.pathname;
    const now = Date.now();
    
    // Only check if:
    // 1. Pathname actually changed
    // 2. Not currently loading
    // 3. At least 1 second has passed since last check (debounce)
    const shouldCheck = 
      currentPathname !== lastPathnameRef.current &&
      !isLoading &&
      (!lastCheckTimeRef.current || (now - lastCheckTimeRef.current) > 1000);

    if (shouldCheck) {
      console.log("🔄 Route changed from", lastPathnameRef.current, "to", currentPathname);
      
      // Update refs before calling refresh to prevent race conditions
      lastPathnameRef.current = currentPathname;
      lastCheckTimeRef.current = now;
      
      // Small delay to ensure page has settled
      const timeoutId = setTimeout(() => {
        refresh();
      }, 100);

      return () => clearTimeout(timeoutId);
    } else {
      // Update pathname ref even if we don't check, to track changes
      lastPathnameRef.current = currentPathname;
    }
  }, [location.pathname, refresh, isLoading]);

  // Also update check time when lastChecked changes
  useEffect(() => {
    if (lastChecked) {
      lastCheckTimeRef.current = new Date(lastChecked).getTime();
    }
  }, [lastChecked]);
}