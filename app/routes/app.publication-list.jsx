import { useState, useEffect, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Modal,
  TextField,
  Select,
  Badge,
  DataTable,
  Banner,
  BlockStack,
  InlineStack,
  Tabs
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { 
  getPublications, 
  createPublication, 
  addFixedPrices,
  updatePublication
} from "../models/publicationList.server";
import { getPriceLists } from "../models/priceList.server";
import { useAppBridge } from '@shopify/app-bridge-react';

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    
    const [publications, priceLists] = await Promise.all([
      getPublications(session.shop),
      getPriceLists(session.shop)
    ]);

    console.log("SW what is publications", publications);
    console.log("SW what is priceLists", priceLists);
    
    
    return { publications, priceLists };
  } catch (error) {
    console.error("Error loading publications/priceLists:", error);
    return { 
      publications: [], 
      priceLists: [],
      error: error.message 
    };
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "createPublication") {
      const catalogId = formData.get("catalogId");
      const title = formData.get("title");
      const defaultState = formData.get("defaultState");
      const autoPublish = formData.get("autoPublish") === "true";
      
      return await createPublication({
        admin,
        shop: session.shop,
        catalogId: catalogId ? parseInt(catalogId) : null,
        title,
        defaultState,
        autoPublish
      });
    }
    
    if (actionType === "fetchProductDetails") {
      const productIds = JSON.parse(formData.get("productIds") || "[]");
      
      if (productIds.length === 0) {
        return { success: true, products: [] };
      }
      
      // Create GraphQL query to fetch product details
      const productQueries = productIds.map((id, index) => {
        return `
          product${index}: product(id: "${id}") {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
          }
        `;
      }).join('\n');
      
      const query = `#graphql
        query getProductDetails {
          ${productQueries}
        }
      `;
      
      try {
        const response = await admin.graphql(query);
        const data = await response.json();
        
        // Convert the response object to an array of products
        const products = Object.values(data.data).filter(product => product !== null);
        
        return { success: true, products };
      } catch (error) {
        console.error('Error fetching product details:', error);
        return { success: false, error: 'Failed to fetch product details' };
      }
    }
    
    if (actionType === "updatePublication") {
      const publicationId = formData.get("publicationId");
      const publishablesToAdd = JSON.parse(formData.get("publishablesToAdd") || "[]");
      const publishablesToRemove = JSON.parse(formData.get("publishablesToRemove") || "[]");
      
      return await updatePublication({
        admin,
        shop: session.shop,
        publicationId,
        publishablesToAdd,
        publishablesToRemove
      });
    }
    
    if (actionType === "addFixedPrices") {
      const priceListId = formData.get("priceListId");
      const prices = JSON.parse(formData.get("prices"));
      
      return await addFixedPrices({
        admin,
        shop: session.shop,
        priceListId,
        prices
      });
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Error in action:", error);
    return { success: false, error: error.message };
  }
};

