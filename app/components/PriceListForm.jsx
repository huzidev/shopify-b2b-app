import React from "react";
import {
  Card,
  TextField,
  Select,
  BlockStack,
  Text,
  Banner,
  InlineStack,
  Box
} from "@shopify/polaris";

const ADJUSTMENT_TYPES = [
  { label: "Percentage Increase", value: "PERCENTAGE_INCREASE" },
  { label: "Percentage Decrease", value: "PERCENTAGE_DECREASE" }
];

const CURRENCIES = [
  { label: "USD - US Dollar", value: "USD" },
  { label: "CAD - Canadian Dollar", value: "CAD" },
  { label: "EUR - Euro", value: "EUR" },
  { label: "GBP - British Pound", value: "GBP" },
  { label: "AUD - Australian Dollar", value: "AUD" },
  { label: "JPY - Japanese Yen", value: "JPY" }
];

export function PriceListForm({ 
  formData, 
  onChange, 
  errors = {},
  existingPriceLists = [],
  disabled = false
}) {
  const handleFieldChange = (field, value) => {
    onChange({
      ...formData,
      [field]: value
    });
  };

  // Check if name already exists
  const nameExists = existingPriceLists?.some(pl => 
    pl.name.toLowerCase() === formData.name.toLowerCase()
  );

  // Generate suggested names
  const suggestAlternativeName = (baseName) => {
    let suggestedName = baseName;
    let counter = 1;
    
    while (existingPriceLists?.some(pl => pl.name.toLowerCase() === suggestedName.toLowerCase())) {
      counter++;
      suggestedName = `${baseName} ${counter}`;
    }
    
    return suggestedName;
  };

  return (
    <Card sectioned>
      <BlockStack gap="400">
        <Box>
          <Text variant="headingMd" as="h3">
            Create Price List
          </Text>
          <Text variant="bodyMd" tone="subdued">
            Set up pricing for this catalog. You can adjust prices with percentage increases or decreases.
          </Text>
        </Box>

        {nameExists && (
          <Banner status="warning">
            <Text as="p">
              A price list named "{formData.name}" already exists. 
              Try "{suggestAlternativeName(formData.name)}" instead.
            </Text>
          </Banner>
        )}

        {errors.priceList && (
          <Banner status="critical">
            <Text as="p">{errors.priceList}</Text>
          </Banner>
        )}

        <TextField
          label="Price List Name"
          value={formData.name}
          onChange={(value) => handleFieldChange("name", value)}
          placeholder="e.g. Wholesale Pricing, VIP Customer Rates"
          autoComplete="off"
          disabled={disabled}
          error={nameExists ? "This name is already taken" : ""}
          requiredIndicator
        />

        <InlineStack gap="400">
          <Box style={{ flex: 1 }}>
            <Select
              label="Currency"
              options={CURRENCIES}
              value={formData.currency}
              onChange={(value) => handleFieldChange("currency", value)}
              disabled={disabled}
              requiredIndicator
            />
          </Box>

          <Box style={{ flex: 1 }}>
            <Select
              label="Adjustment Type"
              options={ADJUSTMENT_TYPES}
              value={formData.adjustmentType}
              onChange={(value) => handleFieldChange("adjustmentType", value)}
              disabled={disabled}
              requiredIndicator
            />
          </Box>
        </InlineStack>

        <TextField
          label="Adjustment Value (%)"
          type="number"
          value={formData.adjustmentValue}
          onChange={(value) => handleFieldChange("adjustmentValue", value)}
          placeholder="0"
          suffix="%"
          min="0"
          max="100"
          step="0.01"
          disabled={disabled}
          requiredIndicator
        />

        {formData.adjustmentValue && (
          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <Text variant="bodyMd" tone="subdued">
              <strong>Example:</strong> If a product costs $100, customers will pay{" "}
              <Text as="span" fontWeight="semibold">
                ${formData.adjustmentType === "PERCENTAGE_INCREASE" 
                  ? (100 * (1 + parseFloat(formData.adjustmentValue || 0) / 100)).toFixed(2)
                  : (100 * (1 - parseFloat(formData.adjustmentValue || 0) / 100)).toFixed(2)
                }
              </Text>
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}