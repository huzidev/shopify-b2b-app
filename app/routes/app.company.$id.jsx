import React, { useState, useCallback } from "react";
import {
  useLoaderData,
  useActionData,
  useParams,
  useNavigate,
  redirect,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getCompany,
  updateCompany,
  deleteCompany,
  createCompanyLocation,
} from "../models/company.server";
import AddLocationModal from "../components/AddLocation";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Link,
  DataTable,
  Modal,
  TextContainer,
} from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const company = await getCompany(session.shop, params.id);

  return { company };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "update") {
    const name = formData.get("name");
    return await updateCompany({
      admin,
      shop: session.shop,
      companyId: params.id,
      name,
    });
  }

  if (actionType === "delete") {
    const company = await getCompany(session.shop, params.id);
    if (!company) {
      return { success: false, error: "Company not found" };
    }

    const result = await deleteCompany({
      admin,
      shop: session.shop,
      companyShopifyId: company.shopifyId,
    });

    if (result.success) {
      // Redirect to companies list after successful deletion
      return redirect("/app/companies");
    }

    return result;
  }

  if (actionType === "addLocation") {
    const company = await getCompany(session.shop, params.id);
    if (!company) {
      return { success: false, error: "Company not found" };
    }

    const locationData = {
      name: formData.get("locationName"),
      // Add other location fields as needed
    };

    return await createCompanyLocation({
      admin,
      shop: session.shop,
      companyId: company.shopifyId,
      locationData,
    });
  }

  return { success: false, error: "Unknown action" };
};

const paymentTermsOptions = [
  { label: "Net 15", value: "net15" },
  { label: "Net 30", value: "net30" },
  { label: "Net 45", value: "net45" },
  { label: "Net 60", value: "net60" },
  { label: "Due on receipt", value: "due" },
];