export default function AppPublicationList() {
  const fetcher = useFetcher();
  const { publications, priceLists } = useLoaderData();
  const isLoading = fetcher.state === "submitting";
  const app = useAppBridge();

  const [selectedTab, setSelectedTab] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("publication"); // "publication", "prices", "addProducts", "removeProducts"
  const [selectedPublication, setSelectedPublication] = useState(null);
  const [selectedProductsForAdd, setSelectedProductsForAdd] = useState([]);
  const [productsToRemove, setProductsToRemove] = useState([]);
  const [productDetails, setProductDetails] = useState([]); // Store fetched product details
  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [formData, setFormData] = useState({
    catalogId: "",
    title: "",
    defaultState: "ALL_PRODUCTS",
    autoPublish: false,
    priceListId: "",
    variantId: "",
    price: "",
    compareAtPrice: "",
    currency: "USD",
    selectedProducts: []
  });

  useEffect(() => {
    if (fetcher.data?.success) {
      // Handle product details fetch
      if (fetcher.data?.products && modalType === "removeProducts") {
        setProductDetails(fetcher.data.products);
        setFetchingProducts(false);
        return;
      }
      
      // Clear modal loading state
      setModalLoading(false);
      
      // Check if this was a publication update (products added/removed)
      if (fetcher.data?.publication) {
        // Show success message for managing products
        if (app?.toast) {
          if (modalType === "addProducts") {
            app.toast.show('Products successfully added to publication!');
          } else if (modalType === "removeProducts") {
            app.toast.show('Products successfully removed from publication!');
          } else {
            app.toast.show('Products successfully updated in publication!');
          }
        }
      } else {
        // Show success message for publication creation
        if (app?.toast) {
          app.toast.show('Publication created successfully!');
        }
      }
      
      // Close modal and reset states
      setModalOpen(false);
      setSelectedPublication(null);
      setSelectedProductsForAdd([]);
      setProductsToRemove([]);
      setProductDetails([]);
      setFetchingProducts(false);
      setFormData({
        catalogId: "",
        title: "",
        defaultState: "ALL_PRODUCTS",
        autoPublish: false,
        priceListId: "",
        variantId: "",
        price: "",
        compareAtPrice: "",
        currency: "USD",
        selectedProducts: []
      });
    } else if (fetcher.data?.error) {
      // Clear modal loading state on error
      setModalLoading(false);
      
      // Show error message
      if (app?.toast) {
        app.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
      }
    }
  }, [fetcher.data, app, modalType]);

  const handleAddProducts = useCallback(async (publication) => {
    if (!app) {
      console.error('App Bridge not available');
      return;
    }

    try {
      // Open product picker for adding new products (no pre-selection)
      const selected = await app.resourcePicker({
        type: 'product',
        multiple: true,
        // filter: {
        //   query: 'status:active AND tag:featured',
        // },
      });
      
      console.log("SW selected products to add:", selected);

      if (selected && selected.length > 0) {
        // Get existing products to filter out already added ones
        const existingProducts = publication.products || [];
        console.log("SW existing products:", existingProducts);
        const existingProductIds = existingProducts.map(p => p.productId);
        
        // Only add products that aren't already in the publication
        const publishablesToAdd = selected.filter(product => !existingProductIds.includes(product.id));
        
        if (publishablesToAdd.length > 0) {
          setSelectedPublication(publication);
          setSelectedProductsForAdd(publishablesToAdd);
          setModalType("addProducts");
          setModalOpen(true);
        } else {
          if (app?.toast) {
            app.toast.show('All selected products are already in this publication.');
          }
        }
      }

    } catch (error) {
      console.error('Error opening product picker:', error);
      if (error.message !== 'User cancelled resource selection') {
        if (app?.toast) {
          app.toast.show('Unable to open product picker. Please try again.', { isError: true });
        }
      }
    }
  }, [app]);

  const handleRemoveProducts = useCallback(async (publication) => {
    const existingProducts = publication.products || [];
    
    if (existingProducts.length === 0) {
      if (app?.toast) {
        app.toast.show('No products in this publication to remove.');
      }
      return;
    }

    setSelectedPublication(publication);
    setProductsToRemove([...existingProducts.map(p => p.productId)]); // Initially all products selected for removal
    setModalType("removeProducts");
    setModalOpen(true);
    setFetchingProducts(true);
    
    // Fetch product details via GraphQL
    const productIds = existingProducts.map(p => p.productId);
    
    try {
      const response = await fetcher.submit({
        actionType: "fetchProductDetails",
        productIds: JSON.stringify(productIds)
      }, { method: "POST" });
      
      // The response will be handled in the useEffect
    } catch (error) {
      console.error('Error fetching product details:', error);
      setFetchingProducts(false);
    }
  }, [app, fetcher]);

  const handleCreatePublication = () => {
    setModalType("publication");
    setModalOpen(true);
  };

  const handleManagePrices = () => {
    setModalType("prices");
    setModalOpen(true);
  };

  const handleSubmit = () => {
    if (modalType === "publication") {
      fetcher.submit({
        actionType: "createPublication",
        ...formData
      }, { method: "POST" });
    } else if (modalType === "prices") {
      const prices = [{
        variantId: formData.variantId,
        price: {
          amount: formData.price,
          currencyCode: formData.currency
        },
        compareAtPrice: formData.compareAtPrice ? {
          amount: formData.compareAtPrice,
          currencyCode: formData.currency
        } : undefined
      }];
      
      fetcher.submit({
        actionType: "addFixedPrices",
        priceListId: formData.priceListId,
        prices: JSON.stringify(prices)
      }, { method: "POST" });
    } else if (modalType === "addProducts") {
      setModalLoading(true);
      const publishablesToAdd = selectedProductsForAdd.map(product => product.id);
      
      fetcher.submit({
        actionType: "updatePublication",
        publicationId: selectedPublication.id.toString(),
        publishablesToAdd: JSON.stringify(publishablesToAdd),
        publishablesToRemove: JSON.stringify([])
      }, { method: "POST" });
    } else if (modalType === "removeProducts") {
      setModalLoading(true);
      const existingProductIds = selectedPublication.products.map(p => p.productId);
      const publishablesToRemove = existingProductIds.filter(id => productsToRemove.includes(id));
      
      fetcher.submit({
        actionType: "updatePublication",
        publicationId: selectedPublication.id.toString(),
        publishablesToAdd: JSON.stringify([]),
        publishablesToRemove: JSON.stringify(publishablesToRemove)
      }, { method: "POST" });
    }
  };

  const tabs = [
    {
      id: 'publications',
      content: 'Publications',
      accessibilityLabel: 'Publications',
      panelID: 'publications-panel',
    },
    {
      id: 'price-management',
      content: 'Price Management',
      accessibilityLabel: 'Price Management',
      panelID: 'price-management-panel',
    }
  ];

  const publicationRows = publications?.map(publication => [
    publication.title || "Untitled Publication",
    publication.catalog?.title || "No Catalog", 
    <Badge key={publication.id} status={publication.defaultState === "ALL_PRODUCTS" ? "success" : "attention"}>
      {publication.defaultState}
    </Badge>,
    publication.autoPublish ? "Yes" : "No",
    <InlineStack key={`action-${publication.id}`} gap="2" align="center" wrap={false}>
      <Text variant="bodySm" tone="subdued">
        {publication.products?.length || 0} product{(publication.products?.length || 0) === 1 ? '' : 's'}
      </Text>
      <Button 
        size="slim" 
        onClick={() => handleAddProducts(publication)}
      >
        Add Products
      </Button>
      <Button 
        size="slim" 
        variant="secondary"
        tone="critical"
        onClick={() => handleRemoveProducts(publication)}
        disabled={(publication.products?.length || 0) === 0}
      >
        Remove Products
      </Button>
    </InlineStack>
  ]) || [];

  const renderPublicationsTab = () => (
    <BlockStack gap="4">
      <InlineStack align="space-between">
        <Text variant="headingMd" as="h2">Publications</Text>
        <Button primary onClick={handleCreatePublication}>
          Create Publication
        </Button>
      </InlineStack>

      <Card>
        <DataTable
          columnContentTypes={['text', 'text', 'text', 'text', 'text']}
          headings={['Title', 'Catalog', 'Default State', 'Auto Publish', 'Actions']}
          rows={publicationRows}
          footerContent={
            publications?.length === 0 ? 
              `No publications found. Create your first publication to get started.` :
              `Showing ${publications?.length} publication${publications?.length === 1 ? '' : 's'}`
          }
        />
      </Card>
    </BlockStack>
  );

  const renderPriceManagementTab = () => (
    <BlockStack gap="4">
      <InlineStack align="space-between">
        <Text variant="headingMd" as="h2">Price Management</Text>
        <Button primary onClick={handleManagePrices}>
          Set Fixed Prices
        </Button>
      </InlineStack>

      <Card sectioned>
        <Text variant="bodyMd" as="p">
          Use this section to set fixed prices for specific product variants in your price lists.
          You can also remove fixed pricing to fall back to the price list's adjustment rules.
        </Text>
      </Card>

      {priceLists?.length === 0 ? (
        <Banner status="warning">
          <Text as="p">
            No price lists found. <Button url="/app/price-list" plain>Create a price list</Button> first to manage fixed prices.
          </Text>
        </Banner>
      ) : (
        <Card>
          <BlockStack gap="4">
            {priceLists?.map(priceList => (
              <Card key={priceList.id} sectioned>
                <InlineStack align="space-between">
                  <BlockStack gap="2">
                    <Text variant="headingSm" as="h3">{priceList.name}</Text>
                    <Text variant="bodyMd" color="subdued">
                      {priceList.currency} • {priceList.adjustmentType?.replace('_', ' ')} {Number(priceList.adjustmentValue || 0)}%
                    </Text>
                  </BlockStack>
                  <Button size="slim" onClick={() => {
                    setFormData({...formData, priceListId: priceList.id.toString()});
                    handleManagePrices();
                  }}>
                    Manage Prices
                  </Button>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );

  return (
    <Page
      title="Publications & Pricing"
      subtitle="Manage publications and fixed pricing for your B2B catalogs"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="4">
            {fetcher.data?.error && (
              <Banner status="critical">
                <Text as="p">{fetcher.data.error}</Text>
              </Banner>
            )}

            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Card>
                  {selectedTab === 0 && renderPublicationsTab()}
                  {selectedTab === 1 && renderPriceManagementTab()}
                </Card>
              </Tabs>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          modalType === "publication" ? "Create Publication" : 
          modalType === "prices" ? "Set Fixed Prices" :
          modalType === "addProducts" ? "Add Products" :
          modalType === "removeProducts" ? "Remove Products" : ""
        }
        primaryAction={{
          content: 
            modalType === "publication" ? "Create" : 
            modalType === "prices" ? "Set Prices" :
            modalType === "addProducts" ? "Add Products" :
            modalType === "removeProducts" ? "Remove Selected Products" : "",
          onAction: handleSubmit,
          loading: modalType === "publication" ? isLoading : modalLoading,
          disabled: 
            modalType === "publication" ? isLoading : 
            modalType === "prices" ? (!formData.priceListId || !formData.variantId || !formData.price) :
            modalType === "addProducts" ? modalLoading :
            modalType === "removeProducts" ? (modalLoading || productsToRemove.length === 0) : false
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setModalOpen(false);
              setSelectedPublication(null);
              setSelectedProductsForAdd([]);
              setProductsToRemove([]);
              setProductDetails([]);
              setFetchingProducts(false);
              setModalLoading(false);
            }
          }
        ]}
      >
        <Modal.Section>
          {modalType === "publication" ? (
            <BlockStack gap="4">
              <Text variant="bodyMd" as="p">
                Create a publication to control product visibility. You can assign a catalog now or later.
              </Text>
              
              <TextField
                label="Publication Title"
                value={formData.title}
                onChange={(value) => setFormData({...formData, title: value})}
                autoComplete="off"
                placeholder="Enter publication title"
              />
              
              <TextField
                label="Catalog ID (Optional)"
                value={formData.catalogId}
                onChange={(value) => setFormData({...formData, catalogId: value})}
                autoComplete="off"
                helpText="Leave empty to create a publication without a catalog. You can assign a catalog later."
              />
              
              <Select
                label="Default State"
                options={[
                  { label: "All Products", value: "ALL_PRODUCTS" },
                  { label: "Empty (manual selection)", value: "EMPTY" }
                ]}
                value={formData.defaultState}
                onChange={(value) => setFormData({...formData, defaultState: value})}
              />
              
              <label>
                <input
                  type="checkbox"
                  checked={formData.autoPublish}
                  onChange={(e) => setFormData({...formData, autoPublish: e.target.checked})}
                />
                {" "}Auto-publish new products
              </label>
            </BlockStack>
          ) : modalType === "prices" ? (
            <BlockStack gap="4">
              <Text variant="bodyMd" as="p">
                Set fixed prices for specific product variants. This will override the price list's adjustment rules.
              </Text>
              
              <Select
                label="Price List"
                options={[
                  { label: "Select a price list...", value: "", disabled: true },
                  ...(priceLists?.map(pl => ({
                    label: pl.name,
                    value: pl.id.toString()
                  })) || [])
                ]}
                value={formData.priceListId}
                onChange={(value) => setFormData({...formData, priceListId: value})}
              />
              
              <TextField
                label="Product Variant ID"
                value={formData.variantId}
                onChange={(value) => setFormData({...formData, variantId: value})}
                autoComplete="off"
                helpText="Enter the Shopify ID of the product variant (e.g., gid://shopify/ProductVariant/123)"
              />
              
              <TextField
                label="Price"
                type="number"
                value={formData.price}
                onChange={(value) => setFormData({...formData, price: value})}
                autoComplete="off"
                step="0.01"
                min="0"
              />
              
              <TextField
                label="Compare At Price (Optional)"
                type="number"
                value={formData.compareAtPrice}
                onChange={(value) => setFormData({...formData, compareAtPrice: value})}
                autoComplete="off"
                step="0.01"
                min="0"
              />
              
              <Select
                label="Currency"
                options={[
                  { label: "USD", value: "USD" },
                  { label: "EUR", value: "EUR" },
                  { label: "GBP", value: "GBP" },
                  { label: "CAD", value: "CAD" }
                ]}
                value={formData.currency}
                onChange={(value) => setFormData({...formData, currency: value})}
              />
            </BlockStack>
          ) : modalType === "addProducts" ? (
            <BlockStack gap="4">
              {modalLoading ? (
                <BlockStack gap="4" align="center">
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Adding products to publication...
                    </Text>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Please wait while we process your request.
                    </Text>
                  </div>
                </BlockStack>
              ) : (
                <>
                  <Text variant="bodyMd" as="p">
                    The following {selectedProductsForAdd.length} product{selectedProductsForAdd.length === 1 ? '' : 's'} will be added to "{selectedPublication?.title}":
                  </Text>
                  
                  <BlockStack gap="2">
                    {selectedProductsForAdd.map((product, index) => (
                      <Card key={product.id} sectioned>
                        <Text variant="bodyMd" as="p" fontWeight="semibold">
                          {product.title}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          ID: {product.id}
                        </Text>
                      </Card>
                    ))}
                  </BlockStack>
                </>
              )}
            </BlockStack>
          ) : modalType === "removeProducts" ? (
            <BlockStack gap="4">
              {fetchingProducts ? (
                <BlockStack gap="4" align="center">
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Loading product details...
                    </Text>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Please wait while we fetch product information.
                    </Text>
                  </div>
                </BlockStack>
              ) : (
                <>
                  <Text variant="bodyMd" as="p">
                    Select products to remove from "{selectedPublication?.title}":
                  </Text>
                  
                  <BlockStack gap="2">
                    {selectedPublication?.products?.map((productRelation) => {
                      // Find matching product details
                      const productDetail = productDetails.find(p => p.id === productRelation.productId);
                      
                      return (
                        <Card key={productRelation.id} sectioned>
                          <InlineStack gap="3" align="space-between">
                            <InlineStack gap="3" align="start">
                              {productDetail?.featuredImage?.url && (
                                <div style={{ width: "48px", height: "48px", borderRadius: "4px", overflow: "hidden" }}>
                                  <img 
                                    src={productDetail.featuredImage.url} 
                                    alt={productDetail.featuredImage.altText || productDetail.title}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                </div>
                              )}
                              
                              <BlockStack gap="1">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">
                                  {productDetail?.title || `Product ID: ${productRelation.productId}`}
                                </Text>
                                <Text variant="bodySm" as="p" tone="subdued">
                                  {productDetail?.handle && `Handle: ${productDetail.handle}`}
                                </Text>
                                <Text variant="bodySm" as="p" tone="subdued">
                                  Added: {new Date(productRelation.createdAt).toLocaleDateString()}
                                </Text>
                                {productDetail?.status && (
                                  <Badge status={productDetail.status === "ACTIVE" ? "success" : "attention"}>
                                    {productDetail.status}
                                  </Badge>
                                )}
                              </BlockStack>
                            </InlineStack>
                            
                            <label>
                              <input
                                type="checkbox"
                                checked={productsToRemove.includes(productRelation.productId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setProductsToRemove([...productsToRemove, productRelation.productId]);
                                  } else {
                                    setProductsToRemove(productsToRemove.filter(id => id !== productRelation.productId));
                                  }
                                }}
                              />
                              {" "}Remove
                            </label>
                          </InlineStack>
                        </Card>
                      );
                    })}
                  </BlockStack>
                  
                  {productsToRemove.length > 0 && (
                    <Text variant="bodyMd" as="p" tone="critical">
                      {productsToRemove.length} product{productsToRemove.length === 1 ? '' : 's'} will be removed.
                    </Text>
                  )}
                </>
              )}
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
