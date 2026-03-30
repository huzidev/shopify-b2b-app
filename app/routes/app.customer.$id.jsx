import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Grid,
  IndexTable,
} from "@shopify/polaris";

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
      locations: true,
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

export default function CustomerDetail() {
  const { customer, orders } = useLoaderData();
  const navigate = useNavigate();

  const orderRows = (orders || []).map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {order.orderNumber || `Order #${order.id}`}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(order.createdAt).toLocaleDateString()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        ${parseFloat(order.totalPrice || 0).toFixed(2)} {order.currency}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {order.orderItems?.length || 0}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title={`${customer.firstName} ${customer.lastName}`}
      backAction={{
        onAction: () => navigate("/app/customer-sync"),
      }}
      secondaryActions={[
        {
          content: "Edit",
          onAction: () => navigate(`/app/edit-customer/${customer.shopifyNumericId}`),
        },
      ]}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Customer Information
            </Text>
            <Grid columns={{ xs: 1, sm: 2, md: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                    Email
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {customer.email || "N/A"}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                    Phone
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {customer.phone || "N/A"}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                    State
                  </Text>
                  <Badge tone={customer.state === "ENABLED" ? "success" : "warning"}>
                    {customer.state || "N/A"}
                  </Badge>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                    Shopify ID
                  </Text>
                  <Text as="p" variant="bodySm" fontFamily="mono">
                    {customer.shopifyNumericId}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">
                    Member Since
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </Text>
                </BlockStack>
              </Card>
            </Grid>
          </BlockStack>
        </Card>

        {customer.locations && customer.locations.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Locations ({customer.locations.length})
              </Text>
              <BlockStack gap="200">
                {customer.locations.map((location) => (
                  <Card key={location.id} subdued>
                    <BlockStack gap="150">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {location.name}
                        </Text>
                      </InlineStack>
                      <Grid columns={{ xs: 1, sm: 2 }}>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Address
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.address1}
                            {location.address2 && <span>, {location.address2}</span>}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.city}, {location.province} {location.zip}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.countryName}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Contact
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.firstName} {location.lastName}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.phone}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {location.company}
                          </Text>
                        </BlockStack>
                      </Grid>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {orders && orders.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Order History ({orders.length})
              </Text>
              <IndexTable
                resourceName={{ singular: "order", plural: "orders" }}
                itemCount={orders.length}
                selectable={false}
                headings={[
                  { title: "Order" },
                  { title: "Date" },
                  { title: "Total" },
                  { title: "Items" },
                ]}
              >
                {orderRows}
              </IndexTable>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
