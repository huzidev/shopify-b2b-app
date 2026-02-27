import { useEffect, useState, useCallback } from "react";
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
  LegacyCard,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  IndexTable,
  IndexFilters,
  Modal,
  Box,
  useIndexResourceState,
  ChoiceList,
  useBreakpoints,
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
  const productIds = formData.get("productIds");
  const actionType = formData.get("actionType");

  try {
    // Handle bulk operations
    if (actionType === "bulkRemove" && productIds) {
      const ids = JSON.parse(productIds);
      let successCount = 0;
      let errors = [];
      
      for (const id of ids) {
        const result = await removeProductFromDatabase(session.shop, id);
        if (result.success) {
          successCount += result.deletedCount || 1;
        } else {
          errors.push(`Failed to remove product ${id}: ${result.error}`);
        }
      }
      
      const updatedStats = await getProductStats(session.shop);
      return {
        success: true,
        deletedCount: successCount,
        errors: errors.length > 0 ? errors : null,
        updatedStats,
      };
    }

    if (actionType === "bulkSync" && productIds) {
      const ids = JSON.parse(productIds);
      let successCount = 0;
      let errors = [];
      
      for (const id of ids) {
        const result = await syncSingleProduct(admin, session.shop, id);
        if (result.success) {
          successCount++;
        } else {
          errors.push(`Failed to sync product ${id}`);
        }
      }
      
      const updatedStats = await getProductStats(session.shop);
      return {
        success: true,
        syncedCount: successCount,
        errors: errors.length > 0 ? errors : null,
        updatedStats,
      };
    }

    // Handle single operations
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
  const [modalState, setModalState] = useState({ isOpen: false, type: null, productId: null, productIds: null, productTitle: null });
  const isLoading = fetcher.state === "submitting";

  // Search and filter state
  const [queryValue, setQueryValue] = useState('');
  const [syncStatus, setSyncStatus] = useState(undefined);
  const [sortSelected, setSortSelected] = useState(['title asc']);

  const resourceName = {
    singular: 'product',
    plural: 'products',
  };

  // Filter and search logic
  const filteredProducts = (productsWithStatus || []).filter((product) => {
    const matchesQuery = queryValue === '' || 
      product.title.toLowerCase().includes(queryValue.toLowerCase());
    
    const matchesSyncStatus = !syncStatus || syncStatus.length === 0 ||
      syncStatus.includes(product.syncStatus.toLowerCase().replace('_', ' '));
    
    return matchesQuery && matchesSyncStatus;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const [sortKey, direction] = sortSelected[0].split(' ');
    const isAscending = direction === 'asc';
    
    let aValue, bValue;
    switch (sortKey) {
      case 'title':
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
        break;
      case 'status':
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
        break;
      case 'syncStatus':
        aValue = a.syncStatus;
        bValue = b.syncStatus;
        break;
      default:
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
    }
    
    if (aValue < bValue) return isAscending ? -1 : 1;
    if (aValue > bValue) return isAscending ? 1 : -1;
    return 0;
  });

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(sortedProducts);

  const hasSelection = selectedResources.length > 0;
  const selectedProducts = (sortedProducts || []).filter(product => selectedResources.includes(product.id));
  const selectedSyncedProducts = (selectedProducts || []).filter(product => product.syncStatus === 'SYNCED');
  const selectedUnsyncedProducts = (selectedProducts || []).filter(product => product.syncStatus === 'NOT_SYNCED');

  // Filter handlers
  const handleFiltersQueryChange = useCallback(
    (value) => setQueryValue(value),
    [],
  );
  
  const handleSyncStatusChange = useCallback(
    (value) => setSyncStatus(value),
    [],
  );
  
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleSyncStatusRemove = useCallback(() => setSyncStatus(undefined), []);
  
  const handleFiltersClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleSyncStatusRemove();
  }, [handleQueryValueRemove, handleSyncStatusRemove]);

  // Sort options
  const sortOptions = [
    {label: 'Title', value: 'title asc', directionLabel: 'A-Z'},
    {label: 'Title', value: 'title desc', directionLabel: 'Z-A'},
    {label: 'Status', value: 'status asc', directionLabel: 'A-Z'},
    {label: 'Status', value: 'status desc', directionLabel: 'Z-A'},
    {label: 'Sync Status', value: 'syncStatus asc', directionLabel: 'Not Synced First'},
    {label: 'Sync Status', value: 'syncStatus desc', directionLabel: 'Synced First'},
  ];

  // Filters
  const filters = [
    {
      key: 'syncStatus',
      label: 'Sync status',
      filter: (
        <ChoiceList
          title="Sync status"
          titleHidden
          choices={[
            {label: 'Synced', value: 'synced'},
            {label: 'Not synced', value: 'not synced'},
          ]}
          selected={syncStatus || []}
          onChange={handleSyncStatusChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  // Applied filters
  const appliedFilters = [];
  if (syncStatus && syncStatus.length > 0) {
    const key = 'syncStatus';
    appliedFilters.push({
      key,
      label: `Sync status: ${syncStatus.join(', ')}`,
      onRemove: handleSyncStatusRemove,
    });
  }

  function isEmpty(value) {
    if (Array.isArray(value)) {
      return value.length === 0;
    } else {
      return value === '' || value == null;
    }
  }

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
      setModalState({ isOpen: false, type: null, productId: null, productIds: null, productTitle: null });
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
    };

    if (modalState.productId) {
      formData.productId = modalState.productId;
    }

    if (modalState.productIds) {
      formData.productIds = JSON.stringify(modalState.productIds);
    }

    fetcher.submit(formData, { method: "POST" });
  };

  const openModal = (type, productId, productTitle) => {
    setModalState({
      isOpen: true,
      type,
      productId,
      productIds: null,
      productTitle,
    });
  };

  const openBulkModal = (type, productIds) => {
    setModalState({
      isOpen: true,
      type,
      productId: null,
      productIds,
      productTitle: null,
    });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      type: null,
      productId: null,
      productIds: null,
      productTitle: null,
    });
  };

  const handleBulkRemove = () => {
    openBulkModal("bulkRemove", (selectedSyncedProducts || []).map(p => p.id));
  };

  const handleBulkSync = () => {
    openBulkModal("bulkSync", (selectedUnsyncedProducts || []).map(p => p.id));
  };

  return (
    <>
      <Page
        title="Product Sync"
        subtitle="Sync your Shopify products to the B2B system"
        backAction={{
          onAction: () => navigate("/app"),
        }}
        primaryAction={{
          content: isLoading ? "Syncing..." : "Sync All Products",
          onAction: handleSyncAll,
          loading: isLoading,
          disabled: isLoading,
        }}
        secondaryActions={[
          {
            content: `Remove Selected (${(selectedSyncedProducts || []).length})`,
            onAction: handleBulkRemove,
            disabled: (selectedSyncedProducts || []).length === 0 || isLoading,
            destructive: true,
          },
          {
            content: `Sync Selected (${(selectedUnsyncedProducts || []).length})`,
            onAction: handleBulkSync,
            disabled: (selectedUnsyncedProducts || []).length === 0 || isLoading,
          },
        ]}
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
            <LegacyCard>
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search products..."
                onQueryChange={handleFiltersQueryChange}
                onQueryClear={() => setQueryValue('')}
                onSort={setSortSelected}
                filters={filters}
                appliedFilters={appliedFilters}
                onClearAll={handleFiltersClearAll}
                tabs={[]}
              />
              <IndexTable
                condensed={useBreakpoints().smDown}
                resourceName={resourceName}
                itemCount={(sortedProducts || []).length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Title' },
                  { title: 'Status' },
                  { title: 'Sync Status' },
                  { title: 'Action' },
                ]}
              >
                {(sortedProducts || []).map((product, index) => (
                  <IndexTable.Row
                    id={product.id}
                    key={product.id}
                    selected={selectedResources.includes(product.id)}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="medium" as="span">
                        {product.title}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{product.status}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {product.syncStatus === "SYNCED" ? (
                        <Badge tone="success">SYNCED</Badge>
                      ) : (
                        <Badge tone="critical">NOT SYNCED</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {product.syncStatus === "SYNCED" ? (
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
                      )}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </LegacyCard>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>

    {/* Confirmation Modal */}
    <Modal
      open={modalState.isOpen}
      onClose={closeModal}
      title={
        modalState.type === "remove" 
          ? "Remove Product" 
          : modalState.type === "sync" 
          ? "Sync Product"
          : modalState.type === "bulkRemove"
          ? "Remove Selected Products"
          : "Sync Selected Products"
      }
      primaryAction={{
        content: 
          modalState.type === "remove" || modalState.type === "bulkRemove" 
            ? "Remove" 
            : "Sync Now",
        onAction: handleModalConfirm,
        destructive: modalState.type === "remove" || modalState.type === "bulkRemove",
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
              : modalState.type === "sync"
              ? `Are you sure you want to sync "${modalState.productTitle}" from Shopify to the database?`
              : modalState.type === "bulkRemove"
              ? `Are you sure you want to remove ${modalState.productIds?.length || 0} selected products from the database? This action cannot be undone.`
              : `Are you sure you want to sync ${modalState.productIds?.length || 0} selected products from Shopify to the database?`}
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
