import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAllProductsFromShopify } from "../models/product.server";
import { createCollection, getCollectionByTitle } from "../models/collection.server";
import { searchSyncedCustomers } from "../models/customer.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Box,
  DataTable,
  Badge,
  Checkbox,
  EmptyState,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  
  // Fetch all products from Shopify  
  const products = await getAllProductsFromShopify(admin);
  
  const allProducts = products?.edges?.map(edge => {
    const product = edge.node;
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      variants: product.variants?.edges?.map(variantEdge => {
        const variant = variantEdge.node;
        return {
          id: variant.id,
          sku: variant.sku || 'N/A',
          title: variant.title || 'Default Title',
          price: parseFloat(variant.price) || 0,
          inventoryQuantity: variant.inventoryQuantity || 0,
        };
      }) || []
    };
  }) || [];

  return { 
    allProducts
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "searchCustomers") {
      const query = formData.get("query") || "";
      const customers = await searchSyncedCustomers(session.shop, query, 20);

      return {
        success: true,
        customers,
      };
    }

    if (actionType === "createCollection") {
      const title = formData.get("title");
      const description = formData.get("description") || "";
      const selectedProductsData = formData.get("selectedProducts");
      const selectedCustomersData = formData.get("selectedCustomers");
      const selectedCustomerLocationsData = formData.get("selectedCustomerLocations");
      
      if (!title) {
        return {
          success: false,
          error: "Collection title is required"
        };
      }

      // Check for duplicate title
      const existingCollection = await getCollectionByTitle(session.shop, title);
      if (existingCollection) {
        return {
          success: false,
          error: `Collection with title "${title}" already exists. Please choose a different title.`
        };
      }

      let selectedProducts = [];
      if (selectedProductsData) {
        try {
          selectedProducts = JSON.parse(selectedProductsData);
        } catch (e) {
          return {
            success: false,
            error: "Invalid product data format"
          };
        }
      }

      if (selectedProducts.length === 0) {
        return {
          success: false,
          error: "Please select at least one product for the collection"
        };
      }

      let selectedCustomers = [];
      if (selectedCustomersData) {
        try {
          selectedCustomers = JSON.parse(selectedCustomersData);
        } catch (e) {
          return {
            success: false,
            error: "Invalid customer data format"
          };
        }
      }

      if (selectedCustomers.length === 0) {
        return {
          success: false,
          error: "Please select at least one customer for this collection"
        };
      }

      let selectedCustomerLocations = [];
      if (selectedCustomerLocationsData) {
        try {
          selectedCustomerLocations = JSON.parse(selectedCustomerLocationsData);
        } catch (e) {
          return {
            success: false,
            error: "Invalid customer location data format"
          };
        }
      }

      if (selectedCustomerLocations.length === 0) {
        return {
          success: false,
          error: "Please select at least one customer location for this collection"
        };
      }

      const discount = parseFloat(formData.get("discount")) || 0;
      
      // Create the collection
      const result = await createCollection(session.shop, {
        title,
        description,
        products: selectedProducts,
        customers: selectedCustomers,
        customerLocations: selectedCustomerLocations,
        discount
      });

      if (!result.success) {
        return { 
          success: false, 
          error: `Failed to create collection: ${result.error}`
        };
      }

      return { 
        success: true, 
        collection: result.collection
      };
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Collection creation error:", error);
    return { success: false, error: error.message };
  }
};

