import React, { useState, useEffect, useCallback } from 'react';
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAllProductsFromShopify } from "../models/product.server";
import { createCollection, getCollectionByTitle } from "../models/collection.server";
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
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "createCollection") {
      const title = formData.get("title");
      const description = formData.get("description") || "";
      const selectedProductsData = formData.get("selectedProducts");
      
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

      const discount = parseFloat(formData.get("discount")) || 0;

      console.log("SW what is session shop", session.shop);
      
      // Create the collection
      const result = await createCollection(session.shop, {
        title,
        description,
        products: selectedProducts,
        discount
      });

      console.log("SW what is the result for createCollection", result);
      

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
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { allProducts } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  
  // UI states
  const [currentStep, setCurrentStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState([]);

  // Handle action results
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Collection created successfully!");
      navigate("/app/collections");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify.toast, navigate]);

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

    if (selectedProducts.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "createCollection");
    formData.append("title", title);
    formData.append("description", description);
    formData.append("discount", discountPercentage.toString());
    formData.append("selectedProducts", JSON.stringify(selectedProducts));

    fetcher.submit(formData, { method: "POST" });
  }, [title, description, discountPercentage, selectedProducts, fetcher, shopify.toast]);

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
      if (selectedProducts.length === 0) {
        shopify.toast.show("Please select at least one product", { isError: true });
        return;
      }
      setCurrentStep(3);
    }
  }, [currentStep, title, selectedProducts.length, shopify.toast]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  // Progress calculation
  const progress = ((currentStep - 1) / 2) * 100;

  // Step titles
  const stepTitles = [
    "Collection Details",
    "Select Products", 
    "Set Pricing"
  ];

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
                  Step {currentStep} of 3: {stepTitles[currentStep - 1]}
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

              {currentStep === 3 && (
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
                  {currentStep < 3 ? (
                    <Button
                      onClick={handleNext}
                      variant="primary"
                      disabled={
                        (currentStep === 1 && !title.trim()) ||
                        (currentStep === 2 && selectedProducts.length === 0)
                      }
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      variant="primary"
                      loading={isLoading}
                      disabled={isLoading || !title || selectedProducts.length === 0}
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
                  {currentStep === 2 && "Select the products you want to include in this collection"}
                  {currentStep === 3 && "Review and set pricing for your selected products"}
                </Text>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
