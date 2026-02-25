import { useState, useEffect, useCallback } from "react";
import { useFetcher, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getPriceLists, createPriceList, updatePriceList, deletePriceList, bulkDeletePriceLists } from "../models/priceList.server";
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  BlockStack,
  IndexTable,
  IndexFilters,
  Button,
  Modal,
  TextField,
  Select,
  Badge,
  InlineStack,
  Banner,
  useIndexResourceState,
  ChoiceList,
  useBreakpoints,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const priceLists = await getPriceLists(session.shop);

  console.log("SW what is priceLists", priceLists);
  
  return { priceLists };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "create") {
    const name = formData.get("name");
    const currency = formData.get("currency");
    const adjustmentType = formData.get("adjustmentType");
    const adjustmentValue = formData.get("adjustmentValue");
    
    return await createPriceList({
      admin,
      shop: session.shop,
      name,
      currency,
      adjustmentType,
      adjustmentValue: parseFloat(adjustmentValue)
    });
  }
  
  if (actionType === "update") {
    const priceListId = formData.get("priceListId");
    const adjustmentType = formData.get("adjustmentType");
    const adjustmentValue = formData.get("adjustmentValue");
    
    return await updatePriceList({
      admin,
      shop: session.shop,
      priceListId,
      adjustmentType,
      adjustmentValue: parseFloat(adjustmentValue)
    });
  }

  if (actionType === "delete") {
    const priceListId = formData.get("priceListId");
    
    return await deletePriceList({
      admin,
      shop: session.shop,
      priceListId
    });
  }

  if (actionType === "bulkDelete") {
    const priceListIds = JSON.parse(formData.get("priceListIds"));
    
    return await bulkDeletePriceLists({
      admin,
      shop: session.shop,
      priceListIds
    });
  }
  
  return { success: false, error: "Unknown action" };
};

