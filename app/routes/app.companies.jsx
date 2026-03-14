import React, { useState, useCallback } from "react";
import { useFetcher, useActionData, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompanies, deleteCompany, updateCompany, createCompanyLocation, deactivateCompanies } from "../models/company.server";
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
  TextContainer,
} from "@shopify/polaris";
import { SearchIcon, SortIcon, ChevronDownIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  const companies = await getCompanies(session.shop);
  
  return { companies };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "delete") {
    const companyId = formData.get("companyId");
    return await deleteCompany({
      admin,
      shop: session.shop,
      companyId
    });
  }
  
  if (actionType === "update") {
    const companyId = formData.get("companyId");
    const name = formData.get("name");
    return await updateCompany({
      admin,
      shop: session.shop,
      companyId,
      name
    });
  }
  
  if (actionType === "create-location") {
    const companyId = formData.get("companyId");
    const locationData = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      locale: formData.get("locale"),
      externalId: formData.get("externalId"),
      note: formData.get("note"),
      billingAddress: {
        address1: formData.get("billingAddress1"),
        address2: formData.get("billingAddress2"),
        city: formData.get("billingCity"),
        zip: formData.get("billingZip"),
        firstName: formData.get("billingFirstName"),
        lastName: formData.get("billingLastName"),
        phone: formData.get("billingPhone"),
        countryCode: formData.get("billingCountryCode") || "US"
      },
      shippingAddress: {
        address1: formData.get("shippingAddress1"),
        address2: formData.get("shippingAddress2"),
        city: formData.get("shippingCity"),
        zip: formData.get("shippingZip"),
        firstName: formData.get("shippingFirstName"),
        lastName: formData.get("shippingLastName"),
        phone: formData.get("shippingPhone"),
        countryCode: formData.get("shippingCountryCode") || "US"
      },
      billingSameAsShipping: formData.get("billingSameAsShipping") === "true",
      taxExempt: formData.get("taxExempt") === "true"
    };
    
    return await createCompanyLocation({
      admin,
      shop: session.shop,
      companyId,
      locationData
    });
  }

  if (actionType === "deactivate") {
    const companyIds = JSON.parse(formData.get("companyIds") || "[]");
    return await deactivateCompanies(session.shop, companyIds);
  }
  
  return { success: false, error: "Unknown action" };
};

const statusBadgeTone = {
  Active: "success",
  Inactive: "enabled",
};

export default function Companies() {
  const { companies } = useLoaderData();
  const [searchValue, setSearchValue] = useState("");
  const [selectedIds, setSelectedIds] = useState([]); 
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);
  const [sortPopoverActive, setSortPopoverActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 5;
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  // Transform database companies to match UI format
  const transformedCompanies = companies?.map(company => ({
    id: company.id,
    name: company.name,
    email: company.contactShopifyId || `contact@${company.name.toLowerCase().replace(/\s+/g, '')}.com`, // fallback email
    locations: company.locations?.length || 0,
    catalogs: company._count?.catalogs || 0,
    status: company.status || "Active",
  })) || [];

  const filteredCompanies = transformedCompanies.filter(
    (c) =>
      c.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      c.email.toLowerCase().includes(searchValue.toLowerCase())
  );

  const totalCompanies = filteredCompanies.length;
  const startIndex = (currentPage - 1) * perPage + 1;
  const endIndex = Math.min(currentPage * perPage, filteredCompanies.length);
  const paginatedCompanies = filteredCompanies.slice((currentPage - 1) * perPage, currentPage * perPage);

  const allSelected =
    paginatedCompanies.length > 0 &&
    paginatedCompanies.every((c) => selectedIds.includes(c.id));
  const someSelected =
    selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedCompanies.map((c) => c.id));
    }
  }, [allSelected, paginatedCompanies]);

  const handleSelectRow = useCallback((id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectedCount = selectedIds.length;

  const handleDeactivateConfirm = useCallback(() => {
    fetcher.submit(
      { actionType: "deactivate", companyIds: JSON.stringify(selectedIds) },
      { method: "POST" }
    );
    setShowDeactivateModal(false);
    setSelectedIds([]);
  }, [fetcher, selectedIds]);

  return (
    <Page
      title="Companies"
      backAction={{
        onAction: () => navigate("/app"),
      }}
      primaryAction={
        <Button variant="primary" onClick={() => navigate("/app/create-company")}>
          Create company
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
                  placeholder="Search companies..."
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
                    { content: "Company name A–Z", onAction: () => setSortPopoverActive(false) },
                    { content: "Company name Z–A", onAction: () => setSortPopoverActive(false) },
                    { content: "Most locations", onAction: () => setSortPopoverActive(false) },
                    { content: "Most catalogs", onAction: () => setSortPopoverActive(false) },
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
                    <Button
                      tone="critical"
                      onClick={() => setShowDeactivateModal(true)}
                    >
                      Deactivate
                    </Button>
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
                gridTemplateColumns: "40px 1fr 1fr 100px 100px 100px 80px",
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
                Company name
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                Email
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued" alignment="end">
                Locations
              </Text>
              <Text variant="bodySm" fontWeight="semibold" tone="subdued" alignment="end">
                Catalogs
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
            {paginatedCompanies.map((company, index) => {
              const isSelected = selectedIds.includes(company.id);
              return (
                <React.Fragment key={company.id}>
                  <Box
                    paddingInline="400"
                    paddingBlock="300"
                    background={isSelected ? "bg-surface-selected" : undefined}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1fr 1fr 100px 100px 100px 80px",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectRow(company.id)}
                      />
                      <Link onClick={() => navigate(`/app/company/${company.id}`)} monochrome>
                        <Text variant="bodyMd">
                          {company.name}
                        </Text>
                      </Link>
                      <Text variant="bodyMd" tone="subdued">
                        {company.email}
                      </Text>
                      <Text variant="bodyMd" alignment="end">
                        {company.locations}
                      </Text>
                      <Text variant="bodyMd" alignment="end">
                        {company.catalogs}
                      </Text>
                      <div>
                        <Badge tone={statusBadgeTone[company.status]}>
                          {company.status}
                        </Badge>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Link onClick={() => navigate(`/app/company/${company.id}`)} monochrome>
                          View
                        </Link>
                      </div>
                    </div>
                  </Box>
                  {index < paginatedCompanies.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </BlockStack>

          {/* Empty state */}
          {paginatedCompanies.length === 0 && (
            <Box padding="800">
              <BlockStack align="center" inlineAlign="center" gap="200">
                <Text variant="bodyMd" tone="subdued">
                  {searchValue ? "No companies found matching your search." : "No companies found. Create your first company to get started."}
                </Text>
                {!searchValue && (
                  <Button variant="primary" url="/app/create-company">
                    Create company
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
                {startIndex}–{endIndex} of {totalCompanies} companies
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
                  disabled={endIndex >= totalCompanies}
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>

      {/* Deactivate Confirmation Modal */}
      <Modal
        open={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        title="Deactivate companies"
        primaryAction={{
          content: "Deactivate",
          destructive: true,
          onAction: handleDeactivateConfirm,
          loading: fetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowDeactivateModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <Text as="p">
              Are you sure you want to deactivate {selectedIds.length}{" "}
              {selectedIds.length === 1 ? "company" : "companies"}? Their status
              will be set to Inactive. You can reactivate them at any time.
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
