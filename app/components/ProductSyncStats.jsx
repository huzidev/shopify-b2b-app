import React from "react";
import { Card, Text, BlockStack, InlineStack, Box } from "@shopify/polaris";

function MetricCard({ label, value, trend, trendType }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="bodyMd" tone="subdued">
          {label}
        </Text>
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {value}
        </Text>
        <Text
          variant="bodySm"
          as="p"
          tone={
            trendType === "success"
              ? "success"
              : trendType === "warning"
                ? "caution"
                : "subdued"
          }
        >
          {trend}
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function ProductSyncStats({ stats }) {
  return (
    <InlineStack>
      <Box width="50%">
        <MetricCard
          label="Products Stored"
          value={stats.productCount.toString()}
          trend={stats.productCount > 0 ? "Products in database" : "No products stored"}
          trendType={stats.productCount > 0 ? "success" : "subdued"}
        />
      </Box>
      <Box width="50%">
        <MetricCard
          label="Variants Stored"
          value={stats.variantCount.toString()}
          trend={stats.variantCount > 0 ? "Variants in database" : "No variants stored"}
          trendType={stats.variantCount > 0 ? "success" : "subdued"}
        />
      </Box>
    </InlineStack>
  );
}
