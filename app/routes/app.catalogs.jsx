import React, { useState, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCatalogs } from "../models/catalog.server";
import {
  Page,
  Card,
  TextField,
  Button,
  Badge,
  Text,
  Checkbox,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Link,
  Select,
  Popover,
  ActionList,
} from "@shopify/polaris";
import { SearchIcon, SortIcon, ChevronDownIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const catalogs = await getCatalogs(session.shop);
  
  return { catalogs };
};

const statusBadgeTone = {
  Active: "success",
  ACTIVE: "success", 
  Inactive: "enabled",
  INACTIVE: "enabled",
  Draft: "warning",
  DRAFT: "warning",
};

export default function Catalogs() {
  const { catalogs } = useLoaderData();
  const [searchValue, setSearchValue] = useState("");
  const [selectedIds, setSelectedIds] = useState([]); 
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);
  const [sortPopoverActive, setSortPopoverActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 5;
  const navigate = useNavigate();

  console.log('SW what is catalogs', catalogs);

  // Transform database catalogs to match UI format
  const transformedCatalogs = catalogs?.map(catalog => ({
    id: catalog.id,
    name: catalog.title,
    products: catalog.publications?.reduce((total, pub) => total + (pub.products?.length || 0), 0) || 0,
    assignedCompanies: 1, // For now, each catalog is assigned to one company
    companyName: catalog.company?.name || "N/A",
    status: catalog.status || "Active"
  })) || [];

  const filteredCatalogs = transformedCatalogs.filter(
    (c) =>
      c.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      c.companyName.toLowerCase().includes(searchValue.toLowerCase())
  );

  const totalCatalogs = filteredCatalogs.length;
  const startIndex = (currentPage - 1) * perPage + 1;
  const endIndex = Math.min(currentPage * perPage, filteredCatalogs.length);
  const paginatedCatalogs = filteredCatalogs.slice((currentPage - 1) * perPage, currentPage * perPage);

  const allSelected =
    paginatedCatalogs.length > 0 &&
    paginatedCatalogs.every((c) => selectedIds.includes(c.id));
  const someSelected =
    selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedCatalogs.map((c) => c.id));
    }
  }, [allSelected, paginatedCatalogs]);

  const handleSelectRow = useCallback((id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectedCount = selectedIds.length;

  return (
    <Page
      title="Catalogs"
      backAction={{
        onAction: () => navigate("/app"),
      }}
      primaryAction={
        <Button onClick={() => navigate("/app/create-catalog")} variant="primary">
          Create catalog
        </Button>
      }
    >
      <Card padding="0">
        <BlockStack gap="0">
          {/* Search + Filters */}
          <Box padding="300">
            <InlineStack gap="200" blockAlign="center">
              <div style={{ flex: 1 }}>
                <TextField
                  prefix={<SearchIcon />}
                  placeholder="Search catalogs..."
                  value={searchValue}
                  onChange={setSearchValue}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchValue("")}
                />
              </div>

              {/* Status Filter */}
              <Popover
                active={statusPopoverActive}
                activator={
                  <Button
                    disclosure
                    onClick={() => setStatusPopoverActive((v) => !v)}
                  >
                    Status
                  </Button>
                }
                onClose={() => setStatusPopoverActive(false)}
              >
                <ActionList
                  items={[
                    { content: "All", onAction: () => setStatusPopoverActive(false) },
                    { content: "Active", onAction: () => setStatusPopoverActive(false) },
                    { content: "Inactive", onAction: () => setStatusPopoverActive(false) },
                    { content: "Draft", onAction: () => setStatusPopoverActive(false) },
                  ]}
                />
              </Popover>

              {/* Sort */}
              <Popover
                active={sortPopoverActive}
                activator={
                  <Button
                    icon={SortIcon}
                    onClick={() => setSortPopoverActive((v) => !v)}
                  >
                    Sort
                  </Button>
                }
                onClose={() => setSortPopoverActive(false)}
              >
                <ActionList
                  items={[
                    { content: "Catalog name A–Z", onAction: () => setSortPopoverActive(false) },
                    { content: "Catalog name Z–A", onAction: () => setSortPopoverActive(false) },
                    { content: "Most products", onAction: () => setSortPopoverActive(false) },
                    { content: "Most companies", onAction: () => setSortPopoverActive(false) },
                  ]}
                />
              </Popover>
            </InlineStack>
          </Box>

          <Divider />

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <>
              <Box
                paddingInline="400"
                paddingBlock="300"
                background="bg-surface-selected"
              >
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={handleSelectAll}
                    />
                    <Text variant="bodyMd" fontWeight="semibold">
                      {selectedCount} selected
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button>Assign to company</Button>
                    <Button>Deactivate</Button>
                  </InlineStack>
                </InlineStack>
              </Box>
              <Divider />
            </>
          )}

          {/* Table Header */}
          <Box paddingInline="400" paddingBlock="300">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(0, 2fr) 80px minmax(0, 1.5fr) 110px 70px",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {selectedCount === 0 && (
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                />
              )}
              {selectedCount > 0 && <div />}
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Catalog name
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Products
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Assigned company
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Status
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Actions
              </Text>
            </div>
          </Box>

          <Divider />

          {/* Table Rows */}
          <BlockStack gap="0">
            {paginatedCatalogs.map((catalog, index) => {
              const isSelected = selectedIds.includes(catalog.id);
              return (
                <React.Fragment key={catalog.id}>
                  <Box
                    paddingInline="400"
                    paddingBlock="300"
                    background={isSelected ? "bg-surface-selected" : undefined}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px minmax(0, 2fr) 80px minmax(0, 1.5fr) 110px 70px",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectRow(catalog.id)}
                      />
                      <Text variant="bodyMd" tone="interactive">
                        {catalog.name}
                      </Text>
                      <Text variant="bodyMd">
                        {catalog.products}
                      </Text>
                      <Text variant="bodyMd" tone="subdued" truncate>
                        {catalog.companyName}
                      </Text>
                      <div>
                        <Badge tone={statusBadgeTone[catalog.status]}>
                          {catalog.status}
                        </Badge>
                      </div>
                      <div>
                        <Button variant="plain" tone="interactive" onClick={() => navigate(`/app/catalog/${catalog.id}`)}>
                          View
                        </Button>
                      </div>
                    </div>
                  </Box>
                  {index < paginatedCatalogs.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </BlockStack>

          {/* Empty state */}
          {paginatedCatalogs.length === 0 && (
            <Box padding="800">
              <BlockStack align="center" inlineAlign="center" gap="200">
                <Text variant="bodyMd" tone="subdued">
                  {searchValue ? "No catalogs found matching your search." : "No catalogs found. Create your first catalog to get started."}
                </Text>
                {!searchValue && (
                  <Button variant="primary" url="/app/create-catalog">
                    Create catalog
                  </Button>
                )}
              </BlockStack>
            </Box>
          )}

          <Divider />

          {/* Pagination Footer */}
          <Box paddingInline="400" paddingBlock="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" tone="subdued">
                {startIndex}–{endIndex} of {totalCatalogs} catalogs
              </Text>
              <InlineStack gap="200">
                <Button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={endIndex >= totalCatalogs}
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
