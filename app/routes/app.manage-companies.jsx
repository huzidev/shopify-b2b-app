import { useFetcher, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompanies, deleteCompany, updateCompany, createCompanyLocation } from "../models/company.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  DataTable,
  Modal,
  ButtonGroup,
  Select,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  const companies = await getCompanies(session.shop);
  
  return { companies };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "delete") {
    const companyId = formData.get("companyId");
    return await deleteCompany({
      admin,
      shop: session.shop,
      companyId
    });
  }
  
  if (actionType === "update") {
    const companyId = formData.get("companyId");
    const name = formData.get("name");
    return await updateCompany({
      admin,
      shop: session.shop,
      companyId,
      name
    });
  }
  
  if (actionType === "create-location") {
    const companyId = formData.get("companyId");
    const locationData = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      locale: formData.get("locale"),
      externalId: formData.get("externalId"),
      note: formData.get("note"),
      billingAddress: {
        address1: formData.get("billingAddress1"),
        address2: formData.get("billingAddress2"),
        city: formData.get("billingCity"),
        zip: formData.get("billingZip"),
        firstName: formData.get("billingFirstName"),
        lastName: formData.get("billingLastName"),
        phone: formData.get("billingPhone"),
        countryCode: formData.get("billingCountryCode") || "US"
      },
      shippingAddress: {
        address1: formData.get("shippingAddress1"),
        address2: formData.get("shippingAddress2"),
        city: formData.get("shippingCity"),
        zip: formData.get("shippingZip"),
        firstName: formData.get("shippingFirstName"),
        lastName: formData.get("shippingLastName"),
        phone: formData.get("shippingPhone"),
        countryCode: formData.get("shippingCountryCode") || "US"
      },
      billingSameAsShipping: formData.get("billingSameAsShipping") === "true",
      taxExempt: formData.get("taxExempt") === "true"
    };
    
    return await createCompanyLocation({
      admin,
      shop: session.shop,
      companyId,
      locationData
    });
  }
  
  return { success: false, error: "Unknown action" };
};

