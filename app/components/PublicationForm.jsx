import React, { useState, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Card,
  TextField,
  Select,
  BlockStack,
  Text,
  Banner,
  Button,
  InlineStack,
  Box,
  Tag,
  EmptyState
} from "@shopify/polaris";

const DEFAULT_STATES = [
  { label: "All products (automatic)", value: "ALL_PRODUCTS" },
  { label: "Empty (manual selection)", value: "EMPTY" }
];

export function PublicationForm({ 
  formData, 
  onChange, 
  errors = {},
  disabled = false,
  selectedProducts = [],
  onProductsChange
}) {
  const shopify = useAppBridge();

  const handleFieldChange = (field, value) => {
    onChange({
      ...formData,
      [field]: value
    });
  };

  const handleProductSelection = useCallback(async () => {
    try {
      const products = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        action: "select",
        filter: {
          hidden: false,
          variants: false,
        },
      });

      if (products && products.length > 0) {
        const productData = products.map(product => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          images: product.images || []
        }));
        
        onProductsChange(productData);
      }
    } catch (error) {
      console.error('Error selecting products:', error);
      shopify.toast.show('Error selecting products', { isError: true });
    }
  }, [shopify, onProductsChange]);

  const removeProduct = useCallback((productId) => {
    const updatedProducts = selectedProducts.filter(product => product.id !== productId);
    onProductsChange(updatedProducts);
  }, [selectedProducts, onProductsChange]);

  const clearAllProducts = useCallback(() => {
    onProductsChange([]);
  }, [onProductsChange]);

  return (
    <Card sectioned>
      <BlockStack gap="400">
        <Box>
          <Text variant="headingMd" as="h3">
            Create Publication
          </Text>
          <Text variant="bodyMd" tone="subdued">
            Publications control which products are available in your catalog. You can include all products automatically or select specific ones.
          </Text>
        </Box>

        {errors.publication && (
          <Banner status="critical">
            <Text as="p">{errors.publication}</Text>
          </Banner>
        )}

        <TextField
          label="Publication Title"
          value={formData.title}
          onChange={(value) => handleFieldChange("title", value)}
          placeholder="e.g. Core Wholesale Publication, VIP Product Collection"
          autoComplete="off"
          disabled={disabled}
          requiredIndicator
        />

        <Select
          label="Product Selection Method"
          options={DEFAULT_STATES}
          value={formData.defaultState}
          onChange={(value) => handleFieldChange("defaultState", value)}
          disabled={disabled}
          requiredIndicator
          helpText={
            formData.defaultState === "ALL_PRODUCTS" 
              ? "Automatically includes all current and future products"
              : "Manually select which products are available"
          }
        />

        {formData.defaultState === "EMPTY" && (
          <Card sectioned subdued>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm" as="h4">
                  Selected Products ({selectedProducts.length})
                </Text>
                <InlineStack gap="200">
                  <Button onClick={handleProductSelection} disabled={disabled}>
                    Select Products
                  </Button>
                  {selectedProducts.length > 0 && (
                    <Button 
                      variant="plain"
                      tone="critical"
                      onClick={clearAllProducts}
                      disabled={disabled}
                    >
                      Clear All
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>

              {selectedProducts.length === 0 ? (
                <EmptyState
                  heading="No products selected"
                  action={{
                    content: "Select products",
                    onAction: handleProductSelection,
                    disabled: disabled
                  }}
                  image="https://cdn.shopify.com/s/files/1/2376/3301/products/emptystate-files.png"
                >
                  <Text tone="subdued">
                    Choose which products will be available in this publication
                  </Text>
                </EmptyState>
              ) : (
                <Box>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">
                      Selected Products:
                    </Text>
                    <Box>
                      <InlineStack gap="100" wrap>
                        {selectedProducts.map((product) => (
                          <Tag
                            key={product.id}
                            onRemove={disabled ? undefined : () => removeProduct(product.id)}
                          >
                            {product.title}
                          </Tag>
                        ))}
                      </InlineStack>
                    </Box>
                    {selectedProducts.length > 5 && (
                      <Text variant="bodySm" tone="subdued">
                        Showing first 50 products. Use the product selector to manage your selection.
                      </Text>
                    )}
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        )}

        {formData.defaultState === "ALL_PRODUCTS" && (
          <Box padding="300" background="bg-surface-info" borderRadius="200">
            <Text variant="bodyMd">
              <strong>Automatic mode:</strong> All current products and any future products you add 
              to your store will automatically be included in this publication.
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}