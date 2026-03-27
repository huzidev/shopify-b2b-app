import React, { useState, useCallback, useEffect } from "react";
import { useLoaderData, useNavigate, useParams, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
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
  Select,
  Banner,
  Modal,
  Checkbox,
  List,
  Spinner,
  EmptyState,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  
  // Import server functions only in loader
  const { getCatalog } = await import("../models/catalog.server");
  const { getProductsByIds, getAllAvailableProducts } = await import("../models/product.server");
  const { getCompanies } = await import("../models/company.server");
  
  const catalog = await getCatalog(session.shop, params.id, admin);
  
  if (!catalog) {
    return { 
      catalog: null, 
      products: [], 
      pricingRules: [], 
      allProducts: [],
      companies: [] 
    };
  }

  // Get companies for location updates
  const companies = await getCompanies(session.shop);

  // Get products from the catalog's publications
  let products = [];
  if (catalog.publications && catalog.publications.length > 0) {
    const publication = catalog.publications[0]; // Get first publication
    if (publication.products && publication.products.length > 0) {
      const productIds = publication.products.map(p => p.productId);
      products = await getProductsByIds(admin, productIds);
    }
  }

  // Get all available products for the add products modal
  const allProducts = await getAllAvailableProducts(admin);

  // Get pricing rules from the catalog's price list
  const pricingRules = [];
  if (catalog.priceList) {
    const priceList = catalog.priceList;
    const adjustmentValue = typeof priceList.adjustmentValue === 'object' && priceList.adjustmentValue.d 
      ? priceList.adjustmentValue.d[0] 
      : parseFloat(priceList.adjustmentValue);
    
    let ruleType = "Unknown";
    let value = "";
    let valueColor = "#202223";
    
    if (priceList.adjustmentType === "PERCENTAGE_DECREASE") {
      ruleType = "Percentage";
      value = `-${adjustmentValue}%`;
      valueColor = "#C0392B";
    } else if (priceList.adjustmentType === "PERCENTAGE_INCREASE") {
      ruleType = "Percentage";
      value = `+${adjustmentValue}%`;
      valueColor = "#27AE60";
    } else if (priceList.adjustmentType === "FIXED_AMOUNT") {
      ruleType = "Fixed Amount";
      value = `$${adjustmentValue}`;
      valueColor = "#2980B9";
    }
    
    pricingRules.push({
      name: priceList.name,
      type: ruleType,
      value: value,
      valueColor: valueColor
    });
  }
  
  return { catalog, products, pricingRules, allProducts, companies };
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  // Import server functions only in action
  const { getCatalog, updateCatalog } = await import("../models/catalog.server");
  const { updatePriceList } = await import("../models/priceList.server");
  const { updatePublication } = await import("../models/publicationList.server");
  
  try {
    if (actionType === "updateCatalog") {
      const catalogId = params.id;
      const title = formData.get("title");
      const status = formData.get("status") || "ACTIVE";
      
      // Parse price list data if provided
      const priceListData = formData.get("priceListData");
      let priceListUpdate = null;
      if (priceListData) {
        priceListUpdate = JSON.parse(priceListData);
      }
      
      // Update price list first if needed
      if (priceListUpdate) {
        const priceListResult = await updatePriceList({
          admin,
          shop: session.shop,
          priceListId: priceListUpdate.shopifyId,
          adjustmentType: priceListUpdate.adjustmentType,
          adjustmentValue: priceListUpdate.adjustmentValue
        });
        
        if (!priceListResult.success) {
          return { success: false, error: `Price list update failed: ${priceListResult.error}` };
        }
      }
      
      // Update catalog
      const catalogResult = await updateCatalog({
        admin,
        shop: session.shop,
        catalogId,
        title,
        status
      });
      
      return catalogResult;
    }
    
    if (actionType === "addProducts") {
      const catalogId = params.id;
      const selectedProductIds = JSON.parse(formData.get("selectedProductIds") || "[]");
      
      // Get the catalog's publication
      const catalog = await getCatalog(session.shop, catalogId, admin);
      if (!catalog || !catalog.publications || catalog.publications.length === 0) {
        return { success: false, error: "No publication found for this catalog" };
      }
      
      const publication = catalog.publications[0];
      
      // Update publication with new products
      const result = await updatePublication({
        admin,
        shop: session.shop,
        publicationId: publication.id,
        publishablesToAdd: selectedProductIds,
        publishablesToRemove: []
      });
      
      return result;
    }
    
    if (actionType === "removeProducts") {
      const catalogId = params.id;
      const selectedProductIds = JSON.parse(formData.get("selectedProductIds") || "[]");
      
      // Get the catalog's publication
      const catalog = await getCatalog(session.shop, catalogId, admin);
      if (!catalog || !catalog.publications || catalog.publications.length === 0) {
        return { success: false, error: "No publication found for this catalog" };
      }
      
      const publication = catalog.publications[0];
      
      // Update publication to remove products
      const result = await updatePublication({
        admin,
        shop: session.shop,
        publicationId: publication.id,
        publishablesToAdd: [],
        publishablesToRemove: selectedProductIds
      });
      
      return result;
    }
    
    if (actionType === "updateLocation") {
      const catalogId = params.id;
      const selectedLocationIds = JSON.parse(formData.get("selectedLocationIds") || "[]");
      
      // Update catalog with new location
      const result = await updateCatalog({
        admin,
        shop: session.shop,
        catalogId,
        newLocationIds: selectedLocationIds
      });
      
      return result;
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Catalog update error:", error);
    return { success: false, error: error.message };
  }
};

export default function CatalogDetail() {
  const { catalog, products, pricingRules, allProducts, companies } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [errors, setErrors] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  
  // Modal states
  const [addProductsModalOpen, setAddProductsModalOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [confirmLocationRemovalOpen, setConfirmLocationRemovalOpen] = useState(false);
  const [pendingLocationIds, setPendingLocationIds] = useState([]);
  const [locationsToRemove, setLocationsToRemove] = useState([]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  
  // Product selection states
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [productSearchValue, setProductSearchValue] = useState("");
  
  // Selected products for removal
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  // Form state for editing
  const [formData, setFormData] = useState({
    title: catalog?.title || "",
    status: catalog?.status || "ACTIVE",
    adjustmentType: catalog?.priceList?.adjustmentType || "PERCENTAGE_INCREASE",
    adjustmentValue: catalog?.priceList ? (typeof catalog.priceList.adjustmentValue === 'object' && catalog.priceList.adjustmentValue.d ? catalog.priceList.adjustmentValue.d[0].toString() : catalog.priceList.adjustmentValue.toString()) : "0"
  });
  
  // Pricing modal form data
  const [pricingFormData, setPricingFormData] = useState({
    adjustmentType: catalog?.priceList?.adjustmentType || "PERCENTAGE_INCREASE",
    adjustmentValue: catalog?.priceList ? (typeof catalog.priceList.adjustmentValue === 'object' && catalog.priceList.adjustmentValue.d ? catalog.priceList.adjustmentValue.d[0].toString() : catalog.priceList.adjustmentValue.toString()) : "0"
  });
  
  // Company location form data
  const [companyFormData, setCompanyFormData] = useState({
    selectedLocationIds: catalog?.assignedLocationIds || (catalog?.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : [])
  });
  
  // Duplicate catalog form data
  const [duplicateFormData, setDuplicateFormData] = useState({
    title: "",
    companyId: catalog?.companyId?.toString() || "",
    locationId: catalog?.companyLocation?.shopifyId || "",
    priceListName: catalog?.priceList?.name ? `${catalog.priceList.name} Copy` : "",
    publicationTitle: catalog?.publications?.[0]?.title ? `${catalog.publications[0].title} Copy` : ""
  });
  
  const isLoading = fetcher.state === "submitting";
  
  // Update form data when catalog data changes
  useEffect(() => {
    if (catalog) {
      const newFormData = {
        title: catalog.title || "",
        status: catalog.status || "ACTIVE",
        adjustmentType: catalog.priceList?.adjustmentType || "PERCENTAGE_INCREASE",
        adjustmentValue: catalog.priceList ? (typeof catalog.priceList.adjustmentValue === 'object' && catalog.priceList.adjustmentValue.d ? catalog.priceList.adjustmentValue.d[0].toString() : catalog.priceList.adjustmentValue.toString()) : "0"
      };
      setFormData(newFormData);
      
      // Update pricing form data
      setPricingFormData({
        adjustmentType: catalog.priceList?.adjustmentType || "PERCENTAGE_INCREASE",
        adjustmentValue: catalog.priceList ? (typeof catalog.priceList.adjustmentValue === 'object' && catalog.priceList.adjustmentValue.d ? catalog.priceList.adjustmentValue.d[0].toString() : catalog.priceList.adjustmentValue.toString()) : "0"
      });
      
      // Update company form data
      setCompanyFormData({
        selectedLocationIds: catalog.assignedLocationIds || (catalog.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : [])
      });
    }
    setHasChanges(false);
  }, [catalog]);
  
  // Initialize available products from loader data
  useEffect(() => {
    if (allProducts) {
      setAvailableProducts(allProducts);
    }
  }, [allProducts]);
  
  // Track changes
  useEffect(() => {
    if (catalog) {
      const originalData = {
        title: catalog.title || "",
        status: catalog.status || "ACTIVE",
        adjustmentType: catalog.priceList?.adjustmentType || "PERCENTAGE_INCREASE",
        adjustmentValue: catalog.priceList ? (typeof catalog.priceList.adjustmentValue === 'object' && catalog.priceList.adjustmentValue.d ? catalog.priceList.adjustmentValue.d[0].toString() : catalog.priceList.adjustmentValue.toString()) : "0"
      };
      
      const currentData = {
        ...formData,
        adjustmentType: pricingFormData.adjustmentType,
        adjustmentValue: pricingFormData.adjustmentValue
      };

      const normalizedCurrentIds = [...(companyFormData.selectedLocationIds || [])].sort();
      const normalizedOriginalIds = [...(catalog.assignedLocationIds || (catalog.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : []))].sort();
      
      const hasFormChanges = JSON.stringify(originalData) !== JSON.stringify(currentData);
      const hasLocationChanges = JSON.stringify(normalizedCurrentIds) !== JSON.stringify(normalizedOriginalIds);
      
      setHasChanges(hasFormChanges || hasLocationChanges);
    }
  }, [formData, pricingFormData, companyFormData, catalog]);
  
  // Handle form submission
  const handleSave = useCallback(() => {
    setErrors({});
    
    const priceListData = catalog?.priceList ? {
      shopifyId: catalog.priceList.shopifyId,
      adjustmentType: pricingFormData.adjustmentType,
      adjustmentValue: parseFloat(pricingFormData.adjustmentValue)
    } : null;
    
    fetcher.submit(
      {
        actionType: "updateCatalog",
        title: formData.title,
        status: formData.status,
        priceListData: priceListData ? JSON.stringify(priceListData) : ""
      },
      { method: "POST" }
    );
  }, [formData, pricingFormData, catalog, fetcher]);
  
  // Handle adding products
  const handleAddProducts = useCallback(() => {
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }
    
    fetcher.submit(
      {
        actionType: "addProducts",
        selectedProductIds: JSON.stringify(selectedProductIds)
      },
      { method: "POST" }
    );
    
    setAddProductsModalOpen(false);
    setSelectedProductIds([]);
  }, [selectedProductIds, fetcher, shopify]);
  
  // Handle removing products
  const handleRemoveProducts = useCallback(() => {
    if (selectedForRemoval.length === 0) {
      shopify.toast.show("Please select at least one product to remove", { isError: true });
      return;
    }
    
    fetcher.submit(
      {
        actionType: "removeProducts",
        selectedProductIds: JSON.stringify(selectedForRemoval)
      },
      { method: "POST" }
    );
    
    setSelectedForRemoval([]);
  }, [selectedForRemoval, fetcher, shopify]);
  
  // Handle pricing update
  const handleUpdatePricing = useCallback(() => {
    const priceListData = catalog?.priceList ? {
      shopifyId: catalog.priceList.shopifyId,
      adjustmentType: pricingFormData.adjustmentType,
      adjustmentValue: parseFloat(pricingFormData.adjustmentValue)
    } : null;
    
    fetcher.submit(
      {
        actionType: "updateCatalog",
        title: formData.title,
        status: formData.status,
        priceListData: priceListData ? JSON.stringify(priceListData) : ""
      },
      { method: "POST" }
    );
    
    setPricingModalOpen(false);
  }, [pricingFormData, catalog, formData, fetcher]);
  
  // Handle location update
  const handleUpdateLocation = useCallback(() => {
    const currentAssignedIds = catalog?.assignedLocationIds || (catalog?.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : []);
    const nextSelectedIds = companyFormData.selectedLocationIds || [];

    const removedIds = currentAssignedIds.filter((id) => !nextSelectedIds.includes(id));

    if (removedIds.length > 0) {
      const companyLocations = companies?.find((company) => company.id === catalog?.companyId)?.locations || [];
      const removedLocations = companyLocations.filter((location) => removedIds.includes(location.shopifyId));
      setLocationsToRemove(removedLocations);
      setPendingLocationIds(nextSelectedIds);
      setConfirmLocationRemovalOpen(true);
      return;
    }

    fetcher.submit(
      {
        actionType: "updateLocation",
        selectedLocationIds: JSON.stringify(nextSelectedIds)
      },
      { method: "POST" }
    );
    
    setCompanyModalOpen(false);
  }, [companyFormData, fetcher, catalog, companies]);

  const confirmLocationUpdate = useCallback(() => {
    fetcher.submit(
      {
        actionType: "updateLocation",
        selectedLocationIds: JSON.stringify(pendingLocationIds)
      },
      { method: "POST" }
    );

    setConfirmLocationRemovalOpen(false);
    setCompanyModalOpen(false);
    setPendingLocationIds([]);
    setLocationsToRemove([]);
  }, [fetcher, pendingLocationIds]);
  
  // Handle duplicate catalog
  const handleDuplicateCatalog = useCallback(() => {
    // This would redirect to the create catalog page with pre-filled data
    const queryParams = new URLSearchParams({
      duplicateFrom: catalog.id,
      title: duplicateFormData.title,
      companyId: duplicateFormData.companyId,
      locationId: duplicateFormData.locationId,
      priceListName: duplicateFormData.priceListName,
      publicationTitle: duplicateFormData.publicationTitle
    });
    
    navigate(`/app/create-catalog?${queryParams.toString()}`);
  }, [duplicateFormData, catalog, navigate]);
  
  // Handle form field changes
  const handleFieldChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);
  
  // Handle pricing field changes
  const handlePricingFieldChange = useCallback((field, value) => {
    setPricingFormData(prev => ({ ...prev, [field]: value }));
  }, []);
  
  // Handle company field changes
  const handleCompanyFieldChange = useCallback((field, value) => {
    setCompanyFormData(prev => ({ ...prev, [field]: value }));
  }, []);
  
  // Handle duplicate field changes
  const handleDuplicateFieldChange = useCallback((field, value) => {
    setDuplicateFormData(prev => ({ ...prev, [field]: value }));
  }, []);
  
  // Handle save result
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Catalog updated successfully!");
      setEditMode(false);
      setErrors({});
      setHasChanges(false);
    } else if (fetcher.data?.error) {
      setErrors({ general: fetcher.data.error });
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

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

  const filteredProducts = products?.filter(
    (p) =>
      p.title.toLowerCase().includes(searchValue.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchValue.toLowerCase())
  ) || [];

  const productRows = filteredProducts.map((p) => [
    <Checkbox 
      checked={selectedForRemoval.includes(p.id)}
      onChange={(checked) => {
        if (checked) {
          setSelectedForRemoval(prev => [...prev, p.id]);
        } else {
          setSelectedForRemoval(prev => prev.filter(id => id !== p.id));
        }
      }}
    />,
    <Text variant="bodyMd" tone="subdued">{p.sku}</Text>,
    <Text variant="bodyMd">{p.title}</Text>,
    <Text variant="bodyMd" alignment="end">{p.price}</Text>,
  ]);

  const pricingRows = (pricingRules || []).map((r) => [
    <Text variant="bodyMd">{r.name}</Text>,
    <Text variant="bodyMd" tone="subdued">{r.type}</Text>,
    <Text variant="bodyMd" alignment="end">
      <span style={{ color: r.valueColor, fontWeight: 500 }}>{r.value}</span>
    </Text>,
  ]);

  // Filter available products for the add products modal
  const filteredAvailableProducts = availableProducts?.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(productSearchValue.toLowerCase()) ||
                         p.sku.toLowerCase().includes(productSearchValue.toLowerCase());
    const notAlreadyInCatalog = !products?.some(existing => existing.id === p.id);
    return matchesSearch && notAlreadyInCatalog;
  }) || [];
  
  // Get current company and locations for company modal
  const currentCompany = companies?.find(c => c.id === catalog?.companyId);
  const availableLocations = currentCompany?.locations || [];
  const assignedLocationIds = catalog.assignedLocationIds || (catalog.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : []);
  const assignedLocationNames = availableLocations
    .filter((location) => assignedLocationIds.includes(location.shopifyId))
    .map((location) => location.name);

  // Create assignments from catalog data
  const assignments = catalog.company ? [
    { 
      company: catalog.company.name, 
      location: assignedLocationNames.length > 0 ? `${assignedLocationNames.length} location${assignedLocationNames.length === 1 ? "" : "s"}` : (catalog.companyLocation?.name || "All locations"), 
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
      title={editMode ? "Edit Catalog" : (catalog.title || "Catalog")}
      titleMetadata={<Badge tone="success">{catalog.status || "Active"}</Badge>}
      primaryAction={
        editMode ? (
          <InlineStack gap="200">
            <Button 
              onClick={() => setEditMode(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            {hasChanges && (
              <Button 
                variant="primary" 
                onClick={handleSave}
                loading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? "Saving..." : "Save"}
              </Button>
            )}
          </InlineStack>
        ) : (
          <InlineStack gap="200">
            <Button onClick={() => setDuplicateModalOpen(true)}>
              Duplicate
            </Button>
            <Button variant="primary" onClick={() => setEditMode(true)}>
              Edit
            </Button>
          </InlineStack>
        )
      }
    >
      <BlockStack gap="0">
        {/* Error Banner */}
        {errors.general && (
          <Box paddingBlockEnd="500">
            <Banner status="critical">
              <Text as="p">{errors.general}</Text>
            </Banner>
          </Box>
        )}

        {editMode && (
          <Box paddingBlockEnd="500">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Edit Catalog Details
                </Text>
                
                <TextField
                  label="Catalog Title"
                  value={formData.title}
                  onChange={(value) => handleFieldChange('title', value)}
                  error={errors.title}
                  disabled={isLoading}
                />
                
                <Select
                  label="Status"
                  value={formData.status}
                  onChange={(value) => handleFieldChange('status', value)}
                  options={[
                    { label: 'Active', value: 'ACTIVE' },
                    { label: 'Inactive', value: 'INACTIVE' }
                  ]}
                  disabled={isLoading}
                />
                
                {catalog.priceList && (
                  <>
                    <Divider />
                    <Text variant="headingMd" as="h3">
                      Price List Settings
                    </Text>
                    
                    <Select
                      label="Adjustment Type"
                      value={formData.adjustmentType}
                      onChange={(value) => handleFieldChange('adjustmentType', value)}
                      options={[
                        { label: 'Percentage Increase', value: 'PERCENTAGE_INCREASE' },
                        { label: 'Percentage Decrease', value: 'PERCENTAGE_DECREASE' },
                        { label: 'Fixed Amount', value: 'FIXED_AMOUNT' }
                      ]}
                      disabled={isLoading}
                    />
                    
                    <TextField
                      label="Adjustment Value"
                      type="number"
                      value={formData.adjustmentValue}
                      onChange={(value) => handleFieldChange('adjustmentValue', value)}
                      suffix={formData.adjustmentType.includes('PERCENTAGE') ? '%' : '$'}
                      error={errors.adjustmentValue}
                      disabled={isLoading}
                    />
                  </>
                )}
              </BlockStack>
            </Card>
          </Box>
        )}

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
                    <Button 
                      variant="primary"
                      onClick={() => setAddProductsModalOpen(true)}
                    >
                      Add products
                    </Button>
                    <Button 
                      disabled={selectedForRemoval.length === 0}
                      onClick={handleRemoveProducts}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                </Box>

                <Divider />

                {/* Products Table */}
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric"]}
                  headings={[
                    <Checkbox 
                      checked={selectedForRemoval.length === filteredProducts.length && filteredProducts.length > 0}
                      indeterminate={selectedForRemoval.length > 0 && selectedForRemoval.length < filteredProducts.length}
                      onChange={(checked) => {
                        if (checked) {
                          setSelectedForRemoval(filteredProducts.map(p => p.id));
                        } else {
                          setSelectedForRemoval([]);
                        }
                      }}
                    />,
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
                    <Button 
                      variant="primary"
                      onClick={() => setPricingModalOpen(true)}
                    >
                      Update Pricing Value
                    </Button>
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

            {/* Company Card */}
            <Card padding="0">
              <BlockStack gap="0">
                <Box paddingInline="400" paddingBlock="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Company
                    </Text>
                    <Button 
                      variant="primary"
                      onClick={() => setCompanyModalOpen(true)}
                    >
                      Edit Company Info
                    </Button>
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
                      No company information found. Edit company info to get started.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Box>
      </BlockStack>
      
      {/* Add Products Modal */}
      <Modal
        open={addProductsModalOpen}
        onClose={() => {
          setAddProductsModalOpen(false);
          setSelectedProductIds([]);
          setProductSearchValue("");
        }}
        title="Add Products"
        primaryAction={{
          content: "Add Selected Products",
          onAction: handleAddProducts,
          disabled: selectedProductIds.length === 0
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setAddProductsModalOpen(false);
              setSelectedProductIds([]);
              setProductSearchValue("");
            }
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              prefix={<SearchIcon />}
              placeholder="Search products..."
              value={productSearchValue}
              onChange={setProductSearchValue}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setProductSearchValue("")}
            />
            
            <Box maxHeight="300px" style={{ overflowY: 'auto' }}>
              <BlockStack gap="200">
                {filteredAvailableProducts.length > 0 ? (
                  filteredAvailableProducts.map((product) => (
                    <Box key={product.id} padding="200" background="bg-surface-secondary">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                          <InlineStack gap="200">
                            <Text variant="bodySm" tone="subdued">SKU: {product.sku}</Text>
                            <Text variant="bodySm" tone="subdued">{product.price}</Text>
                          </InlineStack>
                        </BlockStack>
                        <Checkbox
                          checked={selectedProductIds.includes(product.id)}
                          onChange={(checked) => {
                            if (checked) {
                              setSelectedProductIds(prev => [...prev, product.id]);
                            } else {
                              setSelectedProductIds(prev => prev.filter(id => id !== product.id));
                            }
                          }}
                        />
                      </InlineStack>
                    </Box>
                  ))
                ) : (
                  <EmptyState
                    heading="No products found"
                    image="https://cdn.shopify.com/s/files/1/2376/3301/products/emptystate-files.png"
                  >
                    <Text tone="subdued">
                      {productSearchValue ? "No products match your search." : "All available products are already in this catalog."}
                    </Text>
                  </EmptyState>
                )}
              </BlockStack>
            </Box>
            
            {selectedProductIds.length > 0 && (
              <Text variant="bodySm" tone="subdued">
                {selectedProductIds.length} product{selectedProductIds.length === 1 ? '' : 's'} selected
              </Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Pricing Update Modal */}
      <Modal
        open={pricingModalOpen}
        onClose={() => setPricingModalOpen(false)}
        title="Update Pricing Value"
        primaryAction={{
          content: "Update",
          onAction: handleUpdatePricing,
          loading: isLoading,
          disabled: isLoading || !pricingFormData.adjustmentValue
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setPricingModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Select
              label="Price Adjustment Type"
              options={[
                { label: "Percentage Increase", value: "PERCENTAGE_INCREASE" },
                { label: "Percentage Decrease", value: "PERCENTAGE_DECREASE" },
                { label: "Fixed Amount", value: "FIXED_AMOUNT" }
              ]}
              value={pricingFormData.adjustmentType}
              onChange={(value) => handlePricingFieldChange('adjustmentType', value)}
            />
            
            <TextField
              label="Adjustment Value"
              type="number"
              value={pricingFormData.adjustmentValue}
              onChange={(value) => handlePricingFieldChange('adjustmentValue', value)}
              suffix={pricingFormData.adjustmentType.includes('PERCENTAGE') ? '%' : '$'}
              autoComplete="off"
              min="0"
              step="0.01"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Company Location Update Modal */}
      <Modal
        open={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
        title="Edit Company Info"
        primaryAction={{
          content: "Update",
          onAction: handleUpdateLocation,
          loading: isLoading,
          disabled: isLoading || !companyFormData.selectedLocationIds || companyFormData.selectedLocationIds.length === 0
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setCompanyModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd">
              Current Company: <Text variant="bodyMd" fontWeight="semibold">{catalog.company?.name}</Text>
            </Text>
            
            {availableLocations.length > 0 ? (
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued">
                  Select one or more locations for this catalog.
                </Text>
                {availableLocations.map((location) => (
                  <Checkbox
                    key={location.id}
                    label={location.name}
                    checked={(companyFormData.selectedLocationIds || []).includes(location.shopifyId)}
                    onChange={(checked) => {
                      const currentIds = companyFormData.selectedLocationIds || [];
                      const nextIds = checked
                        ? [...currentIds, location.shopifyId]
                        : currentIds.filter((id) => id !== location.shopifyId);
                      handleCompanyFieldChange('selectedLocationIds', nextIds);
                    }}
                  />
                ))}
              </BlockStack>
            ) : (
              <Banner status="warning">
                <Text as="p">
                  No locations found for this company. Please add locations to the company first.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Duplicate Catalog Modal */}
      <Modal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="Duplicate Catalog"
        primaryAction={{
          content: "Create Duplicate",
          onAction: handleDuplicateCatalog,
          disabled: !duplicateFormData.title
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDuplicateModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Catalog Title"
              value={duplicateFormData.title}
              onChange={(value) => handleDuplicateFieldChange('title', value)}
              placeholder="Enter new catalog title"
              requiredIndicator
            />
            
            <Select
              label="Company"
              options={companies?.map(c => ({
                label: c.name,
                value: c.id.toString()
              })) || []}
              value={duplicateFormData.companyId}
              onChange={(value) => handleDuplicateFieldChange('companyId', value)}
            />
            
            <TextField
              label="Price List Name"
              value={duplicateFormData.priceListName}
              onChange={(value) => handleDuplicateFieldChange('priceListName', value)}
              placeholder="Enter price list name"
            />
            
            <TextField
              label="Publication Title"
              value={duplicateFormData.publicationTitle}
              onChange={(value) => handleDuplicateFieldChange('publicationTitle', value)}
              placeholder="Enter publication title"
            />
            
            <Text variant="bodySm" tone="subdued">
              This will create a new catalog with the same products and pricing rules as the current one.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Confirm Location Removal Modal */}
      <Modal
        open={confirmLocationRemovalOpen}
        onClose={() => {
          setConfirmLocationRemovalOpen(false);
          setPendingLocationIds([]);
          setLocationsToRemove([]);
        }}
        title="Confirm Location Removal"
        primaryAction={{
          content: "Remove and Update",
          destructive: true,
          onAction: confirmLocationUpdate,
          loading: isLoading,
          disabled: isLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setConfirmLocationRemovalOpen(false);
              setPendingLocationIds([]);
              setLocationsToRemove([]);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodyMd">
              You are removing this catalog from the following location(s):
            </Text>
            <List>
              {locationsToRemove.map((location) => (
                <List.Item key={location.id}>{location.name}</List.Item>
              ))}
            </List>
            <Text variant="bodySm" tone="subdued">
              Products from this catalog will no longer be available for removed locations.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