export default function CompanyDetail() {
  const { company } = useLoaderData();
  const actionData = useActionData();
  const [companyName, setCompanyName] = useState(company?.name || "");
  const [contactEmail, setContactEmail] = useState(
    company?.contactShopifyId || "",
  );
  const [phone, setPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("net30");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const navigate = useNavigate();

  // If company not found
  if (!company) {
    return (
      <Page
        title="Company Not Found"
        backAction={{
          onAction: () => navigate("/app/manage-companies"),
        }}
      >
        <Card>
          <Text>Company not found or you don't have access to view it.</Text>
        </Card>
      </Page>
    );
  }

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleDeleteCompany = useCallback(async () => {
    const form = new FormData();
    form.set("actionType", "delete");

    const response = await fetch("", {
      method: "POST",
      body: form,
    });

    setShowDeleteModal(false);
  }, []);

  const handleAddLocation = useCallback(() => {
    setShowAddLocationModal(true);
  }, []);

  // Create summary rows from company data
  const summaryRows = [
    { label: "Status", value: <Badge tone="success">Active</Badge> },
    { label: "Customers", value: company._count?.customers || 0 },
    { label: "Locations", value: company._count?.locations || 0 },
    { label: "Assigned catalogs", value: company._count?.catalogs || 0 },
    { label: "Orders", value: company._count?.orders || 0 },
    { label: "Created", value: new Date().toLocaleDateString() }, // Can use actual creation date when available
  ];

  // Create location rows from company data
  const locationRows =
    company.locations?.map((location) => [
      <Link url="#" removeUnderline={false}>
        <Text tone="interactive">{location.name}</Text>
      </Link>,
      <Text tone="subdued">Location Address</Text>, // Add address field to schema if needed
      <Text>{location.catalogs?.length || 0}</Text>,
    ]) || [];

  // Create customer rows from company data
  const customerRows =
    company.customers?.map((customer) => [
      <Text>
        {customer.firstName} {customer.lastName}
      </Text>,
      <Text>{customer.email}</Text>,
      <Text>{customer.shopifyCustomerId}</Text>,
    ]) || [];

  // Create catalog rows from company data
  const catalogRows =
    company.catalogs?.map((catalog) => [
      <Text>{catalog.title}</Text>,
      <Text>{catalog.status}</Text>,
      <Text>{catalog.priceList?.name || "No price list"}</Text>,
      <Text>{catalog.publications?.length || 0} publications</Text>,
    ]) || [];

  // Create order rows from company data
  const orderRows =
    company.orders?.slice(0, 10).map((order) => [
      <Link url="#" removeUnderline={false}>
        <Text tone="interactive">{order.orderNumber || order.shopifyId}</Text>
      </Link>,
      <Text>${order.totalPrice || "0.00"}</Text>,
      <Text>{order.orderItems?.length || 0} items</Text>,
      <Text>{new Date(order.createdAt).toLocaleDateString()}</Text>,
    ]) || [];

  // Generate discount text helper
  const getDiscountText = (priceList) => {
    if (!priceList) return "";

    const adjustmentValue =
      typeof priceList.adjustmentValue === "object" &&
      priceList.adjustmentValue.d
        ? priceList.adjustmentValue.d[0]
        : parseFloat(priceList.adjustmentValue);

    if (priceList.adjustmentType === "PERCENTAGE_DECREASE") {
      return `${adjustmentValue}% OFF`;
    } else if (priceList.adjustmentType === "PERCENTAGE_INCREASE") {
      return `${adjustmentValue}% Markup`;
    } else if (priceList.adjustmentType === "FIXED_AMOUNT") {
      return `$${adjustmentValue} adjustment`;
    }
    return "";
  };

  return (
    <Page
      backAction={{
        onAction: () => navigate("/app/companies"),
      }}
      title={company.name}
      titleMetadata={<Badge tone="success">Active</Badge>}
      secondaryActions={[{ content: "Edit company", onAction: () => {} }]}
      primaryAction={
        <Button
          variant="primary"
          tone="critical"
          onClick={() => setShowDeleteModal(true)}
        >
          Delete
        </Button>
      }
    >
      <Layout>
        {/* Left Column */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Company Details Card */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Company details
                </Text>

                <InlineStack gap="400" align="start" wrap>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      label="Company name"
                      value={companyName}
                      onChange={setCompanyName}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      label="Contact email"
                      value={contactEmail}
                      onChange={setContactEmail}
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                </InlineStack>

                <InlineStack gap="400" align="start" wrap>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      label="Phone"
                      value={phone}
                      onChange={setPhone}
                      type="tel"
                      autoComplete="tel"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Select
                      label="Payment terms"
                      options={paymentTermsOptions}
                      value={paymentTerms}
                      onChange={setPaymentTerms}
                    />
                  </div>
                </InlineStack>

                <TextField
                  label="Notes"
                  value={notes}
                  onChange={setNotes}
                  multiline={4}
                  autoComplete="off"
                />

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    tone={saved ? "success" : undefined}
                  >
                    {saved ? "Saved!" : "Save"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Customers Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <Text variant="headingMd" as="h2">
                    Associated Customers
                  </Text>
                </Box>

                <Divider />

                {customerRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={[
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Name
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Email
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Customer ID
                      </Text>,
                    ]}
                    rows={customerRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No customers associated with this company.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Catalogs Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <Text variant="headingMd" as="h2">
                    Assigned Catalogs
                  </Text>
                </Box>

                <Divider />

                {catalogRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={[
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Catalog Title
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Status
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Price List
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Publications
                      </Text>,
                    ]}
                    rows={catalogRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No catalogs assigned to this company.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Products by Location */}
            {company.locationProducts &&
              company.locationProducts.length > 0 && (
                <BlockStack gap="500">
                  <Text variant="headingLg" as="h2">
                    Products by Location
                  </Text>
                  {company.locationProducts.map((locationInfo, index) => (
                    <Card key={index} padding="0">
                      <BlockStack gap="0">
                        <Box paddingInline="400" paddingBlock="400">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="100">
                              <Text variant="headingMd" as="h3">
                                {locationInfo.locationName}
                                {locationInfo.catalogTitle &&
                                  ` - ${locationInfo.catalogTitle}`}
                              </Text>
                              {locationInfo.priceList && (
                                <Badge tone="info">
                                  {getDiscountText(locationInfo.priceList)}
                                </Badge>
                              )}
                            </BlockStack>
                          </InlineStack>
                        </Box>

                        <Divider />

                        {locationInfo.hasNoCatalogs ? (
                          <Box padding="400">
                            <Text tone="subdued" alignment="center">
                              No catalogs for {locationInfo.locationName}
                            </Text>
                          </Box>
                        ) : locationInfo.hasNoProducts ? (
                          <Box padding="400">
                            <Text tone="subdued" alignment="center">
                              No products available in this catalog
                            </Text>
                          </Box>
                        ) : (
                          <DataTable
                            columnContentTypes={[
                              "text",
                              "numeric",
                              "numeric",
                              "text",
                            ]}
                            headings={[
                              <Text
                                variant="bodySm"
                                fontWeight="semibold"
                                tone="subdued"
                              >
                                Product
                              </Text>,
                              <Text
                                variant="bodySm"
                                fontWeight="semibold"
                                tone="subdued"
                              >
                                Price
                              </Text>,
                              <Text
                                variant="bodySm"
                                fontWeight="semibold"
                                tone="subdued"
                              >
                                Inventory
                              </Text>,
                              <Text
                                variant="bodySm"
                                fontWeight="semibold"
                                tone="subdued"
                              >
                                SKU
                              </Text>,
                            ]}
                            rows={locationInfo.products.map((product) => [
                              <Text>{product.title}</Text>,
                              <Box>
                                {product.hasDiscount ? (
                                  <InlineStack gap="200" align="start">
                                    <Text
                                      tone="subdued"
                                      textDecorationLine="line-through"
                                    >
                                      ${product.originalPrice}
                                    </Text>
                                    <Text fontWeight="bold" tone="success">
                                      ${product.adjustedPrice}
                                    </Text>
                                  </InlineStack>
                                ) : (
                                  <Text fontWeight="bold">
                                    ${product.adjustedPrice}
                                  </Text>
                                )}
                              </Box>,
                              <Text>{product.inventory}</Text>,
                              <Text tone="subdued">{product.sku}</Text>,
                            ])}
                            hoverable
                          />
                        )}
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              )}

            {/* Locations Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Locations
                    </Text>
                    <Button variant="primary" onClick={handleAddLocation}>
                      Add location
                    </Button>
                  </InlineStack>
                </Box>

                <Divider />

                {locationRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric"]}
                    headings={[
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Location name
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Address
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Catalogs
                      </Text>,
                    ]}
                    rows={locationRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No locations found. Add a location to get started.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Orders Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Recent Orders
                    </Text>
                    {company.orders && company.orders.length > 10 && (
                      <Link url="/app/orders" removeUnderline={false}>
                        <Text tone="interactive">View all</Text>
                      </Link>
                    )}
                  </InlineStack>
                </Box>

                <Divider />

                {orderRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "text"]}
                    headings={[
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Order
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Total
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Items
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Date
                      </Text>,
                    ]}
                    rows={orderRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No orders found for this company.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right Column - Summary */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Summary
              </Text>

              <BlockStack gap="0">
                {summaryRows.map((row, index) => (
                  <React.Fragment key={row.label}>
                    <Box paddingBlock="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="bodyMd" tone="subdued">
                          {row.label}
                        </Text>
                        {typeof row.value === "string" ||
                        typeof row.value === "number" ? (
                          <Text variant="bodyMd" fontWeight="semibold">
                            {row.value}
                          </Text>
                        ) : (
                          row.value
                        )}
                      </InlineStack>
                    </Box>
                    {index < summaryRows.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Modals */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Company"
        primaryAction={{
          content: "Delete Company",
          onAction: handleDeleteCompany,
          destructive: true,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowDeleteModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <Text>
              Are you sure you want to delete "{company.name}"? This action
              cannot be undone and will remove all associated data including
              locations, catalogs, and orders.
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>

      {showAddLocationModal && (
        <AddLocationModal
          onClose={() => setShowAddLocationModal(false)}
          companyId={company.shopifyId}
        />
      )}
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
