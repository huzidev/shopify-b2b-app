import React from "react";
import { Card, Text, BlockStack, InlineStack, Badge } from "@shopify/polaris";

export default function ProductSyncIntroCard({ productCount }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h2">
            Sync Products from Shopify
          </Text>
          <Badge tone="info">{productCount} tracked</Badge>
        </InlineStack>
        <Text tone="subdued">
          Pull the latest products from Shopify into your B2B database. Existing records are updated,
          and newly discovered products are added automatically.
        </Text>
      </BlockStack>
    </Card>
  );
}
