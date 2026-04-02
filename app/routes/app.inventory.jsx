import React, { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCatalogInventoryRows } from "../models/catalog.server";
import { getCollectionInventoryRows } from "../models/collection.server";
import {
  Page,
  Card,
  TextField,
  Button,
  Badge,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Popover,
  ActionList,
} from "@shopify/polaris";
import { SearchIcon, SortIcon } from "@shopify/polaris-icons";
import InventoryDataTable from "../components/InventoryDataTable";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  if (url.searchParams.get("load") === "collections") {
    const collections = await getCollectionInventoryRows(session.shop);
    return { collections };
  }

  const catalogs = await getCatalogInventoryRows(session.shop, admin);
  return { catalogs };
};

const statusBadgeTone = {
  ACTIVE: "success",
  Active: "success",
  INACTIVE: "critical",
  Inactive: "critical",
  DRAFT: "warning",
  Draft: "warning",
};

export default function Inventory() {
  const loaderData = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher();

  const [activeView, setActiveView] = useState("catalogs");
  const [catalogsCache] = useState(loaderData.catalogs || []);
  const [collectionsCache, setCollectionsCache] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);
  const [sortPopoverActive, setSortPopoverActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [requestedView, setRequestedView] = useState(null);

  const perPage = 10;

  useEffect(() => {
    if (fetcher.data?.collections) {
      setCollectionsCache(fetcher.data.collections);
      setActiveView("collections");
      setCurrentPage(1);
      setRequestedView(null);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.state === "idle") {
      setRequestedView(null);
    }
  }, [fetcher.state]);

  const showingCatalogs = activeView === "catalogs";
  const isLoadingCollections =
    requestedView === "collections" && fetcher.state !== "idle";
  const disableTableButtons = isLoadingCollections;

  const dataset = showingCatalogs ? catalogsCache : collectionsCache;

  const filteredData = useMemo(() => {
    const query = searchValue.toLowerCase().trim();
    if (!query) {
      return dataset;
    }

    if (showingCatalogs) {
      return dataset.filter(
        (catalog) =>
          catalog.title.toLowerCase().includes(query) ||
          catalog.companyName.toLowerCase().includes(query),
      );
    }

    return dataset.filter(
      (collection) =>
        collection.title.toLowerCase().includes(query) ||
        collection.description.toLowerCase().includes(query),
    );
  }, [dataset, searchValue, showingCatalogs]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = totalItems === 0 ? 0 : (safeCurrentPage - 1) * perPage + 1;
  const endIndex = Math.min(safeCurrentPage * perPage, totalItems);
  const paginatedData = filteredData.slice((safeCurrentPage - 1) * perPage, safeCurrentPage * perPage);

  const tableHeadings = showingCatalogs
    ? ["Catalog name", "Products", "Locations", "Assigned company", "Status", "Actions"]
    : ["Collection name", "Description", "Products", "Status", "Created", "Actions"];

  const tableRows = showingCatalogs
    ? paginatedData.map((catalog) => [
        <Button
          key={`catalog-name-${catalog.id}`}
          variant="plain"
          tone="success"
          onClick={() => navigate(`/app/catalog/${catalog.id}`)}
          disabled={disableTableButtons}
        >
          {catalog.title}
        </Button>,
        catalog.products,
        catalog.locations,
        catalog.companyName,
        <Badge key={`catalog-status-${catalog.id}`} tone={statusBadgeTone[catalog.status]}>
          {catalog.status}
        </Badge>,
        <Button
          key={`catalog-action-${catalog.id}`}
          variant="plain"
          onClick={() => navigate(`/app/catalog/${catalog.id}`)}
          disabled={disableTableButtons}
        >
          View
        </Button>,
      ])
    : paginatedData.map((collection) => [
        <Button
          key={`collection-name-${collection.id}`}
          variant="plain"
          tone="success"
          onClick={() => navigate(`/app/collection/${collection.id}`)}
          disabled={disableTableButtons}
        >
          {collection.title}
        </Button>,
        collection.description,
        collection.productCount,
        <Badge key={`collection-status-${collection.id}`} tone={statusBadgeTone[collection.status]}>
          {collection.status}
        </Badge>,
        collection.createdAt,
        <Button
          key={`collection-action-${collection.id}`}
          variant="plain"
          onClick={() => navigate(`/app/collection/${collection.id}`)}
          disabled={disableTableButtons}
        >
          View
        </Button>,
      ]);

  const emptyState = showingCatalogs
    ? {
        heading: "No catalogs found",
        description: searchValue
          ? "Try adjusting your search terms"
          : "Create your first catalog to get started",
        action: {
          content: "Create Catalog",
          onAction: () => navigate("/app/create-catalog"),
        },
      }
    : {
        heading: "No collections found",
        description: searchValue
          ? "Try adjusting your search terms"
          : "Create your first collection to get started",
        action: {
          content: "Create Collection",
          onAction: () => navigate("/app/create-collection"),
        },
      };

  const handleShowCollections = () => {
    setSearchValue("");
    if (collectionsCache.length > 0) {
      setActiveView("collections");
      setCurrentPage(1);
      return;
    }

    setRequestedView("collections");
    fetcher.load(`${location.pathname}?load=collections`);
  };

  const handleShowCatalogs = () => {
    setSearchValue("");
    setActiveView("catalogs");
    setCurrentPage(1);
  };

  return (
    <Page
      title="Inventory"
      backAction={{
        onAction: () => navigate("/app"),
      }}
      primaryAction={{
        content: showingCatalogs ? "Create Catalog" : "Create Collection",
        onAction: () =>
          navigate(showingCatalogs ? "/app/create-catalog" : "/app/create-collection"),
        disabled: disableTableButtons,
      }}
      secondaryActions={[
        {
          content: showingCatalogs ? "Show Collections" : "Show Catalogs",
          onAction: showingCatalogs ? handleShowCollections : handleShowCatalogs,
          loading: isLoadingCollections,
          disabled: disableTableButtons,
        },
      ]}
    >
      <Card>
        <BlockStack gap="400">
          <Box>
            <InlineStack align="space-between" gap="300" blockAlign="center">
              <div style={{ flex: 1, maxWidth: "320px" }}>
                <TextField
                  prefix={<SearchIcon />}
                  placeholder={showingCatalogs ? "Search catalogs..." : "Search collections..."}
                  value={searchValue}
                  onChange={(value) => {
                    setSearchValue(value);
                    setCurrentPage(1);
                  }}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchValue("")}
                />
              </div>

              <InlineStack gap="200">
                <Popover
                  active={statusPopoverActive}
                  activator={
                    <Button disclosure onClick={() => setStatusPopoverActive((value) => !value)}>
                      Status
                    </Button>
                  }
                  onClose={() => setStatusPopoverActive(false)}
                >
                  <ActionList
                    items={[
                      { content: "All statuses", onAction: () => setStatusPopoverActive(false) },
                      { content: "Active", onAction: () => setStatusPopoverActive(false) },
                      { content: "Inactive", onAction: () => setStatusPopoverActive(false) },
                    ]}
                  />
                </Popover>

                <Popover
                  active={sortPopoverActive}
                  activator={
                    <Button
                      icon={SortIcon}
                      disclosure
                      onClick={() => setSortPopoverActive((value) => !value)}
                    >
                      Sort
                    </Button>
                  }
                  onClose={() => setSortPopoverActive(false)}
                >
                  <ActionList
                    items={[
                      { content: "Name (A-Z)", onAction: () => setSortPopoverActive(false) },
                      { content: "Name (Z-A)", onAction: () => setSortPopoverActive(false) },
                    ]}
                  />
                </Popover>
              </InlineStack>
            </InlineStack>
          </Box>

          <Divider />

          <InventoryDataTable
            headings={tableHeadings}
            rows={tableRows}
            emptyState={emptyState}
            itemLabel={showingCatalogs ? "catalogs" : "collections"}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={totalItems}
            currentPage={safeCurrentPage}
            canGoPrevious={safeCurrentPage > 1}
            canGoNext={safeCurrentPage < totalPages}
            onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
            onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          />
        </BlockStack>
      </Card>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
