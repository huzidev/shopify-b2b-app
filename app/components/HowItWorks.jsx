import React from "react";
import {
  Card,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Icon,
  Button,
} from "@shopify/polaris";
import { StoreIcon, ProductIcon, DiscountIcon, CheckIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router";

const HOW_IT_WORKS_STEPS = [
  {
    number: 1,
    icon: StoreIcon,
    title: "Select Company & Location",
    description:
      "Choose a B2B company and assign one or more of its locations to scope the catalog to the right buyers.",
    actionLabel: "Create company",
    actionRoute: "/app/create-company",
  },
  {
    number: 2,
    icon: ProductIcon,
    title: "Add Products to Catalog",
    description:
      "Pick individual products manually or add your entire inventory in one click to build the catalog.",
    actionLabel: "Create catalog",
    actionRoute: "/app/create-catalog",
  },
  {
    number: 3,
    icon: DiscountIcon,
    title: "Define Discounts",
    description:
      "Set pricing rules and percentage-based discounts that apply exclusively to this catalog's buyers.",
    actionLabel: "Define discounts",
    actionRoute: "/app/create-catalog",
  },
  {
    number: 4,
    icon: CheckIcon,
    title: "Save & Publish",
    description:
      "Save the catalog and publish it so the assigned company locations can immediately access their pricing.",
    actionLabel: "View catalogs",
    actionRoute: "/app/catalogs",
  },
];

export default function HowItWorks() {
  const navigate = useNavigate();

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

        <InlineStack gap="400" wrap={false} align="space-between" blockAlign="stretch">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <Box
              key={step.number}
              width="25%"
              padding="300"
              borderWidth="025"
              borderColor="border"
              borderRadius="200"
              background="bg-surface-secondary"
            >
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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

                <div style={{ marginTop: "auto", paddingTop: 12 }}>
                  <Button size="slim" onClick={() => navigate(step.actionRoute)}>
                    {step.actionLabel}
                  </Button>
                </div>
              </div>
            </Box>
          ))}
        </InlineStack>

        <Divider />

        <Box
          padding="400"
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          background="bg-surface-secondary"
        >
          <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
            <BlockStack gap="100">
              <Text variant="headingSm" as="h3">
                Sync Products
              </Text>
              <Text variant="bodySm" tone="subdued">
                Run a product sync to import Shopify products into your app database. New products
                created later will sync automatically via the product create webhook.
              </Text>
            </BlockStack>

            <Button variant="primary" onClick={() => navigate("/app/product-sync")}>
              Sync products
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Card>
  );
}