export default function AppManageCompanies() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { companies } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(""); // "delete", "edit", "add-location"
  const [selectedCompany, setSelectedCompany] = useState(null);
  
  const [editForm, setEditForm] = useState({
    name: ""
  });
  
  const [locationForm, setLocationForm] = useState({
    name: "",
    phone: "",
    locale: "en",
    externalId: "",
    note: "",
    billingAddress1: "",
    billingAddress2: "",
    billingCity: "",
    billingZip: "",
    billingFirstName: "",
    billingLastName: "",
    billingPhone: "",
    billingCountryCode: "US",
    shippingAddress1: "",
    shippingAddress2: "",
    shippingCity: "",
    shippingZip: "",
    shippingFirstName: "",
    shippingLastName: "",
    shippingPhone: "",
    shippingCountryCode: "US",
    billingSameAsShipping: true,
    taxExempt: false
  });

  useEffect(() => {
    if (fetcher.data?.success) {
      const actions = {
        delete: "Company deleted!",
        update: "Company updated!",
        "create-location": "Company location created!"
      };
      shopify.toast.show(actions[modalType] || "Action completed!");
      setModalOpen(false);
      setSelectedCompany(null);
      setModalType("");
      // Reset forms
      setEditForm({ name: "" });
      setLocationForm({
        name: "",
        phone: "",
        locale: "en",
        externalId: "",
        note: "",
        billingAddress1: "",
        billingAddress2: "",
        billingCity: "",
        billingZip: "",
        billingFirstName: "",
        billingLastName: "",
        billingPhone: "",
        billingCountryCode: "US",
        shippingAddress1: "",
        shippingAddress2: "",
        shippingCity: "",
        shippingZip: "",
        shippingFirstName: "",
        shippingLastName: "",
        shippingPhone: "",
        shippingCountryCode: "US",
        billingSameAsShipping: true,
        taxExempt: false
      });
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify, modalType]);

  const handleDelete = (company) => {
    setSelectedCompany(company);
    setModalType("delete");
    setModalOpen(true);
  };

  const handleEdit = (company) => {
    setSelectedCompany(company);
    setEditForm({ name: company.name });
    setModalType("edit");
    setModalOpen(true);
  };

  const handleAddLocation = (company) => {
    setSelectedCompany(company);
    setModalType("add-location");
    setModalOpen(true);
  };

  const confirmDelete = () => {
    fetcher.submit(
      { 
        actionType: "delete",
        companyId: selectedCompany.shopifyId
      },
      { method: "POST" }
    );
  };

  const handleEditSubmit = () => {
    fetcher.submit(
      { 
        actionType: "update",
        companyId: selectedCompany.shopifyId,
        name: editForm.name
      },
      { method: "POST" }
    );
  };

  const handleLocationSubmit = () => {
    const submitData = {
      actionType: "create-location",
      companyId: selectedCompany.shopifyId,
      ...locationForm,
      billingSameAsShipping: locationForm.billingSameAsShipping.toString(),
      taxExempt: locationForm.taxExempt.toString()
    };
    
    fetcher.submit(submitData, { method: "POST" });
  };

  const handleBillingSameAsShipping = (value) => {
    const updated = { ...locationForm, billingSameAsShipping: value };
    if (value) {
      updated.shippingAddress1 = locationForm.billingAddress1;
      updated.shippingAddress2 = locationForm.billingAddress2;
      updated.shippingCity = locationForm.billingCity;
      updated.shippingZip = locationForm.billingZip;
      updated.shippingFirstName = locationForm.billingFirstName;
      updated.shippingLastName = locationForm.billingLastName;
      updated.shippingPhone = locationForm.billingPhone;
      updated.shippingCountryCode = locationForm.billingCountryCode;
    }
    setLocationForm(updated);
  };

  const rows = companies?.map(company => [
    company.name,
    company.locations?.length || 0,
    company._count?.catalogs || 0,
    company._count?.orders || 0,
    <InlineStack gap="2" key={company.id}>
      <Button onClick={() => handleAddLocation(company)} size="slim" variant="primary">
        Add Location
      </Button>
      <Button onClick={() => handleEdit(company)} size="slim">
        Edit
      </Button>
      <Button onClick={() => handleDelete(company)} size="slim" tone="critical">
        Delete
      </Button>
    </InlineStack>
  ]) || [];

  const renderModal = () => {
    if (!modalOpen || !selectedCompany) return null;

    switch (modalType) {
      case "delete":
        return (
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Delete Company"
            primaryAction={{
              content: "Delete",
              onAction: confirmDelete,
              loading: isLoading,
              destructive: true
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
                <Text as="p">
                  Are you sure you want to delete "{selectedCompany.name}"?
                </Text>
                <Banner status="warning">
                  <Text as="p">
                    <strong>This action cannot be undone.</strong> The company will be deleted from both your database and Shopify.
                  </Text>
                </Banner>
              </BlockStack>
            </Modal.Section>
          </Modal>
        );

      case "edit":
        return (
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Edit Company"
            primaryAction={{
              content: "Update",
              onAction: handleEditSubmit,
              loading: isLoading,
              disabled: !editForm.name || isLoading
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setModalOpen(false)
              }
            ]}
          >
            <Modal.Section>
              <TextField
                label="Company Name"
                value={editForm.name}
                onChange={(value) => setEditForm({...editForm, name: value})}
                autoComplete="off"
              />
            </Modal.Section>
          </Modal>
        );

      case "add-location":
        return (
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Add Company Location"
            primaryAction={{
              content: "Create Location",
              onAction: handleLocationSubmit,
              loading: isLoading,
              disabled: !locationForm.name || !locationForm.billingAddress1 || !locationForm.billingCity || isLoading
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
                <TextField
                  label="Location Name"
                  value={locationForm.name}
                  onChange={(value) => setLocationForm({...locationForm, name: value})}
                  autoComplete="off"
                />
                
                <TextField
                  label="Phone"
                  value={locationForm.phone}
                  onChange={(value) => setLocationForm({...locationForm, phone: value})}
                  autoComplete="off"
                />
                
                <Select
                  label="Locale"
                  options={[
                    { label: "English", value: "en" },
                    { label: "French", value: "fr" },
                    { label: "Spanish", value: "es" }
                  ]}
                  value={locationForm.locale}
                  onChange={(value) => setLocationForm({...locationForm, locale: value})}
                />
                
                <TextField
                  label="External ID"
                  value={locationForm.externalId}
                  onChange={(value) => setLocationForm({...locationForm, externalId: value})}
                  autoComplete="off"
                />
                
                <TextField
                  label="Note"
                  value={locationForm.note}
                  onChange={(value) => setLocationForm({...locationForm, note: value})}
                  multiline={3}
                  autoComplete="off"
                />

                <Text as="h3" variant="headingMd">Billing Address</Text>
                
                <TextField
                  label="Address Line 1"
                  value={locationForm.billingAddress1}
                  onChange={(value) => setLocationForm({...locationForm, billingAddress1: value})}
                  autoComplete="off"
                />
                
                <TextField
                  label="Address Line 2"
                  value={locationForm.billingAddress2}
                  onChange={(value) => setLocationForm({...locationForm, billingAddress2: value})}
                  autoComplete="off"
                />
                
                <InlineStack gap="4">
                  <TextField
                    label="City"
                    value={locationForm.billingCity}
                    onChange={(value) => setLocationForm({...locationForm, billingCity: value})}
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="ZIP Code"
                    value={locationForm.billingZip}
                    onChange={(value) => setLocationForm({...locationForm, billingZip: value})}
                    autoComplete="off"
                  />
                </InlineStack>
                
                <InlineStack gap="4">
                  <TextField
                    label="First Name"
                    value={locationForm.billingFirstName}
                    onChange={(value) => setLocationForm({...locationForm, billingFirstName: value})}
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Last Name"
                    value={locationForm.billingLastName}
                    onChange={(value) => setLocationForm({...locationForm, billingLastName: value})}
                    autoComplete="off"
                  />
                </InlineStack>
                
                <InlineStack gap="4">
                  <TextField
                    label="Phone"
                    value={locationForm.billingPhone}
                    onChange={(value) => setLocationForm({...locationForm, billingPhone: value})}
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Country"
                    options={[
                      { label: "United States", value: "US" },
                      { label: "Canada", value: "CA" },
                      { label: "United Kingdom", value: "GB" },
                      { label: "Australia", value: "AU" }
                    ]}
                    value={locationForm.billingCountryCode}
                    onChange={(value) => setLocationForm({...locationForm, billingCountryCode: value})}
                  />
                </InlineStack>

                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={locationForm.billingSameAsShipping}
                    onChange={(e) => handleBillingSameAsShipping(e.target.checked)}
                  />
                  <Text as="span">Billing same as shipping</Text>
                </label>

                {!locationForm.billingSameAsShipping && (
                  <>
                    <Text as="h3" variant="headingMd">Shipping Address</Text>
                    
                    <TextField
                      label="Address Line 1"
                      value={locationForm.shippingAddress1}
                      onChange={(value) => setLocationForm({...locationForm, shippingAddress1: value})}
                      autoComplete="off"
                    />
                    
                    <TextField
                      label="Address Line 2"
                      value={locationForm.shippingAddress2}
                      onChange={(value) => setLocationForm({...locationForm, shippingAddress2: value})}
                      autoComplete="off"
                    />
                    
                    <InlineStack gap="4">
                      <TextField
                        label="City"
                        value={locationForm.shippingCity}
                        onChange={(value) => setLocationForm({...locationForm, shippingCity: value})}
                        autoComplete="off"
                      />
                      
                      <TextField
                        label="ZIP Code"
                        value={locationForm.shippingZip}
                        onChange={(value) => setLocationForm({...locationForm, shippingZip: value})}
                        autoComplete="off"
                      />
                    </InlineStack>
                    
                    <InlineStack gap="4">
                      <TextField
                        label="First Name"
                        value={locationForm.shippingFirstName}
                        onChange={(value) => setLocationForm({...locationForm, shippingFirstName: value})}
                        autoComplete="off"
                      />
                      
                      <TextField
                        label="Last Name"
                        value={locationForm.shippingLastName}
                        onChange={(value) => setLocationForm({...locationForm, shippingLastName: value})}
                        autoComplete="off"
                      />
                    </InlineStack>
                    
                    <InlineStack gap="4">
                      <TextField
                        label="Phone"
                        value={locationForm.shippingPhone}
                        onChange={(value) => setLocationForm({...locationForm, shippingPhone: value})}
                        autoComplete="off"
                      />
                      
                      <Select
                        label="Country"
                        options={[
                          { label: "United States", value: "US" },
                          { label: "Canada", value: "CA" },
                          { label: "United Kingdom", value: "GB" },
                          { label: "Australia", value: "AU" }
                        ]}
                        value={locationForm.shippingCountryCode}
                        onChange={(value) => setLocationForm({...locationForm, shippingCountryCode: value})}
                      />
                    </InlineStack>
                  </>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={locationForm.taxExempt}
                    onChange={(e) => setLocationForm({...locationForm, taxExempt: e.target.checked})}
                  />
                  <Text as="span">Tax exempt</Text>
                </label>
              </BlockStack>
            </Modal.Section>
          </Modal>
        );

      default:
        return null;
    }
  };

  return (
    <Page
      title="Manage Companies"
      subtitle="View and manage B2B companies"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
      primaryAction={{
        content: "Create Company",
        url: "/app/create-company"
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
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'text']}
                headings={['Company Name', 'Locations', 'Catalogs', 'Orders', 'Actions']}
                rows={rows}
                footerContent={
                  companies?.length === 0 ? 
                    `No companies found. Create your first company to get started.` :
                    `Showing ${companies?.length} compan${companies?.length === 1 ? 'y' : 'ies'}`
                }
              />
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {renderModal()}
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