export default function AppCreateCollection() {
  const createFetcher = useFetcher();
  const customerSearchFetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { allProducts } = useLoaderData();
  const isLoading = createFetcher.state === "submitting";

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  
  // UI states
  const [currentStep, setCurrentStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedCustomerSearchTerm, setDebouncedCustomerSearchTerm] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState([]);
  const lastSubmittedCustomerQueryRef = useRef("");

  // Handle action results
  useEffect(() => {
    if (createFetcher.data?.success) {
      shopify.toast.show("Collection created successfully!");
      navigate("/app/collections");
    } else if (createFetcher.data?.error) {
      shopify.toast.show(createFetcher.data.error, { isError: true });
    }
  }, [createFetcher.data, navigate, shopify]);

  useEffect(() => {
    if (customerSearchFetcher.data?.success) {
      setCustomerResults(customerSearchFetcher.data.customers || []);
    }
  }, [customerSearchFetcher.data]);

  useEffect(() => {
    if (currentStep !== 2) {
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedCustomerSearchTerm(customerSearchTerm.trim());
    }, 600);

    return () => clearTimeout(timer);
  }, [customerSearchTerm, currentStep]);

  useEffect(() => {
    if (currentStep !== 2) {
      return;
    }

    if (!debouncedCustomerSearchTerm) {
      setCustomerResults([]);
      lastSubmittedCustomerQueryRef.current = "";
      return;
    }

    // Avoid duplicate requests for the same debounced query.
    if (lastSubmittedCustomerQueryRef.current === debouncedCustomerSearchTerm) {
      return;
    }

    lastSubmittedCustomerQueryRef.current = debouncedCustomerSearchTerm;

    const formData = new FormData();
    formData.append("actionType", "searchCustomers");
    formData.append("query", debouncedCustomerSearchTerm);
    customerSearchFetcher.submit(formData, { method: "POST" });
  }, [debouncedCustomerSearchTerm, currentStep]);

  useEffect(() => {
    if (currentStep !== 2) {
      setDebouncedCustomerSearchTerm("");
      lastSubmittedCustomerQueryRef.current = "";
      setCustomerResults([]);
    }
  }, [currentStep]);

  // Filter products based on search
  const filteredProducts = allProducts.filter(product =>
    product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.variants.some(variant => 
      variant.sku.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Handle variant selection from table
  const handleVariantToggle = useCallback((product, variant, isChecked) => {
    const variantId = variant.id;
    
    if (isChecked) {
      const newProduct = {
        productId: product.id,
        variantId,
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        originalPrice: variant.price,
        discountedPrice: variant.price,
        currency: "USD"
      };
      
      setSelectedProducts(prev => [...prev, newProduct]);
      setSelectedVariantIds(prev => [...prev, variantId]);
    } else {
      setSelectedProducts(prev => prev.filter(item => item.variantId !== variantId));
      setSelectedVariantIds(prev => prev.filter(id => id !== variantId));
    }
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (!title) {
      shopify.toast.show("Please enter a collection title", { isError: true });
      return;
    }

    if (selectedCustomers.length === 0) {
      shopify.toast.show("Please select at least one customer", { isError: true });
      return;
    }

    if (selectedLocationIds.length === 0) {
      shopify.toast.show("Please select at least one customer location", { isError: true });
      return;
    }

    if (selectedProducts.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "createCollection");
    formData.append("title", title);
    formData.append("description", description);
    formData.append("discount", discountPercentage.toString());
    formData.append("selectedCustomers", JSON.stringify(selectedCustomers));
    formData.append(
      "selectedCustomerLocations",
      JSON.stringify(
        selectedLocationIds.map((locationId) => {
          const owner = selectedCustomers.find((customer) =>
            (customer.locations || []).some((location) => location.id === locationId),
          );

          return {
            customerId: owner?.id,
            locationId,
          };
        }),
      ),
    );
    formData.append("selectedProducts", JSON.stringify(selectedProducts));

    createFetcher.submit(formData, { method: "POST" });
  }, [
    title,
    description,
    discountPercentage,
    selectedCustomers,
    selectedLocationIds,
    selectedProducts,
    createFetcher,
    shopify,
  ]);

  // Apply percentage discount to all products
  const applyPercentageDiscount = useCallback((percentage) => {
    setSelectedProducts(prev => 
      prev.map(product => ({
        ...product,
        discountedPrice: product.originalPrice * (1 - percentage / 100)
      }))
    );
  }, []);

  // Handle discount percentage change
  const handleDiscountPercentageChange = useCallback((value) => {
    const percentage = parseFloat(value) || 0;
    setDiscountPercentage(percentage);
    applyPercentageDiscount(percentage);
  }, [applyPercentageDiscount]);

  // Remove product from selection
  const handleRemoveProduct = useCallback((variantId) => {
    setSelectedProducts(prev => prev.filter(item => item.variantId !== variantId));
    setSelectedVariantIds(prev => prev.filter(id => id !== variantId));
  }, []);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      if (!title.trim()) {
        shopify.toast.show("Please enter a collection title", { isError: true });
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (selectedCustomers.length === 0) {
        shopify.toast.show("Please assign at least one customer", { isError: true });
        return;
      }
      if (selectedLocationIds.length === 0) {
        shopify.toast.show("Please select at least one customer location", { isError: true });
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (selectedProducts.length === 0) {
        shopify.toast.show("Please select at least one product", { isError: true });
        return;
      }
      setCurrentStep(4);
    }
  }, [currentStep, title, selectedCustomers.length, selectedLocationIds.length, selectedProducts.length, shopify]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleSelectCustomer = useCallback((customer) => {
    setSelectedCustomers((prev) => {
      if (prev.some((item) => item.id === customer.id)) {
        return prev;
      }

      return [
        ...prev,
        {
          id: customer.id,
          shopifyCustomerId: customer.shopifyCustomerId,
          shopifyNumericId: customer.shopifyNumericId,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          locations: customer.locations || [],
        },
      ];
    });

    // Default to selecting all known locations for a newly added customer.
    if (customer.locations?.length) {
      setSelectedLocationIds((prev) => {
        const next = new Set(prev);
        customer.locations.forEach((location) => {
          if (location?.id) {
            next.add(location.id);
          }
        });
        return Array.from(next);
      });
    }
  }, []);

  const handleRemoveCustomer = useCallback((customerId) => {
    setSelectedCustomers((prev) => {
      const customerToRemove = prev.find((customer) => customer.id === customerId);
      const remainingCustomers = prev.filter((customer) => customer.id !== customerId);

      if (customerToRemove?.locations?.length) {
        const removedIds = new Set(customerToRemove.locations.map((location) => location.id));
        setSelectedLocationIds((current) => current.filter((id) => !removedIds.has(id)));
      }

      return remainingCustomers;
    });
  }, []);

  const handleLocationToggle = useCallback((locationId, checked) => {
    setSelectedLocationIds((prev) => {
      if (checked) {
        if (prev.includes(locationId)) {
          return prev;
        }
        return [...prev, locationId];
      }

      return prev.filter((id) => id !== locationId);
    });
  }, []);

  // Progress calculation
  const progress = ((currentStep - 1) / 3) * 100;

  // Step titles
  const stepTitles = [
    "Collection Details",
    "Assign Customers",
    "Select Products", 
    "Set Pricing"
  ];

  const formatCustomerName = (customer) => {
    const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
    return fullName || "No name";
  };

  const formatLocationLabel = (location) => {
    const parts = [
      location?.name,
      location?.address1,
      location?.city,
      location?.province,
      location?.zip,
    ].filter(Boolean);

    return parts.join(" - ") || `Location #${location?.id}`;
  };

  return (
    <Page
      title="Create Collection"
      backAction={{
        onAction: () => navigate("/app/collections"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Progress Bar */}
              <Box>
                <Text variant="headingMd" as="h2">
                  Step {currentStep} of 4: {stepTitles[currentStep - 1]}
                </Text>
                <Box paddingBlockStart="200">
                  <ProgressBar progress={progress} />
                </Box>
              </Box>

              <Divider />

              {/* Step Content */}
              {currentStep === 1 && (
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h3">Collection Information</Text>
                  <Text color="subdued">
                    Set up the basic details for your product collection.
                  </Text>
                  
                  <BlockStack gap="300">
                    <TextField
                      label="Collection Title"
                      value={title}
                      onChange={setTitle}
                      placeholder="Enter collection title"
                      requiredIndicator
                      autoComplete="off"
                      helpText="Choose a descriptive name for your collection"
                    />
                    <TextField
                      label="Description (Optional)"
                      value={description}
                      onChange={setDescription}
                      placeholder="Enter collection description"
                      multiline={4}
                      autoComplete="off"
                      helpText="Describe what this collection is about"
                    />
                  </BlockStack>
                </BlockStack>
              )}

              {currentStep === 2 && (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h3">Assign Customers</Text>
                    <Text color="subdued">
                      Search synced customers, add them, then choose the specific customer locations for this collection.
                    </Text>
                  </BlockStack>

                  <TextField
                    label="Search customers"
                    value={customerSearchTerm}
                    onChange={setCustomerSearchTerm}
                    placeholder="Search by email, Shopify ID, or customer name"
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setCustomerSearchTerm("")}
                  />

                  {customerSearchFetcher.state === "submitting" && (
                    <Text color="subdued">Searching customers...</Text>
                  )}

                  {selectedCustomers.length > 0 && (
                    <Banner tone="info">
                      <Text>
                        {selectedCustomers.length} customer{selectedCustomers.length !== 1 ? 's' : ''} assigned, {selectedLocationIds.length} location{selectedLocationIds.length !== 1 ? 's' : ''} selected
                      </Text>
                    </Banner>
                  )}

                  {selectedCustomers.length > 0 && (
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h4">Selected Customers and Locations</Text>
                        {selectedCustomers.map((customer) => (
                          <BlockStack key={`selected-customer-${customer.id}`} gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="050">
                                <Text fontWeight="semibold">{formatCustomerName(customer)}</Text>
                                <Text color="subdued">{customer.email || "No email"}</Text>
                              </BlockStack>
                              <Button
                                tone="critical"
                                size="slim"
                                onClick={() => handleRemoveCustomer(customer.id)}
                              >
                                Remove Customer
                              </Button>
                            </InlineStack>

                            {customer.locations?.length ? (
                              <BlockStack gap="100">
                                {customer.locations.map((location) => (
                                  <Checkbox
                                    key={`location-${customer.id}-${location.id}`}
                                    label={formatLocationLabel(location)}
                                    checked={selectedLocationIds.includes(location.id)}
                                    onChange={(checked) => handleLocationToggle(location.id, checked)}
                                  />
                                ))}
                              </BlockStack>
                            ) : (
                              <Text color="subdued">No locations found for this customer.</Text>
                            )}

                            <Divider />
                          </BlockStack>
                        ))}
                      </BlockStack>
                    </Card>
                  )}

                  {customerResults.length === 0 ? (
                    <EmptyState
                      heading="No customers found"
                      description="Sync customers first or adjust your search term"
                    />
                  ) : (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text']}
                      headings={['Name', 'Email', 'Shopify ID', 'Action']}
                      rows={customerResults.map((customer) => {
                        const isSelected = selectedCustomers.some((item) => item.id === customer.id);
                        return [
                          <Text key={`name-${customer.id}`} fontWeight="semibold">{formatCustomerName(customer)}</Text>,
                          <Text key={`email-${customer.id}`}>{customer.email || 'N/A'}</Text>,
                          <Text key={`id-${customer.id}`}>{customer.shopifyNumericId || customer.shopifyCustomerId}</Text>,
                          isSelected ? (
                            <Button key={`remove-${customer.id}`} onClick={() => handleRemoveCustomer(customer.id)} tone="critical" size="slim">
                              Remove
                            </Button>
                          ) : (
                            <Button key={`add-${customer.id}`} onClick={() => handleSelectCustomer(customer)} variant="primary" size="slim">
                              Add
                            </Button>
                          ),
                        ];
                      })}
                    />
                  )}
                </BlockStack>
              )}

              {currentStep === 3 && (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h3">Select Products</Text>
                    <Text color="subdued">
                      Choose products to include in your collection "{title}".
                    </Text>
                  </BlockStack>

                  <TextField
                    label="Search products"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Search by product title or SKU"
                    clearButton
                    onClearButtonClick={() => setSearchTerm("")}
                  />

                  {selectedProducts.length > 0 && (
                    <Banner tone="info">
                      <Text>
                        {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                      </Text>
                    </Banner>
                  )}

                  {filteredProducts.length === 0 ? (
                    <EmptyState
                      heading="No products found"
                      description="Try adjusting your search terms"
                    />
                  ) : (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'numeric']}
                      headings={['Select', 'Product', 'Variant', 'SKU', 'Price', 'Stock']}
                      rows={filteredProducts.flatMap(product => 
                        product.variants.map(variant => {
                          const isSelected = selectedVariantIds.includes(variant.id);
                          return [
                            <Checkbox
                              key={`checkbox-${variant.id}`}
                              checked={isSelected}
                              onChange={(checked) => handleVariantToggle(product, variant, checked)}
                            />,
                            <Text key={`product-${variant.id}`} fontWeight="semibold">{product.title}</Text>,
                            <Text key={`variant-${variant.id}`}>{variant.title}</Text>,
                            <Text key={`sku-${variant.id}`}>{variant.sku}</Text>,
                            <Text key={`price-${variant.id}`}>${variant.price.toFixed(2)}</Text>,
                            <Text key={`stock-${variant.id}`}>{variant.inventoryQuantity}</Text>
                          ];
                        })
                      )}
                    />
                  )}
                </BlockStack>
              )}

              {currentStep === 4 && (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h3">Set Pricing</Text>
                    <Text color="subdued">
                      Apply a percentage discount to all selected products in your collection.
                    </Text>
                  </BlockStack>

                  <Card>
                    <BlockStack gap="400">
                      <TextField
                        label="Discount Percentage"
                        type="number"
                        value={discountPercentage.toString()}
                        onChange={handleDiscountPercentageChange}
                        suffix="%"
                        min="0"
                        max="100"
                        step="1"
                        helpText="Enter the discount percentage to apply to all products (e.g., 10 for 10% off)"
                      />

                      {discountPercentage > 0 && (
                        <Banner tone="info">
                          <Text>
                            {discountPercentage}% discount will be applied to all selected products
                          </Text>
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>

                  <BlockStack gap="300">
                    <Text variant="headingMd">Selected Products ({selectedProducts.length})</Text>
                    
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'text']}
                      headings={['Product', 'Variant', 'SKU', 'Original Price', 'Discounted Price', 'Action']}
                      rows={selectedProducts.map((product) => [
                        <Text key={`title-${product.variantId}`} fontWeight="semibold">{product.productTitle}</Text>,
                        <Text key={`variant-${product.variantId}`}>{product.variantTitle}</Text>,
                        <Text key={`sku-${product.variantId}`}>{product.sku}</Text>,
                        <Text key={`original-${product.variantId}`}>${product.originalPrice.toFixed(2)}</Text>,
                        <Text key={`discounted-${product.variantId}`} color={discountPercentage > 0 ? "success" : "subdued"}>
                          ${product.discountedPrice.toFixed(2)}
                          {discountPercentage > 0 && (
                            <Text as="span" color="success"> (-{discountPercentage}%)</Text>
                          )}
                        </Text>,
                        <Button 
                          key={`remove-${product.variantId}`}
                          onClick={() => handleRemoveProduct(product.variantId)}
                          destructive
                          size="slim"
                        >
                          Remove
                        </Button>
                      ])}
                    />
                  </BlockStack>
                </BlockStack>
              )}

              <Divider />

              {/* Navigation */}
              <InlineStack align="space-between">
                <Button
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  variant="secondary"
                >
                  Previous
                </Button>

                <InlineStack gap="200">
                  {currentStep < 4 ? (
                    <Button
                      onClick={handleNext}
                      variant="primary"
                      disabled={
                        (currentStep === 1 && !title.trim()) ||
                        (currentStep === 2 && (selectedCustomers.length === 0 || selectedLocationIds.length === 0)) ||
                        (currentStep === 3 && selectedProducts.length === 0)
                      }
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      variant="primary"
                      loading={isLoading}
                      disabled={isLoading || !title || selectedCustomers.length === 0 || selectedLocationIds.length === 0 || selectedProducts.length === 0}
                    >
                      Create Collection
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>

              {/* Helper Text */}
              <Box paddingBlockStart="200">
                <Text color="subdued" alignment="center">
                  {currentStep === 1 && "Enter your collection details to get started"}
                  {currentStep === 2 && "Assign customers who should be able to view this collection"}
                  {currentStep === 3 && "Select the products you want to include in this collection"}
                  {currentStep === 4 && "Review and set pricing for your selected products"}
                </Text>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
