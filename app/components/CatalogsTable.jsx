import React from "react";
import { Card, DataTable, Badge, Text, BlockStack, Box, Button } from "@shopify/polaris";

const statusBadgeTone = {
  Active: "success",
  ACTIVE: "success",
  Inactive: "enabled",
  INACTIVE: "enabled",
  Draft: "warning",
  DRAFT: "warning",
};

export default function CatalogsTable({ catalogs = [] }) {
  const rows = catalogs.map((catalog) => {
    const status = catalog.status || "ACTIVE";
    const productsCount =
      catalog.publications?.reduce(
        (total, publication) => total + (publication.products?.length || 0),
        0,
      ) || 0;

    return [
      <Text variant="bodyMd" fontWeight="semibold">
        {catalog.title}
      </Text>,
      <Text variant="bodyMd" tone="subdued">
        {catalog.company?.name || "-"}
      </Text>,
      <Text variant="bodyMd" tone="subdued">
        {catalog.companyLocation?.name || "-"}
      </Text>,
      <Text variant="bodyMd" tone="subdued">
        {productsCount}
      </Text>,
      <Badge tone={statusBadgeTone[status] || "enabled"}>{status}</Badge>,
      <Button onClick={() => navigate(`/app/catalog/${catalog.id}`)} size="slim" variant="plain">
        View
      </Button>,
    ];
  });

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Catalogs
        </Text>

        <DataTable
          columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
          headings={[
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Catalog
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Company
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Location
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Products
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Status
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Action
            </Text>,
          ]}
          rows={rows}
          hoverable
        />

        {rows.length === 0 && (
          <Box padding="400">
            <Text variant="bodyMd" tone="subdued" alignment="center" as="p">
              No catalogs found.
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
