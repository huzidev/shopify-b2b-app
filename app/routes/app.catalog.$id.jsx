import React, { useState, useCallback } from "react";
import { useLoaderData, useParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCatalog } from "../models/catalog.server";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Link,
  Tabs,
  DataTable,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const catalog = await getCatalog(session.shop, params.id);
  
  return { catalog };
};

const tabs = [
  { id: "products", content: "Products" },
  { id: "pricing", content: "Pricing" },
  { id: "assignments", content: "Assignments" },
];

// Mock data for now - can be replaced with dynamic data later
const initialProducts = [
  { sku: "SKU-001", name: "Premium Beans 1kg", price: "$24.99" },
  { sku: "SKU-107", name: "Organic Tea Box", price: "$18.50" },
  { sku: "SKU-289", name: "Sparkling Water 24-pack", price: "$32.00" },
];

const pricingRules = [
  { name: "Volume discount", type: "Percentage", value: "-8%", valueColor: "#C0392B" },
  { name: "Contract price override", type: "Custom price", value: "SKU-001: $12.40", valueColor: "#202223" },
];

export default function CatalogDetail() {
  const { catalog } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchValue, setSearchValue] = useState("");

  // If catalog not found
  if (!catalog) {
    return (
      <Page
        title="Catalog Not Found"
        backAction={{
          onAction: () => navigate("/app/catalogs"),
        }}
      >
        <Card>
          <Text>Catalog not found or you don't have access to view it.</Text>
        </Card>
      </Page>
    );
  }

  const filteredProducts = initialProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchValue.toLowerCase())
  );

  const productRows = filteredProducts.map((p) => [
    <Text variant="bodyMd" tone="subdued">{p.sku}</Text>,
    <Text variant="bodyMd">{p.name}</Text>,
    <Text variant="bodyMd" alignment="end">{p.price}</Text>,
  ]);

  const pricingRows = pricingRules.map((r) => [
    <Text variant="bodyMd">{r.name}</Text>,
    <Text variant="bodyMd" tone="subdued">{r.type}</Text>,
    <Text variant="bodyMd" alignment="end">
      <span style={{ color: r.valueColor, fontWeight: 500 }}>{r.value}</span>
    </Text>,
  ]);

  // Create assignments from catalog data
  const assignments = catalog.company ? [
    { 
      company: catalog.company.name, 
      location: catalog.companyLocation?.name || "All locations", 
      status: "Active" 
    }
  ] : [];

  const assignmentRows = assignments.map((a) => [
    <Link url={`/app/company/${catalog.companyId}`} removeUnderline={false}>
      <Text tone="interactive">{a.company}</Text>
    </Link>,
    <Text variant="bodyMd">{a.location}</Text>,
    <Badge tone="success">{a.status}</Badge>,
  ]);

  return (
    <Page
      backAction={{
        onAction: () => navigate("/app/catalogs"),
      }}
      title={catalog.title || "Catalog"}
      titleMetadata={<Badge tone="success">{catalog.status || "Active"}</Badge>}
      primaryAction={<Button variant="primary">Save</Button>}
    >
      <BlockStack gap="0">
        {/* Tabs */}
        <Tabs
          tabs={tabs}
          selected={selectedTab}
          onSelect={setSelectedTab}
          fitted={false}
        />

        <Box paddingBlockStart="500">
          <BlockStack gap="500">
            {/* Products Card */}
            <Card padding="0">
              <BlockStack gap="0">
                {/* Search + Actions */}
                <Box paddingInline="300" paddingBlock="300">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{ flex: 1 }}>
                      <TextField
                        prefix={<SearchIcon />}
                        placeholder="Search products..."
                        value={searchValue}
                        onChange={setSearchValue}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => setSearchValue("")}
                      />
                    </div>
                    <Button variant="primary">Add products</Button>
                    <Button>Remove</Button>
                  </InlineStack>
                </Box>

                <Divider />

                {/* Products Table */}
                <DataTable
                  columnContentTypes={["text", "text", "numeric"]}
                  headings={[
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">SKU</Text>,
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Product name</Text>,
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Price</Text>,
                  ]}
                  rows={productRows}
                  hoverable
                />

                {productRows.length === 0 && (
                  <Box padding="800">
                    <InlineStack align="center">
                      <Text tone="subdued">No products found.</Text>
                    </InlineStack>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Pricing Rules Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Pricing rules
                    </Text>
                    <Button variant="primary">Add rule</Button>
                  </InlineStack>
                </Box>

                <Divider />

                <DataTable
                  columnContentTypes={["text", "text", "numeric"]}
                  headings={[
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Rule name</Text>,
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Type</Text>,
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Value</Text>,
                  ]}
                  rows={pricingRows}
                  hoverable
                />
              </BlockStack>
            </Card>

            {/* Assignments Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Assignments
                    </Text>
                    <Button variant="primary">Assign company</Button>
                  </InlineStack>
                </Box>

                <Divider />

                {assignmentRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={[
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Company</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Location</Text>,
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Status</Text>,
                    ]}
                    rows={assignmentRows}
                    hoverable
                  />
                ) : (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center">
                      No assignments found. Assign this catalog to companies to get started.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Box>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
