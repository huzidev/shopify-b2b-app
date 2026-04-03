import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { SubscriptionProvider } from "../contexts/SubscriptionContext";
import { useRouteSubscriptionCheck } from "../hooks/useRouteSubscriptionCheck";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={{}}>
        <SubscriptionProvider>
          <AppContent />
        </SubscriptionProvider>
      </PolarisAppProvider>
    </AppProvider>
  );
}

function AppContent() {
  // Check subscription only on actual route changes
  // `useRouteSubscriptionCheck` is a hook and must be called at the top level of the component.
  // It internally watches the location pathname and applies debouncing.
  useRouteSubscriptionCheck();

  return (
    <>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/accounts">Accounts</s-link>
        <s-link href="/app/inventory">Inventory</s-link>
        <s-link href="/app/orders">Orders</s-link>
        <s-link href="/app/subscriptions">Plans</s-link>
      </s-app-nav>
      <Outlet />
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