export default function AppPriceList() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { priceLists } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState(null);
  const [deletingPriceList, setDeletingPriceList] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    currency: "USD",
    adjustmentType: "PERCENTAGE_INCREASE",
    adjustmentValue: "0"
  });

  // Search and filter state
  const [queryValue, setQueryValue] = useState('');
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState(undefined);
  const [sortSelected, setSortSelected] = useState(['name asc']);

  const resourceName = {
    singular: 'price list',
    plural: 'price lists',
  };

  // Filter and search logic
  const filteredPriceLists = priceLists?.filter((priceList) => {
    const matchesQuery = queryValue === '' || 
      priceList.name.toLowerCase().includes(queryValue.toLowerCase()) ||
      priceList.currency.toLowerCase().includes(queryValue.toLowerCase());
    
    const matchesAdjustmentType = !adjustmentTypeFilter || adjustmentTypeFilter.length === 0 ||
      adjustmentTypeFilter.includes(priceList.adjustmentType?.toLowerCase().replace('_', ' '));
    
    return matchesQuery && matchesAdjustmentType;
  }) || [];

  // Sort price lists
  const sortedPriceLists = [...filteredPriceLists].sort((a, b) => {
    const [sortKey, direction] = sortSelected[0].split(' ');
    const isAscending = direction === 'asc';
    
    let aValue, bValue;
    switch (sortKey) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'currency':
        aValue = a.currency.toLowerCase();
        bValue = b.currency.toLowerCase();
        break;
      case 'adjustmentType':
        aValue = a.adjustmentType || '';
        bValue = b.adjustmentType || '';
        break;
      case 'adjustmentValue':
        // Handle Prisma Decimal objects properly
        aValue = 0;
        bValue = 0;
        if (a.adjustmentValue) {
          try {
            if (typeof a.adjustmentValue.toNumber === 'function') {
              aValue = a.adjustmentValue.toNumber();
            } else {
              aValue = a.adjustmentValue.d ? a.adjustmentValue.d[0] : 0;
            }
          } catch (e) {
            aValue = 0;
          }
        }
        if (b.adjustmentValue) {
          try {
            if (typeof b.adjustmentValue.toNumber === 'function') {
              bValue = b.adjustmentValue.toNumber();
            } else {
              bValue = b.adjustmentValue.d ? b.adjustmentValue.d[0] : 0;
            }
          } catch (e) {
            bValue = 0;
          }
        }
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }
    
    if (aValue < bValue) return isAscending ? -1 : 1;
    if (aValue > bValue) return isAscending ? 1 : -1;
    return 0;
  });

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(sortedPriceLists);

  const selectedPriceLists = sortedPriceLists.filter(priceList => selectedResources.includes(priceList.id.toString()));

  // Filter handlers
  const handleFiltersQueryChange = useCallback(
    (value) => setQueryValue(value),
    [],
  );
  
  const handleAdjustmentTypeChange = useCallback(
    (value) => setAdjustmentTypeFilter(value),
    [],
  );
  
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleAdjustmentTypeRemove = useCallback(() => setAdjustmentTypeFilter(undefined), []);
  
  const handleFiltersClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleAdjustmentTypeRemove();
  }, [handleQueryValueRemove, handleAdjustmentTypeRemove]);

  // Sort options
  const sortOptions = [
    {label: 'Name', value: 'name asc', directionLabel: 'A-Z'},
    {label: 'Name', value: 'name desc', directionLabel: 'Z-A'},
    {label: 'Currency', value: 'currency asc', directionLabel: 'A-Z'},
    {label: 'Currency', value: 'currency desc', directionLabel: 'Z-A'},
    {label: 'Adjustment Type', value: 'adjustmentType asc', directionLabel: 'Decrease First'},
    {label: 'Adjustment Type', value: 'adjustmentType desc', directionLabel: 'Increase First'},
    {label: 'Adjustment Value', value: 'adjustmentValue asc', directionLabel: 'Low to High'},
    {label: 'Adjustment Value', value: 'adjustmentValue desc', directionLabel: 'High to Low'},
  ];

  // Filters
  const filters = [
    {
      key: 'adjustmentType',
      label: 'Adjustment type',
      filter: (
        <ChoiceList
          title="Adjustment type"
          titleHidden
          choices={[
            {label: 'Percentage Increase', value: 'percentage increase'},
            {label: 'Percentage Decrease', value: 'percentage decrease'},
          ]}
          selected={adjustmentTypeFilter || []}
          onChange={handleAdjustmentTypeChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  // Applied filters
  const appliedFilters = [];
  if (adjustmentTypeFilter && adjustmentTypeFilter.length > 0) {
    const key = 'adjustmentType';
    appliedFilters.push({
      key,
      label: `Adjustment type: ${adjustmentTypeFilter.join(', ')}`,
      onRemove: handleAdjustmentTypeRemove,
    });
  }

  useEffect(() => {
    if (fetcher.data?.success) {
      let message = "Operation completed successfully!";
      if (fetcher.data.deletedCount) {
        message = `Successfully deleted ${fetcher.data.deletedCount} price list(s)!`;
      } else if (editingPriceList) {
        message = "Price list updated!";
      } else if (deletingPriceList) {
        message = "Price list deleted!";
      } else {
        message = "Price list created!";
      }
      
      shopify.toast.show(message);
      setModalOpen(false);
      setDeleteModalOpen(false);
      setEditingPriceList(null);
      setDeletingPriceList(null);
      setFormData({
        name: "",
        currency: "USD",
        adjustmentType: "PERCENTAGE_INCREASE",
        adjustmentValue: "0"
      });
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify, editingPriceList, deletingPriceList]);

  const handleSubmit = () => {
    const submitData = {
      actionType: editingPriceList ? "update" : "create",
      ...formData
    };
    
    if (editingPriceList) {
      submitData.priceListId = editingPriceList.shopifyId;
    }
    
    fetcher.submit(submitData, { method: "POST" });
  };

  const handleEdit = (priceList) => {
    // Clear any current selections to prevent confusion
    handleSelectionChange('page', false);
    
    setEditingPriceList(priceList);
    
    // Handle Prisma Decimal type properly
    let adjustmentValue = "0";
    if (priceList.adjustmentValue) {
      try {
        if (typeof priceList.adjustmentValue.toNumber === 'function') {
          adjustmentValue = priceList.adjustmentValue.toNumber().toString();
        } else {
          // Fallback: parse the d array from Decimal structure
          adjustmentValue = priceList.adjustmentValue.d ? priceList.adjustmentValue.d[0].toString() : "0";
        }
      } catch (e) {
        adjustmentValue = "0";
      }
    }
    
    setFormData({
      name: priceList.name,
      currency: priceList.currency,
      adjustmentType: priceList.adjustmentType || "PERCENTAGE_INCREASE",
      adjustmentValue: adjustmentValue
    });
    setModalOpen(true);
  };

  const handleDelete = (priceList) => {
    setDeletingPriceList(priceList);
    setDeleteModalOpen(true);
  };

  const handleBulkDelete = () => {
    const formData = {
      actionType: "bulkDelete",
      priceListIds: JSON.stringify(selectedPriceLists.map(pl => pl.shopifyId))
    };
    fetcher.submit(formData, { method: "POST" });
  };

  const handleDeleteConfirm = () => {
    if (deletingPriceList) {
      fetcher.submit({
        actionType: "delete",
        priceListId: deletingPriceList.shopifyId
      }, { method: "POST" });
    }
  };

  const handleCreate = () => {
    // Clear any current selections
    handleSelectionChange('page', false);
    
    setEditingPriceList(null);
    setFormData({
      name: "",
      currency: "USD",
      adjustmentType: "PERCENTAGE_INCREASE",
      adjustmentValue: "0"
    });
    setModalOpen(true);
  };

  // Check if name already exists
  const nameExists = !editingPriceList && priceLists?.some(pl => 
    pl.name.toLowerCase() === formData.name.toLowerCase()
  );

  // Generate suggested names
  const suggestAlternativeName = (baseName) => {
    let counter = 1;
    let suggestedName = `${baseName} ${counter}`;
    
    while (priceLists?.some(pl => pl.name.toLowerCase() === suggestedName.toLowerCase())) {
      counter++;
      suggestedName = `${baseName} ${counter}`;
    }
    
    return suggestedName;
  };

  console.log("SW what is priceLists?", priceLists);

  function isEmpty(value) {
    if (Array.isArray(value)) {
      return value.length === 0;
    } else {
      return value === '' || value == null;
    }
  }


  return (
    <>
    <Page
      title="Price Lists"
      subtitle="Manage price lists for B2B catalogs"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
      primaryAction={{
        content: "Create Price List",
        onAction: handleCreate
      }}
      secondaryActions={[
        {
          content: `Delete Selected (${selectedPriceLists.length})`,
          onAction: handleBulkDelete,
          disabled: selectedPriceLists.length === 0 || isLoading,
          destructive: true,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="4">
            {fetcher.data?.error && (
              <Banner status="critical">
                <Text as="p">{fetcher.data.error}</Text>
              </Banner>
            )}

            <LegacyCard>
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search price lists..."
                onQueryChange={handleFiltersQueryChange}
                onQueryClear={() => setQueryValue('')}
                onSort={setSortSelected}
                filters={filters}
                appliedFilters={appliedFilters}
                onClearAll={handleFiltersClearAll}
                tabs={[]}
              />
              <IndexTable
                condensed={useBreakpoints().smDown}
                resourceName={resourceName}
                itemCount={sortedPriceLists.length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Name' },
                  { title: 'Currency' },
                  { title: 'Adjustment Type' },
                  { title: 'Price Adjustment' },
                  { title: 'Actions' },
                ]}
              >
                {sortedPriceLists.map((priceList, index) => {
                  // Handle Prisma Decimal type properly
                  let adjustmentPercent = 0;
                  if (priceList.adjustmentValue) {
                    // Use toNumber() method for Prisma Decimal objects
                    try {
                      if (typeof priceList.adjustmentValue.toNumber === 'function') {
                        adjustmentPercent = priceList.adjustmentValue.toNumber();
                      } else {
                        // Fallback: parse the d array from Decimal structure
                        adjustmentPercent = priceList.adjustmentValue.d ? priceList.adjustmentValue.d[0] : 0;
                      }
                    } catch (e) {
                      adjustmentPercent = 0;
                    }
                  }
                  
                  return (
                    <IndexTable.Row
                      id={priceList.id.toString()}
                      key={priceList.id}
                      selected={selectedResources.includes(priceList.id.toString())}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <Text variant="bodyMd" fontWeight="medium" as="span">
                          {priceList.name}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{priceList.currency}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {priceList.adjustmentType ? (
                          <Badge tone={priceList.adjustmentType.includes("INCREASE") ? "success" : "caution"}>
                            {priceList.adjustmentType.includes("INCREASE") ? "Increase" : "Decrease"}
                          </Badge>
                        ) : (
                          <Badge tone="info">None</Badge>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {priceList.adjustmentType ? (
                          <Text variant="bodyMd" as="span">
                            {adjustmentPercent}%
                          </Text>
                        ) : (
                          "No adjustment"
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(priceList);
                            }} 
                            size="slim"
                          >
                            Edit
                          </Button>
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(priceList);
                            }} 
                            size="slim" 
                            tone="critical"
                            disabled={isLoading}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
              {sortedPriceLists.length === 0 && (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <Text variant="bodyMd" tone="subdued">
                    {queryValue || adjustmentTypeFilter?.length > 0 
                      ? "No price lists found matching your search."
                      : "No price lists found. Create your first price list to get started."
                    }
                  </Text>
                </div>
              )}
            </LegacyCard>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPriceList ? "Edit Price List" : "Create Price List"}
        primaryAction={{
          content: editingPriceList ? "Update" : "Create",
          onAction: handleSubmit,
          loading: isLoading,
          disabled: isLoading || !formData.name || !formData.adjustmentValue || nameExists
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="4">
            {!editingPriceList && (
              <>
                <TextField
                  label="Price List Name"
                  value={formData.name}
                  onChange={(value) => setFormData({...formData, name: value})}
                  autoComplete="off"
                  error={nameExists ? "This name already exists" : ""}
                />
                
                {nameExists && formData.name && (
                  <Banner status="warning">
                    <BlockStack gap="2">
                      <Text as="p">
                        The name "{formData.name}" is already taken.
                      </Text>
                      <Button
                        plain
                        onClick={() => setFormData({
                          ...formData, 
                          name: suggestAlternativeName(formData.name)
                        })}
                      >
                        Try "{suggestAlternativeName(formData.name)}" instead
                      </Button>
                    </BlockStack>
                  </Banner>
                )}
                
                <Select
                  label="Currency"
                  options={[
                    { label: "USD", value: "USD" },
                    { label: "EUR", value: "EUR" },
                    { label: "GBP", value: "GBP" },
                    { label: "CAD", value: "CAD" }
                  ]}
                  value={formData.currency}
                  onChange={(value) => setFormData({...formData, currency: value})}
                />
              </>
            )}
            
            <Select
              label="Price Adjustment Type"
              options={[
                { label: "Percentage Increase", value: "PERCENTAGE_INCREASE" },
                { label: "Percentage Decrease", value: "PERCENTAGE_DECREASE" }
              ]}
              value={formData.adjustmentType}
              onChange={(value) => setFormData({...formData, adjustmentType: value})}
            />
            
            <TextField
              label="Adjustment Value (%)"
              type="number"
              value={formData.adjustmentValue}
              onChange={(value) => setFormData({...formData, adjustmentValue: value})}
              autoComplete="off"
              min="0"
              max="100"
              step="0.01"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Price List"
        primaryAction={{
          content: "Delete",
          onAction: handleDeleteConfirm,
          loading: isLoading,
          destructive: true
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete "{deletingPriceList?.name}"? This action cannot be undone and will remove the price list from both your database and Shopify.
          </Text>
        </Modal.Section>
      </Modal>
    </>
    );
  }

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
