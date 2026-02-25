import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, Link, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  syncProductsToDatabase,
  getProductStats,
  syncSingleProduct,
  removeProductFromDatabase,
  getProductsWithSyncStatus,
} from "../models/product.server";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  DataTable,
  Modal,
  Box,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const stats = await getProductStats(session.shop);
  const productsWithStatus = await getProductsWithSyncStatus(admin, session.shop);

  return {
    stats,
    shop: session.shop,
    productsWithStatus,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");
  const actionType = formData.get("actionType");

  try {
    if (actionType === "remove" && productId) {
      const result = await removeProductFromDatabase(session.shop, productId);
      if (result.success) {
        const updatedStats = await getProductStats(session.shop);
        return { ...result, updatedStats };
      }
      return result;
    }

    if (actionType === "sync" && productId) {
      const result = await syncSingleProduct(admin, session.shop, productId);
      if (result.success) {
        const updatedStats = await getProductStats(session.shop);
        return { ...result, updatedStats };
      }
      return result;
    }

    // Sync all products
    const result = await syncProductsToDatabase(admin, session.shop);
    if (result.success) {
      const updatedStats = await getProductStats(session.shop);
      return { ...result, updatedStats };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

// Stat Card component mimicking Polaris Card with metric layout
function StatCard({ label, value, trend, trendType }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="bodyMd" tone="subdued">
          {label}
        </Text>
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {value}
        </Text>
        <Text variant="bodySm" as="p" tone={trendType === "success" ? "success" : trendType === "warning" ? "caution" : "subdued"}>
          {trend}
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function AppProductSync() {
  const { stats, productsWithStatus } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [currentStats, setCurrentStats] = useState(stats);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, productId: null, productTitle: null });
  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      let message = "Operation completed successfully!";
      if (fetcher.data.syncedCount) {
        message = `Successfully synced ${fetcher.data.syncedCount} products!`;
      } else if (fetcher.data.deletedCount) {
        message = `Successfully removed ${fetcher.data.deletedCount} product(s)!`;
      }
      
      shopify.toast.show(message);
      
      // Update stats with the real updated stats from the action
      if (fetcher.data.updatedStats) {
        setCurrentStats(fetcher.data.updatedStats);
      }
      
      // Close modal after successful action
      setModalState({ isOpen: false, type: null, productId: null, productTitle: null });
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, {
        isError: true,
      });
    }
  }, [fetcher.data, shopify]);

  const handleSyncAll = () => {
    fetcher.submit({}, { method: "POST" });
  };

  const handleModalConfirm = () => {
    const formData = {
      actionType: modalState.type,
      productId: modalState.productId,
    };
    fetcher.submit(formData, { method: "POST" });
  };

  const openModal = (type, productId, productTitle) => {
    setModalState({
      isOpen: true,
      type,
      productId,
      productTitle,
    });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      type: null,
      productId: null,
      productTitle: null,
    });
  };

  return (
    <>
      <Page
        title="Product Sync"
        subtitle="Sync your Shopify products to the B2B system"
        backAction={{
          content: "Back to Dashboard",
          url: "/app",
        }}
        primaryAction={{
          content: isLoading ? "Syncing..." : "Sync All Products",
          onAction: handleSyncAll,
          loading: isLoading,
          disabled: isLoading,
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
            <Text variant="headingMd" as="h2">
              Current Database Stats
            </Text>
            <InlineStack>
              <Box width="50%">
                <StatCard
                  label="Products Stored"
                  value={currentStats.productCount.toString()}
                  trend={currentStats.productCount > 0 ? "Products in database" : "No products stored"}
                  trendType={currentStats.productCount > 0 ? "success" : "subdued"}
                />
              </Box>
              <Box width="50%">
                <StatCard
                  label="Variants Stored"
                  value={currentStats.variantCount.toString()}
                  trend={currentStats.variantCount > 0 ? "Variants in database" : "No variants stored"}
                  trendType={currentStats.variantCount > 0 ? "success" : "subdued"}
                />
              </Box>
            </InlineStack>

            {/* Sync Action */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" fontWeight="semibold">
                  Sync Products from Shopify
                </Text>
                <Text tone="subdued">
                  This will fetch all products from your Shopify store and save
                  them to the B2B database. Existing products will be updated
                  with the latest information.
                </Text>
              </BlockStack>
            </Card>

            {/* Product Table */}
            <Card>
              <BlockStack spacing="tight">
                <Text size="medium" fontWeight="semibold">
                  Shopify Products
                </Text>

                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Title", "Status", "Sync Status", "Action"]}
                  rows={productsWithStatus.map((product) => [
                    product.title,
                    product.status,
                    product.syncStatus === "SYNCED" ? (
                      <Badge tone="success">SYNCED</Badge>
                    ) : (
                      <Badge tone="critical">NOT SYNCED</Badge>
                    ),
                    product.syncStatus === "SYNCED" ? (
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => openModal("remove", product.id, product.title)}
                        disabled={isLoading}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="slim"
                        onClick={() => openModal("sync", product.id, product.title)}
                        disabled={isLoading}
                      >
                        Sync Now
                      </Button>
                    ),
                  ])}
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>

    {/* Confirmation Modal */}
    <Modal
      open={modalState.isOpen}
      onClose={closeModal}
      title={modalState.type === "remove" ? "Remove Product" : "Sync Product"}
      primaryAction={{
        content: modalState.type === "remove" ? "Remove" : "Sync Now",
        onAction: handleModalConfirm,
        destructive: modalState.type === "remove",
        loading: isLoading,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: closeModal,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p">
            {modalState.type === "remove"
              ? `Are you sure you want to remove "${modalState.productTitle}" from the database? This action cannot be undone.`
              : `Are you sure you want to sync "${modalState.productTitle}" from Shopify to the database?`}
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
