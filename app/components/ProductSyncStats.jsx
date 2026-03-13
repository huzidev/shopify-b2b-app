import React from "react";
import { Card, Text, BlockStack } from "@shopify/polaris";

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
    <div style={{ display: "flex", gap: "16px" }}>
      <div style={{ flex: 1 }}>
        <MetricCard
          label="Products Stored"
          value={stats.productCount.toString()}
          trend={stats.productCount > 0 ? "Products in database" : "No products stored"}
          trendType={stats.productCount > 0 ? "success" : "subdued"}
        />
      </div>
      <div style={{ flex: 1 }}>
        <MetricCard
          label="Variants Stored"
          value={stats.variantCount.toString()}
          trend={stats.variantCount > 0 ? "Variants in database" : "No variants stored"}
          trendType={stats.variantCount > 0 ? "success" : "subdued"}
        />
      </div>
    </div>
  );
}
