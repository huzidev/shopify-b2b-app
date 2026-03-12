import React, { useState, useCallback } from "react";
import { useLoaderData, useNavigate, useParams, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { 
  getCollection, 
  updateProductPricing, 
  removeProductFromCollection, 
  addProductsToCollection,
  updateCollectionStatus,
  updateCollectionDiscount 
} from "../models/collection.server";
import { getAllProductsFromShopify } from "../models/product.server";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  DataTable,
  Banner,
  Modal,
  ResourceList,
  ResourceItem,
  Avatar,
  EmptyState,
  Tabs,
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";

// Helper function to parse Decimal objects from Prisma
const parseDecimal = (decimalObj) => {
  if (typeof decimalObj === 'number') {
    return decimalObj;
  }
  if (typeof decimalObj === 'string') {
    return parseFloat(decimalObj);
  }
  if (decimalObj && typeof decimalObj === 'object' && decimalObj.d) {
    // Handle Decimal.js format: {s: sign, e: exponent, d: digits}
    const digits = decimalObj.d;
    const exponent = decimalObj.e;
    const sign = decimalObj.s;
    
    if (Array.isArray(digits) && digits.length >= 2) {
      // Reconstruct the number from digits and exponent
      const wholeDigits = digits[0];
      const fractionalDigits = digits[1] || 0;
      const value = wholeDigits + (fractionalDigits / Math.pow(10, 7)); // Assuming 7 decimal places
      return sign * value;
    }
  }
  return 0;
};

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  
  const collection = await getCollection(session.shop, params.id);
  
  if (!collection) {
    return { 
      collection: null, 
      allProducts: [] 
    };
  }

  // Get all products for adding new ones
  const allProductsData = await getAllProductsFromShopify(admin);
  const allProducts = allProductsData?.edges?.map(edge => {
    const product = edge.node;
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      variants: product.variants?.edges?.map(variantEdge => {
        const variant = variantEdge.node;
        return {
          id: variant.id,
          sku: variant.sku || 'N/A',
          title: variant.title || 'Default Title',
          price: parseFloat(variant.price) || 0,
          inventoryQuantity: variant.inventoryQuantity || 0,
        };
      }) || []
    };
  }) || [];

  return { 
    collection,
    allProducts 
  };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "updateCollectionDiscount") {
      const discountPercentage = parseFloat(formData.get("discountPercentage")) || 0;
      
      const result = await updateCollectionDiscount(session.shop, params.id, discountPercentage);
      
      return { 
        success: result.success, 
        error: result.error || null,
        message: result.message || null 
      };
    }
    
    if (actionType === "updatePricing") {
      const variantId = formData.get("variantId");
      const discountedPrice = formData.get("discountedPrice");
      
      const result = await updateProductPricing(
        session.shop, 
        params.id, 
        variantId, 
        discountedPrice
      );
      
      return { success: result.success, error: result.error || null };
    }
    
    if (actionType === "removeProduct") {
      const variantId = formData.get("variantId");
      
      const result = await removeProductFromCollection(
        session.shop, 
        params.id, 
        variantId
      );
      
      return { success: result.success, error: result.error || null, action: "removeProduct" };
    }
    
    if (actionType === "addProducts") {
      const selectedProductsData = formData.get("selectedProducts");
      let selectedProducts = [];
      
      if (selectedProductsData) {
        try {
          selectedProducts = JSON.parse(selectedProductsData);
        } catch (e) {
          return {
            success: false,
            error: "Invalid product data format"
          };
        }
      }
      
      const result = await addProductsToCollection(
        session.shop, 
        params.id, 
        selectedProducts
      );
      
      return { success: result.success, error: result.error || null, action: "addProducts" };
    }
    
    if (actionType === "updateStatus") {
      const status = formData.get("status");
      
      const result = await updateCollectionStatus(session.shop, params.id, status);
      
      return { success: result.success, error: result.error || null, action: "updateStatus" };
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function AppCollectionId() {
  const { collection, allProducts } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const params = useParams();

  // States
  const [editingPrices, setEditingPrices] = useState({});
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [collectionDiscountPercentage, setCollectionDiscountPercentage] = useState(
    collection ? parseDecimal(collection.discount) : 0
  );

  // Confirmation modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteVariantId, setDeleteVariantId] = useState(null);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  // Handle action results
  React.useEffect(() => {
    if (fetcher.data?.success) {
      let message = fetcher.data.message || "Action completed successfully!";
      if (fetcher.data.action === "removeProduct") {
        message = "Product removed from collection";
        setShowDeleteConfirm(false);
        setDeleteVariantId(null);
      } else if (fetcher.data.action === "addProducts") {
        message = "Products added to collection";
        setShowAddProductModal(false);
        setSelectedProducts([]);
      } else if (fetcher.data.action === "updateStatus") {
        message = "Collection status updated";
        setShowStatusConfirm(false);
      }
      shopify.toast.show(message);
      setEditingPrices({});
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  if (!collection) {
    return (
      <Page 
        title="Collection Not Found"
        breadcrumbs={[{ content: 'Collections', url: '/app/collections' }]}
      >
        <EmptyState
          heading="Collection not found"
          description="The collection you're looking for doesn't exist or has been deleted."
          action={{
            content: 'View Collections',
            onAction: () => navigate('/app/collections')
          }}
        />
      </Page>
    );
  }

  // Filter available products — exclude variants already in collection
  const existingVariantIds = new Set(collection.products.map(p => p.variantId));
  const availableProducts = allProducts
    .map(product => ({
      ...product,
      variants: product.variants.filter(variant => !existingVariantIds.has(variant.id))
    }))
    .filter(product => 
      product.variants.length > 0 &&
      (product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       product.variants.some(variant => 
         variant.sku.toLowerCase().includes(searchTerm.toLowerCase())
       ))
    );

  // Handle price editing
  const handlePriceEdit = useCallback((variantId, price) => {
    setEditingPrices(prev => ({
      ...prev,
      [variantId]: price
    }));
  }, []);

  const handlePriceSave = useCallback((variantId) => {
    const newPrice = editingPrices[variantId];
    if (newPrice !== undefined && newPrice !== null) {
      const formData = new FormData();
      formData.append("actionType", "updatePricing");
      formData.append("variantId", variantId);
      formData.append("discountedPrice", newPrice.toString());
      
      fetcher.submit(formData, { method: "POST" });
    }
  }, [editingPrices, fetcher]);

  // Handle product removal with confirmation
  const handleRemoveClick = useCallback((variantId) => {
    setDeleteVariantId(variantId);
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (deleteVariantId) {
      const formData = new FormData();
      formData.append("actionType", "removeProduct");
      formData.append("variantId", deleteVariantId);
      
      fetcher.submit(formData, { method: "POST" });
    }
  }, [deleteVariantId, fetcher]);

  // Handle status change with confirmation
  const handleStatusToggle = useCallback(() => {
    setShowStatusConfirm(true);
  }, []);

  const handleConfirmStatusChange = useCallback(() => {
    const newStatus = collection.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const formData = new FormData();
    formData.append("actionType", "updateStatus");
    formData.append("status", newStatus);
    
    fetcher.submit(formData, { method: "POST" });
  }, [collection.status, fetcher]);

  // Handle collection-wide discount change
  const handleCollectionDiscountUpdate = useCallback(() => {
    const formData = new FormData();
    formData.append("actionType", "updateCollectionDiscount");
    formData.append("discountPercentage", collectionDiscountPercentage.toString());
    
    fetcher.submit(formData, { method: "POST" });
  }, [collectionDiscountPercentage, fetcher]);

  // Handle product selection for adding — auto-apply collection discount
  const handleProductSelect = useCallback((product, variant) => {
    const productId = product.id;
    const variantId = variant.id;

    const isAlreadySelected = selectedProducts.some(item => item.variantId === variantId);
    if (isAlreadySelected) {
      shopify.toast.show("This product variant is already selected", { isError: true });
      return;
    }

    const discount = collectionDiscountPercentage || 0;
    const discountedPrice = variant.price * (1 - discount / 100);

    const newProduct = {
      productId,
      variantId,
      productTitle: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      originalPrice: variant.price,
      discountedPrice,
      currency: "USD"
    };

    setSelectedProducts(prev => [...prev, newProduct]);
  }, [selectedProducts, collectionDiscountPercentage]);

  // Handle adding selected products
  const handleAddProducts = useCallback(() => {
    if (selectedProducts.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "addProducts");
    formData.append("selectedProducts", JSON.stringify(selectedProducts));
    
    fetcher.submit(formData, { method: "POST" });
  }, [selectedProducts, fetcher]);

  // Table rows for collection products
  const tableRows = collection.products.map((product) => {
    const variantId = product.variantId;
    const isEditing = editingPrices.hasOwnProperty(variantId);
    
    const originalPrice = parseDecimal(product.originalPrice);
    const discountedPrice = parseDecimal(product.discountedPrice);
    const currentPrice = isEditing ? editingPrices[variantId] : discountedPrice;
    const hasDiscount = discountedPrice < originalPrice;

    return [
      <Text key={`title-${variantId}`} fontWeight="semibold">{product.productTitle}</Text>,
      <Text key={`variant-${variantId}`}>{product.variantTitle}</Text>,
      <Text key={`sku-${variantId}`}>{product.sku}</Text>,
      <Text key={`original-${variantId}`}>${originalPrice.toFixed(2)}</Text>,
      <InlineStack key={`discounted-${variantId}`} gap="200" align="center">
        {isEditing ? (
          <>
            <TextField
              type="number"
              step="0.01"
              min="0"
              value={currentPrice.toString()}
              onChange={(value) => handlePriceEdit(variantId, parseFloat(value) || 0)}
              prefix="$"
              autoComplete="off"
            />
            <Button 
              size="slim" 
              variant="primary"
              onClick={() => handlePriceSave(variantId)}
              loading={fetcher.state === "submitting"}
            >
              Save
            </Button>
            <Button 
              size="slim"
              onClick={() => setEditingPrices(prev => {
                const updated = { ...prev };
                delete updated[variantId];
                return updated;
              })}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Text>${discountedPrice.toFixed(2)}</Text>
            {hasDiscount && <Badge tone="success">Discounted</Badge>}
          </>
        )}
      </InlineStack>,
      <InlineStack key={`actions-${variantId}`} gap="200">
        <Button
          icon={DeleteIcon}
          size="slim"
          variant="tertiary"
          tone="critical"
          onClick={() => handleRemoveClick(variantId)}
          accessibilityLabel="Remove from collection"
        />
      </InlineStack>
    ];
  });

  // Tabs
  const tabs = [
    {
      id: 'products',
      content: `Products (${collection.products.length})`,
      panelID: 'products-panel',
    },
    {
      id: 'settings',
      content: 'Settings',
      panelID: 'settings-panel',
    },
  ];

  return (
    <Page
      title={collection.title}
      titleMetadata={
        <Badge tone={collection.status === 'ACTIVE' ? 'success' : 'critical'}>
          {collection.status.charAt(0).toUpperCase() + collection.status.slice(1).toLowerCase()}
        </Badge>
      }
      backAction={{
        onAction: () => navigate("/app/collections"),
      }}
      primaryAction={{
        content: 'Add Products',
        icon: PlusIcon,
        onAction: () => setShowAddProductModal(true)
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted>
              <Box paddingBlockStart="200">
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">Collection Products</Text>
                      <Button 
                        icon={PlusIcon}
                        onClick={() => setShowAddProductModal(true)}
                        variant="primary"
                      >
                        Add Products
                      </Button>
                    </InlineStack>

                    {collection.products.length === 0 ? (
                      <EmptyState
                        heading="No products in this collection"
                        description="Add products to start building your collection"
                        action={{
                          content: 'Add Products',
                          onAction: () => setShowAddProductModal(true)
                        }}
                      />
                    ) : (
                      <>
                        <Banner tone="info">
                          <Text>
                            You can edit product prices directly in the table. 
                            Changes will be reflected in your collection immediately.
                          </Text>
                        </Banner>
                        
                        <DataTable
                          columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'text']}
                          headings={['Product', 'Variant', 'SKU', 'Original Price', 'Collection Price', 'Actions']}
                          rows={tableRows}
                        />
                      </>
                    )}
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd">Collection Settings</Text>

                    <InlineStack gap="800" align="start" wrap>
                      {/* Status Section */}
                      <BlockStack gap="200">
                        <Text variant="headingSm">Status</Text>
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={collection.status === 'ACTIVE' ? 'success' : 'critical'}>
                            {collection.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button
                            variant="primary"
                            tone={collection.status === 'ACTIVE' ? "critical" : undefined}
                            onClick={handleStatusToggle}
                            loading={fetcher.state === "submitting"}
                          >
                            {collection.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </Button>
                        </InlineStack>
                      </BlockStack>

                      {/* Discount Section */}
                      <BlockStack gap="200">
                        <Text variant="headingSm">Discount</Text>
                        <InlineStack gap="300" blockAlign="end">
                          <Box width="160px">
                            <TextField
                              label=""
                              labelHidden
                              type="number"
                              value={collectionDiscountPercentage.toString()}
                              onChange={(value) => setCollectionDiscountPercentage(parseFloat(value) || 0)}
                              suffix="%"
                              min="0"
                              max="100"
                              step="1"
                              autoComplete="off"
                            />
                          </Box>
                          <Button
                            variant="primary"
                            onClick={handleCollectionDiscountUpdate}
                            loading={fetcher.state === "submitting"}
                            disabled={collectionDiscountPercentage < 0 || collectionDiscountPercentage > 100}
                          >
                            Apply Discount
                          </Button>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">
                          Current discount: {parseDecimal(collection.discount)}% — Applied to all {collection.products.length} product{collection.products.length !== 1 ? 's' : ''}
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <Divider />
                    
                    <BlockStack gap="200">
                      <Text variant="headingSm">Collection Information</Text>
                      <Text><strong>Title:</strong> {collection.title}</Text>
                      <Text><strong>Description:</strong> {collection.description || "No description"}</Text>
                      <Text><strong>Created:</strong> {new Date(collection.createdAt).toLocaleDateString()}</Text>
                      <Text><strong>Last Updated:</strong> {new Date(collection.updatedAt).toLocaleDateString()}</Text>
                      <Text><strong>Total Products:</strong> {collection.products.length}</Text>
                    </BlockStack>
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Product Confirmation Modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteVariantId(null);
        }}
        title="Remove Product"
        primaryAction={{
          content: 'Remove',
          destructive: true,
          onAction: handleConfirmRemove,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setShowDeleteConfirm(false);
              setDeleteVariantId(null);
            }
          },
        ]}
      >
        <Modal.Section>
          <Text>Are you sure you want to remove this product from the collection? This action cannot be undone.</Text>
        </Modal.Section>
      </Modal>

      {/* Status Change Confirmation Modal */}
      <Modal
        open={showStatusConfirm}
        onClose={() => setShowStatusConfirm(false)}
        title={collection.status === 'ACTIVE' ? "Deactivate Collection" : "Activate Collection"}
        primaryAction={{
          content: collection.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
          destructive: collection.status === 'ACTIVE',
          onAction: handleConfirmStatusChange,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setShowStatusConfirm(false)
          },
        ]}
      >
        <Modal.Section>
          <Text>
            {collection.status === 'ACTIVE'
              ? "Are you sure you want to deactivate this collection? It will no longer be visible to customers."
              : "Are you sure you want to activate this collection? It will become visible to customers."}
          </Text>
        </Modal.Section>
      </Modal>

      {/* Add Products Modal */}
      <Modal
        open={showAddProductModal}
        onClose={() => {
          setShowAddProductModal(false);
          setSelectedProducts([]);
          setSearchTerm("");
        }}
        title="Add Products to Collection"
        primaryAction={{
          content: `Add ${selectedProducts.length} Product${selectedProducts.length !== 1 ? 's' : ''}`,
          onAction: handleAddProducts,
          disabled: selectedProducts.length === 0,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setShowAddProductModal(false);
              setSelectedProducts([]);
              setSearchTerm("");
            }
          },
        ]}
        large
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Search products"
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by product title or SKU"
              clearButton
              onClearButtonClick={() => setSearchTerm("")}
            />

            {collectionDiscountPercentage > 0 && (
              <Banner tone="info">
                <Text>
                  A {collectionDiscountPercentage}% discount will be automatically applied to added products.
                </Text>
              </Banner>
            )}

            {selectedProducts.length > 0 && (
              <Banner>
                <Text>
                  {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                </Text>
              </Banner>
            )}

            {availableProducts.length === 0 ? (
              <EmptyState
                heading="No products available"
                description="All available products are already in this collection or no products match your search"
              />
            ) : (
              <Box maxHeight="400px" style={{ overflowY: 'auto' }}>
                <ResourceList
                  items={availableProducts}
                  renderItem={(product) => (
                    <ResourceItem
                      id={product.id}
                      media={
                        <Avatar
                          shape="square"
                          size="md"
                          name={product.title}
                        />
                      }
                    >
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="semibold">
                          {product.title}
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Status: <Badge status={product.status === 'ACTIVE' ? 'success' : 'attention'}>
                            {product.status}
                          </Badge>
                        </Text>
                        
                        {product.variants.length > 0 && (
                          <BlockStack gap="100">
                            <Text variant="bodySm" fontWeight="semibold">Variants:</Text>
                            {product.variants.map((variant) => {
                                const isSelected = selectedProducts.some(p => p.variantId === variant.id);
                                const discountedPrice = collectionDiscountPercentage > 0
                                  ? variant.price * (1 - collectionDiscountPercentage / 100)
                                  : variant.price;
                                
                                return (
                                  <InlineStack key={variant.id} align="space-between">
                                    <BlockStack gap="050">
                                      <Text variant="bodySm">
                                        {variant.title} - SKU: {variant.sku}
                                      </Text>
                                      <Text variant="bodySm" color="subdued">
                                        Price: ${variant.price.toFixed(2)}
                                        {collectionDiscountPercentage > 0 && (
                                          <>{' '}→ ${discountedPrice.toFixed(2)}</>
                                        )}
                                        {' '}| Stock: {variant.inventoryQuantity}
                                      </Text>
                                    </BlockStack>
                                    <Button
                                      size="slim"
                                      variant={isSelected ? "primary" : "secondary"}
                                      onClick={() => handleProductSelect(product, variant)}
                                      disabled={isSelected}
                                    >
                                      {isSelected ? 'Selected' : 'Select'}
                                    </Button>
                                  </InlineStack>
                                );
                              })}
                          </BlockStack>
                        )}
                      </BlockStack>
                    </ResourceItem>
                  )}
                />
              </Box>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
