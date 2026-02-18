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
    
    if (actionType === "updatePublication") {
      const publicationId = formData.get("publicationId");
      const selectedProductIds = JSON.parse(formData.get("selectedProductIds") || "[]");
      
      return await updatePublication({
        admin,
        shop: session.shop,
        publicationId,
        publishablesToAdd: selectedProductIds,
        publishablesToRemove: []
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
  const [modalType, setModalType] = useState("publication");
  const [selectedPublication, setSelectedPublication] = useState(null);
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
      // Check if this was a publication update (products added)
      if (fetcher.data?.publication) {
        // Show success message for adding products
        if (app?.toast) {
          app.toast.show('Products successfully added to publication!');
        }
      } else {
        // Show success message for publication creation
        if (app?.toast) {
          app.toast.show('Publication created successfully!');
        }
      }
      
      setModalOpen(false);
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
      // Show error message
      if (app?.toast) {
        app.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
      }
    }
  }, [fetcher.data, app]);

  const handleSelectProducts = useCallback(async (publication) => {
    if (!app) {
      console.error('App Bridge not available');
      return;
    }

    try {
      const selected = await app.resourcePicker({
        type: 'product',
        multiple: true,
      });
      console.log("SW what is selected PRODUCT", selected);

      if (selected && selected.length > 0) {
        // Extract product IDs for the publication update
        const productIds = selected.map(product => product.id);
        
        // Submit to update the publication with selected products
        fetcher.submit({
          actionType: "updatePublication",
          publicationId: publication.id.toString(),
          selectedProductIds: JSON.stringify(productIds)
        }, { method: "POST" });
      }

    } catch (error) {
      console.error('Error opening resource picker:', error);
      // Handle cancellation or other errors gracefully
      if (error.message !== 'User cancelled resource selection') {
        // You can add toast notification here if needed
        console.error('Unable to open product picker. Please try again.');
      }
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
    <Button key={`action-${publication.id}`} size="slim" onClick={() => handleSelectProducts(publication)}>
      Manage Products
    </Button>
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
        title={modalType === "publication" ? "Create Publication" : "Set Fixed Prices"}
        primaryAction={{
          content: modalType === "publication" ? "Create" : "Set Prices",
          onAction: handleSubmit,
          loading: isLoading,
          disabled: isLoading || (modalType === "publication" ? false : !formData.priceListId || !formData.variantId || !formData.price)
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setModalOpen(false)
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
          ) : (
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
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
