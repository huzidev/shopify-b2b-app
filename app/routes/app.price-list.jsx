import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getPriceLists, createPriceList, updatePriceList } from "../models/priceList.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  DataTable,
  Button,
  Modal,
  TextField,
  Select,
  Badge,
  InlineStack,
  Banner
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const priceLists = await getPriceLists(session.shop);

  console.log("SW what is priceLists", priceLists);
  
  return { priceLists };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "create") {
    const name = formData.get("name");
    const currency = formData.get("currency");
    const adjustmentType = formData.get("adjustmentType");
    const adjustmentValue = formData.get("adjustmentValue");
    
    return await createPriceList({
      admin,
      shop: session.shop,
      name,
      currency,
      adjustmentType,
      adjustmentValue: parseFloat(adjustmentValue)
    });
  }
  
  if (actionType === "update") {
    const priceListId = formData.get("priceListId");
    const adjustmentType = formData.get("adjustmentType");
    const adjustmentValue = formData.get("adjustmentValue");
    
    return await updatePriceList({
      admin,
      shop: session.shop,
      priceListId,
      adjustmentType,
      adjustmentValue: parseFloat(adjustmentValue)
    });
  }
  
  return { success: false, error: "Unknown action" };
};

export default function AppPriceList() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { priceLists } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    currency: "USD",
    adjustmentType: "PERCENTAGE_INCREASE",
    adjustmentValue: "0"
  });

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(editingPriceList ? "Price list updated!" : "Price list created!");
      setModalOpen(false);
      setEditingPriceList(null);
      setFormData({
        name: "",
        currency: "USD",
        adjustmentType: "PERCENTAGE_INCREASE",
        adjustmentValue: "0"
      });
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify, editingPriceList]);

  const handleSubmit = () => {
    const submitData = {
      actionType: editingPriceList ? "update" : "create",
      ...formData
    };
    
    if (editingPriceList) {
      submitData.priceListId = editingPriceList.shopifyId;
    }
    
    fetcher.submit(submitData, { method: "POST" });
  };

  const handleEdit = (priceList) => {
    setEditingPriceList(priceList);
    setFormData({
      name: priceList.name,
      currency: priceList.currency,
      adjustmentType: priceList.adjustmentType || "PERCENTAGE_INCREASE",
      adjustmentValue: priceList.adjustmentValue ? Number(priceList.adjustmentValue).toString() : "0"
    });
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingPriceList(null);
    setFormData({
      name: "",
      currency: "USD",
      adjustmentType: "PERCENTAGE_INCREASE",
      adjustmentValue: "0"
    });
    setModalOpen(true);
  };

  // Check if name already exists
  const nameExists = !editingPriceList && priceLists?.some(pl => 
    pl.name.toLowerCase() === formData.name.toLowerCase()
  );

  // Generate suggested names
  const suggestAlternativeName = (baseName) => {
    let counter = 1;
    let suggestedName = `${baseName} ${counter}`;
    
    while (priceLists?.some(pl => pl.name.toLowerCase() === suggestedName.toLowerCase())) {
      counter++;
      suggestedName = `${baseName} ${counter}`;
    }
    
    return suggestedName;
  };

  console.log("SW what is priceLists?", priceLists);
  

  const rows = priceLists?.map(priceList => {
    const adjustmentPercent = priceList.adjustmentValue?.d?.[0] ?? 0;

    return [
      priceList.name,
      priceList.currency,
      priceList.adjustmentType ? (
        <Badge 
          status={priceList.adjustmentType.includes("INCREASE") ? "success" : "attention"}
        >
          {adjustmentPercent}%
        </Badge>
      ) : "No adjustment",
      <Button onClick={() => handleEdit(priceList)} size="slim">
        Edit
      </Button>
    ];
  }) || [];


  return (
    <Page
      title="Price Lists"
      subtitle="Manage price lists for B2B catalogs"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
      primaryAction={{
        content: "Create Price List",
        onAction: handleCreate
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
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Name', 'Currency', 'Price Adjustment', 'Actions']}
                rows={rows}
                footerContent={
                  priceLists?.length === 0 ? 
                    `No price lists found. Create your first price list to get started.` :
                    `Showing ${priceLists?.length} price list${priceLists?.length === 1 ? '' : 's'}`
                }
              />
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPriceList ? "Edit Price List" : "Create Price List"}
        primaryAction={{
          content: editingPriceList ? "Update" : "Create",
          onAction: handleSubmit,
          loading: isLoading,
          disabled: isLoading || !formData.name || !formData.adjustmentValue || nameExists
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="4">
            {!editingPriceList && (
              <>
                <TextField
                  label="Price List Name"
                  value={formData.name}
                  onChange={(value) => setFormData({...formData, name: value})}
                  autoComplete="off"
                  error={nameExists ? "This name already exists" : ""}
                />
                
                {nameExists && formData.name && (
                  <Banner status="warning">
                    <BlockStack gap="2">
                      <Text as="p">
                        The name "{formData.name}" is already taken.
                      </Text>
                      <Button
                        plain
                        onClick={() => setFormData({
                          ...formData, 
                          name: suggestAlternativeName(formData.name)
                        })}
                      >
                        Try "{suggestAlternativeName(formData.name)}" instead
                      </Button>
                    </BlockStack>
                  </Banner>
                )}
                
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
              </>
            )}
            
            <Select
              label="Price Adjustment Type"
              options={[
                { label: "Percentage Increase", value: "PERCENTAGE_INCREASE" },
                { label: "Percentage Decrease", value: "PERCENTAGE_DECREASE" }
              ]}
              value={formData.adjustmentType}
              onChange={(value) => setFormData({...formData, adjustmentType: value})}
            />
            
            <TextField
              label="Adjustment Value (%)"
              type="number"
              value={formData.adjustmentValue}
              onChange={(value) => setFormData({...formData, adjustmentValue: value})}
              autoComplete="off"
              min="0"
              max="100"
              step="0.01"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
