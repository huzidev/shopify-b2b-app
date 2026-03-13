import React, { useState } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getDashboardStats, getRecentActivity } from "../models/dashboard.server";
import { getCompanies } from "../models/company.server";
import { getCatalogs } from "../models/catalog.server";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Text,
  TextField,
  Select,
  InlineStack,
  BlockStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import HowItWorks from "../components/HowItWorks";
import CompaniesTable from "../components/CompaniesTable";
import CatalogsTable from "../components/CatalogsTable";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const [stats, activity, companies, catalogs] = await Promise.all([
    getDashboardStats(shop),
    getRecentActivity(shop),
    getCompanies(shop),
    getCatalogs(shop),
  ]);

  return {
    stats,
    activity,
    companies: companies.slice(0, 6),
    catalogs: catalogs.slice(0, 6),
  };
};

// Stat Card component mimicking Polaris Card with metric layout
function StatCard({ label, value, trend, trendType }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="bodyMd" tone="subdued">
          {label}
        </Text>
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {value}
        </Text>
        <Text variant="bodySm" as="p" tone={trendType === "success" ? "success" : trendType === "warning" ? "caution" : "subdued"}>
          {trend}
        </Text>
      </BlockStack>
    </Card>
  );
}

const statusBadgeMap = {
  Active: "success",
  Draft: "warning",
  Inactive: "enabled",
};

export default function Dashboard() {
  const { stats, activity, companies, catalogs } = useLoaderData();
  const [searchValue, setSearchValue] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  const filteredData = activity.filter((row) => {
    const matchesSearch =
      searchValue === "" ||
      row.action.toLowerCase().includes(searchValue.toLowerCase()) ||
      row.entity.toLowerCase().includes(searchValue.toLowerCase());
    const matchesFilter =
      selectedFilter === "all" ||
      row.entity.toLowerCase() === selectedFilter.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const rows = filteredData.map((row) => [
    <Text variant="bodyMd" tone="subdued">{row.time}</Text>,
    <Text variant="bodyMd">{row.entity}</Text>,
    <Text variant="bodyMd">{row.action}</Text>,
    <Badge tone={statusBadgeMap[row.status]}>{row.status}</Badge>,
  ]);

  const filterOptions = [
    { label: "All entities", value: "all" },
    { label: "Company", value: "company" },
    { label: "Location", value: "location" },
    { label: "Catalog", value: "catalog" },
    { label: "Publication", value: "publication" },
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Stats Row */}
        <InlineStack>
          <Box width="25%">
            <StatCard
              label="Total companies"
              value={stats.totalCompanies.toString()}
              trend={stats.totalCompanies > 0 ? "Companies active" : "No companies yet"}
              trendType={stats.totalCompanies > 0 ? "success" : "subdued"}
            />
          </Box>
          <Box width="25%">
            <StatCard
              label="Active catalogs"
              value={stats.activeCatalogs.toString()}
              trend={stats.activeCatalogs > 0 ? `${stats.activeCatalogs} active` : "No active catalogs"}
              trendType={stats.activeCatalogs > 0 ? "success" : "subdued"}
            />
          </Box>
          <Box width="25%">
            <StatCard
              label="Locations"
              value={stats.totalLocations.toString()}
              trend={stats.totalLocations > 0 ? "Locations configured" : "No locations yet"}
              trendType={stats.totalLocations > 0 ? "success" : "subdued"}
            />
          </Box>
          <Box width="25%">
            <StatCard
              label="Publications"
              value={stats.totalPublications.toString()}
              trend={stats.pendingPublications > 0 ? `${stats.pendingPublications} pending` : "All configured"}
              trendType={stats.pendingPublications > 0 ? "warning" : "success"}
            />
          </Box>
        </InlineStack>

        {/* How It Works */}
        <HowItWorks />

        {/* Companies */}
        <CompaniesTable companies={companies} />

        {/* Catalogs */}
        <CatalogsTable catalogs={catalogs} />

        {/* Recent Activity */}
        <Card>
          <BlockStack gap="400">
            {/* Header Row */}
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">
                Recent activity
              </Text>
              <InlineStack gap="200">
                <div style={{ width: 260 }}>
                  <TextField
                    prefix={<SearchIcon />}
                    placeholder="Search activity..."
                    value={searchValue}
                    onChange={setSearchValue}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearchValue("")}
                  />
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    options={filterOptions}
                    value={selectedFilter}
                    onChange={setSelectedFilter}
                  />
                </div>
              </InlineStack>
            </InlineStack>

            <Divider />

            {/* Data Table */}
            <DataTable
              columnContentTypes={["text", "text", "text", "text"]}
              headings={[
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">Time</Text>,
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">Entity</Text>,
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">Action</Text>,
                <Text variant="bodySm" fontWeight="semibold" tone="subdued">Status</Text>,
              ]}
              rows={rows}
              hoverable
            />

            {rows.length === 0 && (
              <Box padding="800">
                <BlockStack align="center" inlineAlign="center" gap="200">
                  <Text variant="bodyMd" tone="subdued">
                    No activity found matching your search.
                  </Text>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
