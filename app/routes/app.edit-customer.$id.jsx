import { useEffect, useState, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineStack,
  Box,
  Divider,
  Badge,
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
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  return {
    customer,
  };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { id: customerId } = params;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

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
    if (actionType === "updateCustomer") {
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const email = (formData.get("email") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();

      // Update in local database
      const updatedCustomer = await db.customer.update({
        where: { id: customer.id },
        data: {
          firstName: firstName || null,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
        },
      });

      // Update in Shopify via metafields
      const customerGid = `gid://shopify/Customer/${customer.shopifyCustomerId}`;
      
      const metafieldResponse = await admin.graphql(
        `#graphql
        mutation updateCustomerMetafields($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer {
              id
              firstName
              lastName
              email
            }
            userErrors {
              message
              field
            }
          }
        }`,
        {
          variables: {
            input: {
              id: customerGid,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              email: email || undefined,
              phone: phone || undefined,
            },
          },
        },
      );

      const json = await metafieldResponse.json();
      const result = json?.data?.customerUpdate;

      if (result?.userErrors?.length > 0) {
        return { success: false, error: result.userErrors[0].message };
      }

      return { 
        success: true, 
        message: "Customer updated successfully",
        customer: updatedCustomer 
      };
    }

    return { success: false, error: "Invalid action type" };
  } catch (error) {
    console.error("Error in action:", error);
    return { success: false, error: error.message };
  }
};

export default function EditCustomer() {
  const { customer } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [firstName, setFirstName] = useState(customer?.firstName || "");
  const [lastName, setLastName] = useState(customer?.lastName || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Customer updated successfully");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        actionType: "updateCustomer",
        firstName,
        lastName,
        email,
        phone,
      },
      { method: "POST" },
    );
  }, [firstName, lastName, email, phone, fetcher]);

  return (
    <Page
      title={`Edit ${customer?.firstName} ${customer?.lastName}`}
      backAction={{
        onAction: () => navigate(`/app/customer/${customer?.shopifyNumericId}`),
      }}
    >
      <Layout>
        {/* Left Column */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Customer Details
              </Text>

              <InlineStack gap="400" align="start" wrap>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <TextField
                    label="First Name"
                    value={firstName}
                    onChange={setFirstName}
                    autoComplete="off"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <TextField
                    label="Last Name"
                    value={lastName}
                    onChange={setLastName}
                    autoComplete="off"
                  />
                </div>
              </InlineStack>

              <InlineStack gap="400" align="start" wrap>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <TextField
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    autoComplete="tel"
                  />
                </div>
              </InlineStack>

              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleSave}
                  tone={saved ? "success" : undefined}
                  loading={fetcher.state === "submitting"}
                >
                  {saved ? "Saved!" : "Save"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right Column - Summary */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Summary
              </Text>

              <BlockStack gap="0">
                <Box paddingBlock="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" tone="subdued">
                      Status
                    </Text>
                    <Badge tone="success">Active</Badge>
                  </InlineStack>
                </Box>
                <Divider />
                <Box paddingBlock="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" tone="subdued">
                      Shopify ID
                    </Text>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {customer?.shopifyNumericId}
                    </Text>
                  </InlineStack>
                </Box>
                <Divider />
                <Box paddingBlock="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" tone="subdued">
                      Member Since
                    </Text>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {new Date(customer?.createdAt).toLocaleDateString()}
                    </Text>
                  </InlineStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
