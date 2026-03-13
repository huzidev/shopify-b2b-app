import React from "react";
import {
  Card,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import { StoreIcon, ProductIcon, DiscountIcon, CheckIcon } from "@shopify/polaris-icons";

const HOW_IT_WORKS_STEPS = [
  {
    number: 1,
    icon: StoreIcon,
    title: "Select Company & Location",
    description:
      "Choose a B2B company and assign one or more of its locations to scope the catalog to the right buyers.",
  },
  {
    number: 2,
    icon: ProductIcon,
    title: "Add Products to Catalog",
    description:
      "Pick individual products manually or add your entire inventory in one click to build the catalog.",
  },
  {
    number: 3,
    icon: DiscountIcon,
    title: "Define Discounts",
    description:
      "Set pricing rules and percentage-based discounts that apply exclusively to this catalog's buyers.",
  },
  {
    number: 4,
    icon: CheckIcon,
    title: "Save & Publish",
    description:
      "Save the catalog and publish it so the assigned company locations can immediately access their pricing.",
  },
];

export default function HowItWorks() {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">
            How it works
          </Text>
          <Text variant="bodySm" tone="subdued">
            Follow these four steps to create and publish a B2B catalog for your buyers.
          </Text>
        </BlockStack>

        <Divider />

        <InlineStack gap="400" wrap={false} align="space-between">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <Box
              key={step.number}
              width="25%"
              padding="300"
              borderWidth="025"
              borderColor="border"
              borderRadius="200"
              background="bg-surface-secondary"
            >
              <BlockStack gap="300">
                {/* Step number + icon row */}
                <InlineStack align="space-between" blockAlign="center">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Text variant="bodyLg" fontWeight="bold" as="span">
                      {step.number}
                    </Text>
                  </div>
                  <div>
                    <Icon source={step.icon} tone="brand" />
                  </div>
                </InlineStack>

                {/* Step content */}
                <BlockStack gap="100">
                  <Text variant="bodyMd" fontWeight="semibold" as="h3">
                    {step.title}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {step.description}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Box>
          ))}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
