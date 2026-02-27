import React, { useState, useCallback } from "react";
import { useLoaderData, useActionData, useParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompany, updateCompany } from "../models/company.server";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
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
import { ArrowLeftIcon } from "@shopify/polaris-icons";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const company = await getCompany(session.shop, params.id);
  
  return { company };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "update") {
    const name = formData.get("name");
    return await updateCompany({
      admin,
      shop: session.shop,
      companyId: params.id,
      name
    });
  }

  return { success: false, error: "Unknown action" };
};

const paymentTermsOptions = [
  { label: "Net 15", value: "net15" },
  { label: "Net 30", value: "net30" },
  { label: "Net 45", value: "net45" },
  { label: "Net 60", value: "net60" },
  { label: "Due on receipt", value: "due" },
];

const tabs = [
  { id: "overview", content: "Overview" },
  { id: "locations", content: "Locations" },
  { id: "catalogs", content: "Catalogs" },
];

export default function CompanyDetail() {
  const { company } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [companyName, setCompanyName] = useState(company?.name || "");
  const [contactEmail, setContactEmail] = useState(company?.contactShopifyId || "");
  const [phone, setPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("net30");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  // If company not found
  if (!company) {
    return (
      <Page
        title="Company Not Found"
        backAction={{
          onAction: () => navigate("/app/manage-companies"),
        }}
      >
        <Card>
          <Text>Company not found or you don't have access to view it.</Text>
        </Card>
      </Page>
    );
  }

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  // Create summary rows from company data
  const summaryRows = [
    { label: "Status", value: <Badge tone="success">Active</Badge> },
    { label: "Locations", value: company._count?.locations || 0 },
    { label: "Assigned catalogs", value: company._count?.catalogs || 0 },
    { label: "Orders", value: company._count?.orders || 0 },
    { label: "Created", value: new Date().toLocaleDateString() }, // Can use actual creation date when available
  ];

  // Create location rows from company data
  const locationRows = company.locations?.map((location) => [
    <Link url="#" removeUnderline={false}>
      <Text tone="interactive">{location.name}</Text>
    </Link>,
    <Text tone="subdued">Location Address</Text>, // Add address field to schema if needed
    <Text>{location.catalogs?.length || 0}</Text>,
  ]) || [];

  return (
    <Page
      backAction={{
        onAction: () => navigate("/app/manage-companies"),
      }}
      title={company.name}
      titleMetadata={<Badge tone="success">Active</Badge>}
      secondaryActions={[{ content: "Edit company", onAction: () => {} }]}
      primaryAction={
        <Button variant="primary" tone="critical">
          Deactivate
        </Button>
      }
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
          <Layout>
            {/* Left Column */}
            <Layout.Section>
              <BlockStack gap="500">
                {/* Company Details Card */}
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Company details
                    </Text>

                    <InlineStack gap="400" align="start" wrap>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <TextField
                          label="Company name"
                          value={companyName}
                          onChange={setCompanyName}
                          autoComplete="off"
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <TextField
                          label="Contact email"
                          value={contactEmail}
                          onChange={setContactEmail}
                          type="email"
                          autoComplete="email"
                        />
                      </div>
                    </InlineStack>

                    <InlineStack gap="400" align="start" wrap>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <TextField
                          label="Phone"
                          value={phone}
                          onChange={setPhone}
                          type="tel"
                          autoComplete="tel"
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <Select
                          label="Payment terms"
                          options={paymentTermsOptions}
                          value={paymentTerms}
                          onChange={setPaymentTerms}
                        />
                      </div>
                    </InlineStack>

                    <TextField
                      label="Notes"
                      value={notes}
                      onChange={setNotes}
                      multiline={4}
                      autoComplete="off"
                    />

                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        onClick={handleSave}
                        tone={saved ? "success" : undefined}
                      >
                        {saved ? "Saved!" : "Save"}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Locations Card */}
                <Card padding="0">
                  <BlockStack gap="0">
                    <Box paddingInline="400" paddingBlock="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h2">
                          Locations
                        </Text>
                        <Button variant="primary">Add location</Button>
                      </InlineStack>
                    </Box>

                    <Divider />

                    {locationRows.length > 0 ? (
                      <DataTable
                        columnContentTypes={["text", "text", "numeric"]}
                        headings={[
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Location name</Text>,
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Address</Text>,
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Catalogs</Text>,
                        ]}
                        rows={locationRows}
                        hoverable
                      />
                    ) : (
                      <Box padding="400">
                        <Text tone="subdued" alignment="center">
                          No locations found. Add a location to get started.
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            {/* Right Column - Summary */}
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Summary
                  </Text>

                  <BlockStack gap="0">
                    {summaryRows.map((row, index) => (
                      <React.Fragment key={row.label}>
                        <Box paddingBlock="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodyMd" tone="subdued">
                              {row.label}
                            </Text>
                            {typeof row.value === "string" || typeof row.value === "number" ? (
                              <Text variant="bodyMd" fontWeight="semibold">
                                {row.value}
                              </Text>
                            ) : (
                              row.value
                            )}
                          </InlineStack>
                        </Box>
                        {index < summaryRows.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Box>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
