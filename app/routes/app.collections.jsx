import React, { useState, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCollections, updateCollectionStatus, deleteCollection } from "../models/collection.server";
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
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { SearchIcon, SortIcon, ChevronDownIcon, ViewIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const collections = await getCollections(session.shop);
  
  return { collections };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "bulkDelete") {
      const collectionIds = JSON.parse(formData.get("collectionIds") || "[]");
      let successCount = 0;
      let errorCount = 0;
      
      for (const collectionId of collectionIds) {
        const result = await deleteCollection(session.shop, collectionId);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }
      
      return { 
        success: true, 
        message: `${successCount} collection(s) deleted successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}` 
      };
    }
    
    if (actionType === "bulkUpdateStatus") {
      const collectionIds = JSON.parse(formData.get("collectionIds") || "[]");
      const status = formData.get("status");
      let successCount = 0;
      let errorCount = 0;
      
      for (const collectionId of collectionIds) {
        const result = await updateCollectionStatus(session.shop, collectionId, status);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }
      
      return { 
        success: true, 
        message: `${successCount} collection(s) updated successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}` 
      };
    }
    
    if (actionType === "deleteCollection") {
      const collectionId = formData.get("collectionId");
      
      const result = await deleteCollection(session.shop, collectionId);
      return { success: result.success, error: result.error || null };
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const statusBadgeTone = {
  ACTIVE: "success",
  INACTIVE: "critical",
};

export default function AppCollections() {
  const { collections } = useLoaderData();
  const [searchValue, setSearchValue] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [statusPopoverActive, setStatusPopoverActive] = useState(false);
  const [sortPopoverActive, setSortPopoverActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState({ open: false, collectionId: null, collectionTitle: "" });
  const [bulkActionModal, setBulkActionModal] = useState({ open: false, action: null, collections: [] });
  const perPage = 10;
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  // Handle action results
  React.useEffect(() => {
    if (fetcher.data?.success) {
      const message = fetcher.data.message || "Action completed successfully!";
      shopify.toast.show(message);
      setDeleteModal({ open: false, collectionId: null, collectionTitle: "" });
      setBulkActionModal({ open: false, action: null, collections: [] });
      setSelectedIds([]);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  // Transform collections for display
  const transformedCollections = collections?.map(collection => ({
    id: collection.id,
    title: collection.title,
    description: collection.description || "No description",
    productCount: collection._count?.products || 0,
    status: collection.status,
    createdAt: new Date(collection.createdAt).toLocaleDateString(),
    updatedAt: new Date(collection.updatedAt).toLocaleDateString(),
  })) || [];

  // Filter collections
  const filteredCollections = transformedCollections.filter(collection =>
    collection.title.toLowerCase().includes(searchValue.toLowerCase()) ||
    collection.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Pagination
  const totalCollections = filteredCollections.length;
  const startIndex = (currentPage - 1) * perPage + 1;
  const endIndex = Math.min(currentPage * perPage, filteredCollections.length);
  const paginatedCollections = filteredCollections.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Selection logic
  const allSelected =
    paginatedCollections.length > 0 &&
    paginatedCollections.every(collection => selectedIds.includes(collection.id));
  const someSelected =
    selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedCollections.map(collection => collection.id));
    }
  }, [allSelected, paginatedCollections]);

  const handleSelectRow = useCallback((id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  // Handle bulk actions
  const handleBulkDelete = useCallback(() => {
    const selectedCollections = paginatedCollections.filter(c => selectedIds.includes(c.id));
    setBulkActionModal({
      open: true,
      action: 'delete',
      collections: selectedCollections
    });
  }, [selectedIds, paginatedCollections]);

  const handleBulkInactive = useCallback(() => {
    const selectedCollections = paginatedCollections.filter(c => selectedIds.includes(c.id));
    setBulkActionModal({
      open: true,
      action: 'inactive',
      collections: selectedCollections
    });
  }, [selectedIds, paginatedCollections]);

  const handleBulkActionConfirm = useCallback(() => {
    const formData = new FormData();
    formData.append("collectionIds", JSON.stringify(selectedIds));
    
    if (bulkActionModal.action === 'delete') {
      formData.append("actionType", "bulkDelete");
    } else if (bulkActionModal.action === 'inactive') {
      formData.append("actionType", "bulkUpdateStatus");
      formData.append("status", "INACTIVE");
    }
    
    fetcher.submit(formData, { method: "POST" });
  }, [bulkActionModal.action, selectedIds, fetcher]);

  // Handle delete
  const handleDeleteClick = useCallback((collection) => {
    setDeleteModal({
      open: true,
      collectionId: collection.id,
      collectionTitle: collection.title
    });
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const formData = new FormData();
    formData.append("actionType", "deleteCollection");
    formData.append("collectionId", deleteModal.collectionId.toString());
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher, deleteModal.collectionId]);

  // Table rows
  const tableRows = paginatedCollections.map((collection) => [
    <Checkbox
      key={`checkbox-${collection.id}`}
      checked={selectedIds.includes(collection.id)}
      onChange={() => handleSelectRow(collection.id)}
    />,
    <Link 
      key={`title-${collection.id}`}
      url={`/app/collection/${collection.id}`}
    >
      <Text fontWeight="semibold">{collection.title}</Text>
    </Link>,
    <Text key={`description-${collection.id}`} color="subdued">
      {collection.description.length > 50 
        ? `${collection.description.substring(0, 50)}...` 
        : collection.description
      }
    </Text>,
    <Text key={`products-${collection.id}`}>{collection.productCount}</Text>,
    <Badge 
      key={`status-${collection.id}`}
      tone={statusBadgeTone[collection.status]}
    >
      {collection.status.charAt(0).toUpperCase() + collection.status.slice(1).toLowerCase()}
    </Badge>,
    <Text key={`created-${collection.id}`} color="subdued">{collection.createdAt}</Text>,
    <InlineStack key={`actions-${collection.id}`} gap="200">
      <Button
        icon={ViewIcon}
        variant="tertiary"
        onClick={() => navigate(`/app/collection/${collection.id}`)}
        accessibilityLabel="View collection"
      />
      <Button
        icon={DeleteIcon}
        variant="tertiary"
        tone="critical"
        onClick={() => handleDeleteClick(collection)}
        accessibilityLabel="Delete collection"
      />
    </InlineStack>,
  ]);

  const selectedCount = selectedIds.length;

  return (
    <Page
      title="Collections"
      primaryAction={{
        content: 'Create Collection',
        onAction: () => navigate("/app/create-collection"),
      }}
    >
      <Card>
        <BlockStack gap="400">
          {/* Search and filters */}
          <InlineStack align="space-between" gap="400">
            <Box width="300px">
              <TextField
                placeholder="Search collections..."
                value={searchValue}
                onChange={setSearchValue}
                prefix={<SearchIcon />}
                clearButton
                onClearButtonClick={() => setSearchValue("")}
              />
            </Box>
            
            <InlineStack gap="200">
              <Popover
                active={statusPopoverActive}
                activator={
                  <Button
                    disclosure
                    onClick={() => setStatusPopoverActive(!statusPopoverActive)}
                  >
                    Status
                  </Button>
                }
                onClose={() => setStatusPopoverActive(false)}
              >
                <ActionList
                  items={[
                    { content: 'All statuses', onAction: () => {} },
                    { content: 'Active', onAction: () => {} },
                    { content: 'Inactive', onAction: () => {} },
                  ]}
                />
              </Popover>

              <Popover
                active={sortPopoverActive}
                activator={
                  <Button
                    icon={SortIcon}
                    disclosure
                    onClick={() => setSortPopoverActive(!sortPopoverActive)}
                  >
                    Sort
                  </Button>
                }
                onClose={() => setSortPopoverActive(false)}
              >
                <ActionList
                  items={[
                    { content: 'Title (A-Z)', onAction: () => {} },
                    { content: 'Title (Z-A)', onAction: () => {} },
                    { content: 'Created Date (Newest)', onAction: () => {} },
                    { content: 'Created Date (Oldest)', onAction: () => {} },
                  ]}
                />
              </Popover>
            </InlineStack>
          </InlineStack>

          <Divider />

          {/* Selection info */}
          {selectedCount > 0 && (
            <>
              <InlineStack align="space-between">
                <Text>
                  {selectedCount} {selectedCount === 1 ? 'collection' : 'collections'} selected
                </Text>
                <InlineStack gap="200">
                  <Button
                    tone="critical"
                    onClick={handleBulkDelete}
                  >
                    Delete Selected
                  </Button>
                  <Button
                    onClick={handleBulkInactive}
                  >
                    Make Inactive
                  </Button>
                </InlineStack>
              </InlineStack>
              <Divider />
            </>
          )}

          {/* Results info */}
          <InlineStack align="space-between">
            <Text color="subdued">
              Showing {startIndex}-{endIndex} of {totalCollections} collections
            </Text>
          </InlineStack>

          {/* Table or Empty State */}
          {filteredCollections.length === 0 ? (
            <EmptyState
              heading="No collections found"
              description={searchValue 
                ? "Try adjusting your search terms" 
                : "Create your first product collection to get started"
              }
              action={{
                content: 'Create Collection',
                onAction: () => navigate("/app/create-collection"),
              }}
            />
          ) : (
            <DataTable
              columnContentTypes={[
                'text', // Checkbox
                'text', // Title
                'text', // Description
                'numeric', // Product count
                'text', // Status
                'text', // Created
                'text', // Actions
              ]}
              headings={[
                <Checkbox
                  key="select-all"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                />,
                'Title',
                'Description',
                'Products',
                'Status',
                'Created',
                'Actions',
              ]}
              rows={tableRows}
            />
          )}

          {/* Pagination */}
          {totalCollections > perPage && (
            <InlineStack align="center" gap="200">
              <Button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Text>Page {currentPage} of {Math.ceil(totalCollections / perPage)}</Text>
              <Button
                disabled={currentPage >= Math.ceil(totalCollections / perPage)}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, collectionId: null, collectionTitle: "" })}
        title="Delete Collection"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: handleDeleteConfirm,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setDeleteModal({ open: false, collectionId: null, collectionTitle: "" })
          },
        ]}
      >
        <Modal.Section>
          <Text>
            Are you sure you want to delete the collection "{deleteModal.collectionTitle}"? 
            This action cannot be undone and will remove all products from this collection.
          </Text>
        </Modal.Section>
      </Modal>

      {/* Bulk Action Confirmation Modal */}
      <Modal
        open={bulkActionModal.open}
        onClose={() => setBulkActionModal({ open: false, action: null, collections: [] })}
        title={bulkActionModal.action === 'delete' ? 'Delete Collections' : 'Make Collections Inactive'}
        primaryAction={{
          content: bulkActionModal.action === 'delete' ? 'Delete' : 'Make Inactive',
          destructive: bulkActionModal.action === 'delete',
          onAction: handleBulkActionConfirm,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setBulkActionModal({ open: false, action: null, collections: [] })
          },
        ]}
      >
        <Modal.Section>
          <Text>
            {bulkActionModal.action === 'delete' 
              ? `Are you sure you want to delete ${selectedCount} collection${selectedCount !== 1 ? 's' : ''}? This action cannot be undone and will remove all products from these collections.`
              : `Are you sure you want to make ${selectedCount} collection${selectedCount !== 1 ? 's' : ''} inactive? They will no longer be available to customers.`
            }
          </Text>
          
          {bulkActionModal.collections.length > 0 && (
            <Box paddingBlockStart="300">
              <Text variant="bodyMd" fontWeight="semibold">Collections to be affected:</Text>
              <Box paddingBlockStart="100">
                {bulkActionModal.collections.map(collection => (
                  <Text key={collection.id} color="subdued">• {collection.title}</Text>
                ))}
              </Box>
            </Box>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
