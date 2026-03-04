import React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrder } from "../models/order.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  DataTable,
  Link,
} from "@shopify/polaris";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const order = await getOrder(session.shop, params.id);
  
  return { order };
};

export default function OrderDetail() {
  const { order } = useLoaderData();
  const navigate = useNavigate();

  // If order not found
  if (!order) {
    return (
      <Page
        title="Order Not Found"
        backAction={{
          onAction: () => navigate("/app/companies"),
        }}
      >
        <Card>
          <Text>Order not found or you don't have access to view it.</Text>
        </Card>
      </Page>
    );
  }

  // Format order items for the table
  const orderItemRows = order.orderItems?.map((item) => [
    <Text fontWeight="semibold">{item.variant?.product?.title || "Unknown Product"}</Text>,
    <Text tone="subdued">{item.variant?.title || ""}</Text>,
    <Text tone="subdued">{item.variant?.sku || "N/A"}</Text>,
    <Text>{item.quantity}</Text>,
    <Text>${
      typeof item.price === 'object' && item.price?.d
        ? item.price.d[0]
        : parseFloat(item.price || 0).toFixed(2)
    }</Text>,
    <Text fontWeight="semibold">${
      typeof item.price === 'object' && item.price?.d
        ? (item.price.d[0] * item.quantity).toFixed(2)
        : (parseFloat(item.price || 0) * item.quantity).toFixed(2)
    }</Text>,
  ]) || [];

  // Calculate totals
  const subtotal = order.orderItems?.reduce((sum, item) => {
    const price = typeof item.price === 'object' && item.price?.d
      ? item.price.d[0]
      : parseFloat(item.price || 0);
    return sum + (price * item.quantity);
  }, 0) || 0;

  const orderStatus = "Pending"; // You might want to add status field to schema
  const orderDate = new Date(order.createdAt).toLocaleDateString();

  return (
    <Page
      backAction={{
        onAction: () => navigate(-1),
      }}
      title={`Order #${order.orderNumber || order.id}`}
      titleMetadata={<Badge tone="info">{orderStatus}</Badge>}
      secondaryActions={[
        { content: "Print Order", onAction: () => window.print() }
      ]}
    >
      <Layout>
        {/* Left Column - Order Details */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Order Information */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Order Information
                </Text>

                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Order Number:</Text>
                    <Text variant="bodyMd" fontWeight="semibold">
                      #{order.orderNumber || order.id}
                    </Text>
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Order Date:</Text>
                    <Text variant="bodyMd">{orderDate}</Text>
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Status:</Text>
                    <Badge tone="info">{orderStatus}</Badge>
                  </InlineStack>

                  {order.company && (
                    <>
                      <Divider />
                      <InlineStack align="space-between">
                        <Text variant="bodyMd" tone="subdued">Company:</Text>
                        <Link url={`/app/company/${order.company.id}`} removeUnderline={false}>
                          <Text tone="interactive">{order.company.name}</Text>
                        </Link>
                      </InlineStack>
                    </>
                  )}

                  <Divider />

                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Total Items:</Text>
                    <Text variant="bodyMd">{order.orderItems?.length || 0}</Text>
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="subdued">Currency:</Text>
                    <Text variant="bodyMd">{order.currency || "USD"}</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Order Items */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <Text variant="headingMd" as="h2">
                    Order Items
                  </Text>
                </Box>

                <Divider />

                {orderItemRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "numeric", "numeric"]}
                    headings={[
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Product</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Variant</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">SKU</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Quantity</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Unit Price</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Total</Text>,
                    ]}
                    rows={orderItemRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No items found in this order.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right Column - Order Summary */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Order Summary
              </Text>

              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="bodyMd">Subtotal:</Text>
                  <Text variant="bodyMd">${subtotal.toFixed(2)}</Text>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodyMd">Tax:</Text>
                  <Text variant="bodyMd">$0.00</Text>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text variant="bodyMd">Shipping:</Text>
                  <Text variant="bodyMd">$0.00</Text>
                </InlineStack>

                <Divider />

                <InlineStack align="space-between">
                  <Text variant="bodyLg" fontWeight="semibold">Total:</Text>
                  <Text variant="bodyLg" fontWeight="semibold">
                    ${
                      typeof order.totalPrice === 'object' && order.totalPrice?.d
                        ? order.totalPrice.d[0]
                        : parseFloat(order.totalPrice || subtotal).toFixed(2)
                    } {order.currency || "USD"}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};