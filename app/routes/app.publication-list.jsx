import React, { useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { 
  getPublications, 
  createPublication,
  getCatalogsForPublication
} from "../models/publicationList.server";
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
  Modal,
} from "@shopify/polaris";
import { SearchIcon, SortIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    
    const [publications, catalogs] = await Promise.all([
      getPublications(session.shop),
      getCatalogsForPublication(session.shop)
    ]);

    return { publications, catalogs };
  } catch (error) {
    console.error("Error loading publications:", error);
    return { 
      publications: [], 
      catalogs: [],
      error: error.message 
    };
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "createPublication") {
      const catalogId = formData.get("catalogId");
      const title = formData.get("title");
      const defaultState = formData.get("defaultState");
      
      return await createPublication({
        admin,
        shop: session.shop,
        catalogId: catalogId ? parseInt(catalogId) : null,
        title,
        defaultState,
        autoPublish: false
      });
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Publication action error:", error);
    return { success: false, error: error.message };
  }
};

const statusBadgeTone = {
  "ALL_PRODUCTS": "success",
  "EMPTY": "warning",
  Active: "success",
  Inactive: "enabled"
};

export default function Publications() {
  const { publications, catalogs } = useLoaderData();
  const fetcher = useFetcher();
  const [searchValue, setSearchValue] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);
  const [sortPopoverActive, setSortPopoverActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Form state for create publication modal
  const [publicationTitle, setPublicationTitle] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [defaultState, setDefaultState] = useState("ALL_PRODUCTS");
  
  const perPage = 5;
  const isLoading = fetcher.state === "submitting";

  // Transform database publications to match UI format
  const transformedPublications = publications?.map(publication => ({
    id: publication.id,
    catalog: publication.catalog?.title || "No Catalog",
    catalogId: publication.catalog?.id || null,
    company: publication.catalog?.company?.name || "N/A",
    location: publication.catalog?.companyLocation?.name || "All Locations",
    status: publication.defaultState || "N/A"
  })) || [];

  const filteredPublications = transformedPublications.filter(
    (p) =>
      p.catalog.toLowerCase().includes(searchValue.toLowerCase()) ||
      p.company.toLowerCase().includes(searchValue.toLowerCase()) ||
      p.location.toLowerCase().includes(searchValue.toLowerCase())
  );

  const totalPublications = filteredPublications.length;
  const startIndex = (currentPage - 1) * perPage + 1;
  const endIndex = Math.min(currentPage * perPage, filteredPublications.length);
  const paginatedPublications = filteredPublications.slice((currentPage - 1) * perPage, currentPage * perPage);

  const allSelected =
    paginatedPublications.length > 0 &&
    paginatedPublications.every((p) => selectedIds.includes(p.id));
  const someSelected =
    selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPublications.map((p) => p.id));
    }
  }, [allSelected, paginatedPublications]);

  const handleSelectRow = useCallback((id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectedCount = selectedIds.length;

  // Create catalog options for modal dropdown
  const catalogOptions = [
    { label: "Select catalog...", value: "" },
    ...catalogs.map(catalog => ({
      label: `${catalog.title} - ${catalog.company?.name || 'Unknown Company'}`,
      value: catalog.id.toString()
    }))
  ];

  const handleCreatePublication = useCallback(() => {
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setPublicationTitle("");
    setSelectedCatalog("");
    setDefaultState("ALL_PRODUCTS");
  }, []);

  const handleSavePublication = useCallback(() => {
    fetcher.submit(
      { 
        actionType: "createPublication",
        catalogId: selectedCatalog,
        title: publicationTitle,
        defaultState: defaultState
      },
      { method: "POST" }
    );
  }, [fetcher, selectedCatalog, publicationTitle, defaultState]);

  // Close modal on successful creation
  React.useEffect(() => {
    if (fetcher.data?.success && modalOpen) {
      handleModalClose();
    }
  }, [fetcher.data, modalOpen, handleModalClose]);

  return (
    <Page
      title="Publications"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
      primaryAction={
        <Button variant="primary" onClick={handleCreatePublication}>
          Create publication
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
                  placeholder="Search publications..."
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
                    { content: "All Products", onAction: () => setStatusPopoverActive(false) },
                    { content: "Empty", onAction: () => setStatusPopoverActive(false) },
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
                    { content: "Company name A–Z", onAction: () => setSortPopoverActive(false) },
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
                    <Button>Assign to catalog</Button>
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
                gridTemplateColumns: "40px 1fr 1fr 150px 100px 80px",
                alignItems: "center",
                gap: "8px",
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
                Catalog
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Company
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Location
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Status
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued" alignment="end">
                Actions
              </Text>
            </div>
          </Box>

          <Divider />

          {/* Table Rows */}
          <BlockStack gap="0">
            {paginatedPublications.map((publication, index) => {
              const isSelected = selectedIds.includes(publication.id);
              return (
                <React.Fragment key={publication.id}>
                  <Box
                    paddingInline="400"
                    paddingBlock="300"
                    background={isSelected ? "bg-surface-selected" : undefined}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1fr 1fr 150px 100px 80px",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectRow(publication.id)}
                      />
                      <Text variant="bodyMd">
                        {publication.catalog}
                      </Text>
                      <Text variant="bodyMd" tone="subdued">
                        {publication.company}
                      </Text>
                      <Text variant="bodyMd" tone="subdued">
                        {publication.location}
                      </Text>
                      <div>
                        <Badge tone={statusBadgeTone[publication.status]}>
                          {publication.status === "ALL_PRODUCTS" ? "All Products" : publication.status}
                        </Badge>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Button variant="plain" tone="interactive">
                          View
                        </Button>
                      </div>
                    </div>
                  </Box>
                  {index < paginatedPublications.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </BlockStack>

          {/* Empty state */}
          {paginatedPublications.length === 0 && (
            <Box padding="800">
              <BlockStack align="center" inlineAlign="center" gap="200">
                <Text variant="bodyMd" tone="subdued">
                  {searchValue ? "No publications found matching your search." : "No publications found. Create your first publication to get started."}
                </Text>
                {!searchValue && (
                  <Button variant="primary" onClick={handleCreatePublication}>
                    Create publication
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
                {startIndex}–{endIndex} of {totalPublications} publications
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
                  disabled={endIndex >= totalPublications}
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>

      {/* Create Publication Modal */}
      <Modal
        open={modalOpen}
        onClose={handleModalClose}
        title="Create publication"
        primaryAction={{
          content: "Save publication",
          onAction: handleSavePublication,
          variant: "primary",
          loading: isLoading,
          disabled: !publicationTitle || isLoading
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Publication title"
              value={publicationTitle}
              onChange={setPublicationTitle}
              placeholder="e.g. Core Wholesale Publication"
              autoComplete="off"
            />

            <Select
              label="Assign catalog"
              options={catalogOptions}
              value={selectedCatalog}
              onChange={setSelectedCatalog}
              placeholder="Select catalog..."
            />

            <Select
              label="Default state"
              options={[
                { label: "All products", value: "ALL_PRODUCTS" },
                { label: "Empty (manual selection)", value: "EMPTY" }
              ]}
              value={defaultState}
              onChange={setDefaultState}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
