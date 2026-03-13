import React from "react";
import { Card, DataTable, Badge, Text, BlockStack, Box, Button } from "@shopify/polaris";

const statusBadgeTone = {
  Active: "success",
  Inactive: "enabled",
};

export default function CompaniesTable({ companies = [] }) {
  const rows = companies.map((company) => [
    <Text variant="bodyMd" fontWeight="semibold">
      {company.name}
    </Text>,
    <Text variant="bodyMd" tone="subdued">
      {company.locations?.length || 0}
    </Text>,
    <Text variant="bodyMd" tone="subdued">
      {company._count?.catalogs || 0}
    </Text>,
    <Text variant="bodyMd" tone="subdued">
      {company._count?.orders || 0}
    </Text>,
    <Badge tone={statusBadgeTone.Active}>Active</Badge>,
    <Button url={`/app/company/${company.id}`} size="slim" variant="plain">
      View
    </Button>,
  ]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Companies
        </Text>

        <DataTable
          columnContentTypes={["text", "numeric", "numeric", "numeric", "text", "text"]}
          headings={[
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Company
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Locations
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Catalogs
            </Text>,
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">
              Orders
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
              No companies found.
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
