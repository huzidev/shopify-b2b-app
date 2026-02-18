import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, Link, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { syncProductsToDatabase, getProductStats } from "../models/product.server";
import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  Text, 
  BlockStack,
  InlineStack,
  Badge,
  Banner
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const stats = await getProductStats(session.shop);
  
  return {
    stats,
    shop: session.shop
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const result = await syncProductsToDatabase(admin, session.shop);
    
    console.log("SW what is result", result);

    if (result.success) {
      // Get updated stats after sync
      const updatedStats = await getProductStats(session.shop);
      return {
        success: result.success,
        syncedCount: result.syncedCount,
        updatedStats,
        error: result.error
      };
    }
    
    return {
      success: result.success,
      syncedCount: result.syncedCount,
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

export default function AppProductSync() {
  const { stats } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [currentStats, setCurrentStats] = useState(stats);
  const isLoading = fetcher.state === "submitting";
  
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(`Successfully synced ${fetcher.data.syncedCount} products!`);
      // Update stats with the real updated stats from the action
      if (fetcher.data.updatedStats) {
        setCurrentStats(fetcher.data.updatedStats);
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error syncing products: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSync = () => {
    fetcher.submit({}, { method: "POST" });
  };

  return (
    <Page 
      title="Product Sync" 
      subtitle="Sync your Shopify products to the B2B system"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack vertical spacing="loose">

            {/* Error Banner */}
            {fetcher.data?.error && (
              <Banner status="critical">
                <Text as="p">Error syncing products: {fetcher.data.error}</Text>
              </Banner>
            )}

            {/* Database Stats */}
            <Card sectioned>
              <BlockStack vertical spacing="tight">
                <Text size="small" fontWeight="semibold">
                  Current Database Stats
                </Text>
                <InlineStack spacing="extraLoose">
                  <Badge status="info">{currentStats.productCount} Products Stored</Badge>
                  <Badge status="success">{currentStats.variantCount} Variants Stored</Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Sync Action */}
            <Card sectioned>
              <BlockStack vertical spacing="tight">
                <Text size="small" fontWeight="semibold">Sync Products from Shopify</Text>
                <Text subdued>
                  This will fetch all products from your Shopify store and save them to the B2B database.
                  Existing products will be updated with the latest information.
                </Text>
                <div style={{ textAlign: "right" }}>
                  <Button 
                    primary 
                    onClick={handleSync} 
                    loading={isLoading}
                    disabled={isLoading}
                  >
                    {isLoading ? "Syncing Products..." : "Sync All Products"}
                  </Button>
                </div>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
