import React, { useState, useEffect } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Box,
  Divider,
  DataTable,
  Link,
  Modal,
  TextField,
  Grid,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id: customerId } = params;

  // Get shop record
  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  // Get customer using numeric ID
  const customer = await db.customer.findFirst({
    where: {
      shopifyNumericId: customerId,
      shopId: shop.id,
    },
    include: {
      locations: {
        orderBy: {
          createdAt: "desc",
        },
      },
      collections: {
        include: {
          collection: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  // Get orders for this customer
  const orders = await db.order.findMany({
    where: {
      companyId: customer.id,
    },
    include: {
      orderItems: {
        include: {
          variant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return {
    customer,
    orders,
  };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id: customerId } = params;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  // Get shop record
  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  // Get customer using numeric ID
  const customer = await db.customer.findFirst({
    where: {
      shopifyNumericId: customerId,
      shopId: shop.id,
    },
  });

  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  try {
    if (actionType === "addLocation") {
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const companyName = (formData.get("company") || "").toString().trim();
      const address1 = (formData.get("address1") || "").toString().trim();
      const address2 = (formData.get("address2") || "").toString().trim();
      const city = (formData.get("city") || "").toString().trim();
      const province = (formData.get("province") || "").toString().trim();
      const country = (formData.get("country") || "").toString().trim();
      const zip = (formData.get("zip") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();
      const name = (formData.get("name") || "").toString().trim();
      const provinceCode = (formData.get("provinceCode") || "").toString().trim();
      const countryCode = (formData.get("countryCode") || "").toString().trim();
      const countryName = (formData.get("countryName") || "").toString().trim();

      const location = await db.customerLocation.create({
        data: {
          customerId: customer.id,
          firstName: firstName || null,
          lastName: lastName || null,
          company: companyName || null,
          address1: address1 || null,
          address2: address2 || null,
          city: city || null,
          province: province || null,
          country: country || null,
          zip: zip || null,
          phone: phone || null,
          name: name || null,
          provinceCode: provinceCode || null,
          countryCode: countryCode || null,
          countryName: countryName || null,
        },
      });

      return {
        success: true,
        message: "Location added successfully",
        location,
      };
    }

    return { success: false, error: "Invalid action type" };
  } catch (error) {
    console.error("Error in action:", error);
    return { success: false, error: error.message };
  }
};

export default function CustomerDetail() {
  const { customer, orders } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationForm, setLocationForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    country: "",
    zip: "",
    phone: "",
    name: "",
    provinceCode: "",
    countryCode: "",
    countryName: "",
  });

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Location added successfully");
      setLocationForm({
        firstName: "",
        lastName: "",
        company: "",
        address1: "",
        address2: "",
        city: "",
        province: "",
        country: "",
        zip: "",
        phone: "",
        name: "",
        provinceCode: "",
        countryCode: "",
        countryName: "",
      });
      setIsLocationModalOpen(false);
      // Trigger a page reload or refetch
      window.location.reload();
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!customer) {
    return (
      <Page
        title="Customer Not Found"
        backAction={{
          onAction: () => navigate("/app/customer-sync"),
        }}
      >
        <Card>
          <Text>Customer not found or you don't have access to view it.</Text>
        </Card>
      </Page>
    );
  }

  // Create summary rows from customer data
  const summaryRows = [
    { label: "Status", value: <Badge tone="success">Active</Badge> },
    { label: "Shopify ID", value: customer.shopifyNumericId },
    { label: "Collections", value: customer.collections?.length || 0 },
    { label: "Locations", value: customer.locations?.length || 0 },
    { label: "Orders", value: orders?.length || 0 },
    {
      label: "Member Since",
      value: new Date(customer.createdAt).toLocaleDateString(),
    },
  ];

  // Create collection rows from customer data
  const collectionRows =
    customer.collections?.map((cc) => [
      <Text fontWeight="semibold">{cc.collection?.title || "N/A"}</Text>,
      <Badge tone={cc.collection?.status === "ACTIVE" ? "success" : "warning"}>
        {cc.collection?.status || "N/A"}
      </Badge>,
      <Text>
        ${parseFloat(cc.collection?.discount || 0).toFixed(2)}
      </Text>,
    ]) || [];

  // Create location rows from customer data
  const locationRows =
    customer.locations?.map((location) => [
      <Text>{location.name}</Text>,
      <Text>
        {location.address1}
        {location.address2 && <span>, {location.address2}</span>}
      </Text>,
      <Text>
        {location.city}, {location.province} {location.zip}
      </Text>,
    ]) || [];

  // Create order rows from customer data
  const orderRows =
    orders?.slice(0, 10).map((order) => [
      <Link url={`/app/order/${order.id}`} removeUnderline={false}>
        <Text tone="interactive">{order.orderNumber || `Order #${order.id}`}</Text>
      </Link>,
      <Text>
        ${parseFloat(order.totalPrice || 0).toFixed(2)} {order.currency}
      </Text>,
      <Text>{order.orderItems?.length || 0}</Text>,
      <Text>{new Date(order.createdAt).toLocaleDateString()}</Text>,
    ]) || [];

  const handleAddLocation = () => {
    fetcher.submit(locationForm, {
      method: "POST",
      action: "",
    });
  };

  return (
    <Page
      backAction={{
        onAction: () => navigate("/app/customer-sync"),
      }}
      title={`${customer.firstName} ${customer.lastName}`}
      titleMetadata={<Badge tone="success">Active</Badge>}
      primaryAction={
        <Button
          variant="primary"
          onClick={() => navigate(`/app/edit-customer/${customer.shopifyNumericId}`)}
        >
          Edit
        </Button>
      }
    >
      <Layout>
        {/* Left Column */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Customer Details Card */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Customer Details
                </Text>

                <InlineStack gap="400" align="start" wrap>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        First Name
                      </Text>
                      <Text variant="bodyMd">{customer.firstName || "N/A"}</Text>
                    </BlockStack>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        Last Name
                      </Text>
                      <Text variant="bodyMd">{customer.lastName || "N/A"}</Text>
                    </BlockStack>
                  </div>
                </InlineStack>

                <InlineStack gap="400" align="start" wrap>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        Email
                      </Text>
                      <Text variant="bodyMd">{customer.email || "N/A"}</Text>
                    </BlockStack>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        Phone
                      </Text>
                      <Text variant="bodyMd">{customer.phone || "N/A"}</Text>
                    </BlockStack>
                  </div>
                </InlineStack>

                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                    Shopify Customer ID
                  </Text>
                  <Text variant="bodyMd" fontFamily="mono">
                    {customer.shopifyCustomerId}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Locations Card */}
            {customer.locations && customer.locations.length > 0 && (
              <Card padding="0">
                <BlockStack gap="0">
                  <Box paddingInline="400" paddingBlock="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        Locations
                      </Text>
                      <Button
                        variant="primary"
                        onClick={() => setIsLocationModalOpen(true)}
                      >
                        Add Location
                      </Button>
                    </InlineStack>
                  </Box>

                  <Divider />

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
                        Address
                      </Text>,
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        City/Province/Zip
                      </Text>,
                    ]}
                    rows={locationRows}
                    hoverable
                  />
                </BlockStack>
              </Card>
            )}

            {/* No Locations - Add Location Button Card */}
            {(!customer.locations || customer.locations.length === 0) && (
              <Card padding="400">
                <BlockStack gap="300" align="center">
                  <Text variant="headingMd" as="h2">
                    No Locations
                  </Text>
                  <Text tone="subdued">
                    Add a location to get started
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => setIsLocationModalOpen(true)}
                  >
                    Add Location
                  </Button>
                </BlockStack>
              </Card>
            )}

            {/* Collections Card */}
            {customer.collections && customer.collections.length > 0 && (
              <Card padding="0">
                <BlockStack gap="0">
                  <Box paddingInline="400" paddingBlock="400">
                    <Text variant="headingMd" as="h2">
                      Associated Collections
                    </Text>
                  </Box>

                  <Divider />

                  <DataTable
                    columnContentTypes={["text", "text", "numeric"]}
                    headings={[
                      <Text
                        variant="bodySm"
                        fontWeight="semibold"
                        tone="subdued"
                      >
                        Title
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
                        Discount
                      </Text>,
                    ]}
                    rows={collectionRows}
                    hoverable
                  />
                </BlockStack>
              </Card>
            )}

            {/* Orders Card */}
            {orders && orders.length > 0 && (
              <Card padding="0">
                <BlockStack gap="0">
                  <Box paddingInline="400" paddingBlock="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">
                        Order History
                      </Text>
                      {orders.length > 10 && (
                        <Link url="/app/orders" removeUnderline={false}>
                          <Text tone="interactive">View all</Text>
                        </Link>
                      )}
                    </InlineStack>
                  </Box>

                  <Divider />

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
                </BlockStack>
              </Card>
            )}
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

      {/* Add Location Modal */}
      <Modal
        open={isLocationModalOpen}
        onClose={() => {
          if (!isLoading) {
            setIsLocationModalOpen(false);
          }
        }}
        title="Add Location"
        primaryAction={{
          content: "Add Location",
          onAction: handleAddLocation,
          loading: isLoading,
          disabled: isLoading || !locationForm.name,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              if (!isLoading) {
                setIsLocationModalOpen(false);
              }
            },
            disabled: isLoading,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Location Name"
              value={locationForm.name}
              onChange={(value) =>
                setLocationForm({ ...locationForm, name: value })
              }
              disabled={isLoading}
              placeholder="e.g. Downtown Store"
              requiredIndicator
              autoComplete="off"
            />

            <InlineStack gap="300">
              <TextField
                label="First Name"
                value={locationForm.firstName}
                onChange={(value) =>
                  setLocationForm({ ...locationForm, firstName: value })
                }
                disabled={isLoading}
                autoComplete="given-name"
              />
              <TextField
                label="Last Name"
                value={locationForm.lastName}
                onChange={(value) =>
                  setLocationForm({ ...locationForm, lastName: value })
                }
                disabled={isLoading}
                autoComplete="family-name"
              />
            </InlineStack>

            <TextField
              label="Company"
              value={locationForm.company}
              onChange={(value) =>
                setLocationForm({ ...locationForm, company: value })
              }
              disabled={isLoading}
              autoComplete="organization"
            />

            <TextField
              label="Phone"
              value={locationForm.phone}
              onChange={(value) =>
                setLocationForm({ ...locationForm, phone: value })
              }
              disabled={isLoading}
              placeholder="e.g. (555) 123-4567"
              autoComplete="tel"
            />

            <BlockStack gap="200">
              <Text variant="headingSm" as="h4">
                Address
              </Text>

              <TextField
                label="Address Line 1"
                value={locationForm.address1}
                onChange={(value) =>
                  setLocationForm({ ...locationForm, address1: value })
                }
                disabled={isLoading}
                autoComplete="street-address"
              />

              <TextField
                label="Address Line 2"
                value={locationForm.address2}
                onChange={(value) =>
                  setLocationForm({ ...locationForm, address2: value })
                }
                disabled={isLoading}
                autoComplete="address-line2"
              />

              <InlineStack gap="300">
                <TextField
                  label="City"
                  value={locationForm.city}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, city: value })
                  }
                  disabled={isLoading}
                  autoComplete="address-level2"
                />
                <TextField
                  label="Province"
                  value={locationForm.province}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, province: value })
                  }
                  disabled={isLoading}
                  autoComplete="address-level1"
                />
              </InlineStack>

              <InlineStack gap="300">
                <TextField
                  label="Country"
                  value={locationForm.country}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, country: value })
                  }
                  disabled={isLoading}
                  autoComplete="country-name"
                />
                <TextField
                  label="Zip Code"
                  value={locationForm.zip}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, zip: value })
                  }
                  disabled={isLoading}
                  autoComplete="postal-code"
                />
              </InlineStack>

              <InlineStack gap="300">
                <TextField
                  label="Province Code"
                  value={locationForm.provinceCode}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, provinceCode: value })
                  }
                  disabled={isLoading}
                />
                <TextField
                  label="Country Code"
                  value={locationForm.countryCode}
                  onChange={(value) =>
                    setLocationForm({ ...locationForm, countryCode: value })
                  }
                  disabled={isLoading}
                />
              </InlineStack>

              <TextField
                label="Country Name"
                value={locationForm.countryName}
                onChange={(value) =>
                  setLocationForm({ ...locationForm, countryName: value })
                }
                disabled={isLoading}
              />
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
