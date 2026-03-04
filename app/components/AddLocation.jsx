import React, { useState, useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  TextField,
  Select,
  BlockStack,
  Button,
  InlineStack,
  Checkbox,
  Text,
} from "@shopify/polaris";

const countryOptions = [
  { label: "United States", value: "US" },
  { label: "Canada", value: "CA" },
  { label: "United Kingdom", value: "GB" },
];

export default function AddLocationModal({ onClose, companyId }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState("en");
  const [externalId, setExternalId] = useState("");
  const [note, setNote] = useState("");
  
  // Billing Address
  const [billingAddress1, setBillingAddress1] = useState("");
  const [billingAddress2, setBillingAddress2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [billingFirstName, setBillingFirstName] = useState("");
  const [billingLastName, setBillingLastName] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingCountryCode, setBillingCountryCode] = useState("US");
  
  // Shipping Address
  const [shippingAddress1, setShippingAddress1] = useState("");
  const [shippingAddress2, setShippingAddress2] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingFirstName, setShippingFirstName] = useState("");
  const [shippingLastName, setShippingLastName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingCountryCode, setShippingCountryCode] = useState("US");
  
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [taxExempt, setTaxExempt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fetcher = useFetcher();

  // Handle form submission result
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsSubmitting(false);
      if (fetcher.data.success) {
        onClose();
      }
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const handleSave = useCallback(() => {
    setIsSubmitting(true);
    
    const formData = {
      actionType: "create-location",
      companyId,
      name,
      phone,
      locale,
      externalId,
      note,
      billingAddress1,
      billingAddress2,
      billingCity,
      billingZip,
      billingFirstName,
      billingLastName,
      billingPhone,
      billingCountryCode,
      shippingAddress1: billingSameAsShipping ? billingAddress1 : shippingAddress1,
      shippingAddress2: billingSameAsShipping ? billingAddress2 : shippingAddress2,
      shippingCity: billingSameAsShipping ? billingCity : shippingCity,
      shippingZip: billingSameAsShipping ? billingZip : shippingZip,
      shippingFirstName: billingSameAsShipping ? billingFirstName : shippingFirstName,
      shippingLastName: billingSameAsShipping ? billingLastName : shippingLastName,
      shippingPhone: billingSameAsShipping ? billingPhone : shippingPhone,
      shippingCountryCode: billingSameAsShipping ? billingCountryCode : shippingCountryCode,
      billingSameAsShipping: billingSameAsShipping.toString(),
      taxExempt: taxExempt.toString(),
    };
    
    fetcher.submit(formData, { method: "post" });
  }, [name, phone, locale, externalId, note, billingAddress1, billingAddress2, billingCity, billingZip, billingFirstName, billingLastName, billingPhone, billingCountryCode, shippingAddress1, shippingAddress2, shippingCity, shippingZip, shippingFirstName, shippingLastName, shippingPhone, shippingCountryCode, billingSameAsShipping, taxExempt, fetcher, companyId]);

  return (
    <Modal
      open={true}
      onClose={!isSubmitting ? onClose : undefined}
      title="Add location"
      primaryAction={{
        content: isSubmitting ? "Creating Location..." : "Create Location",
        onAction: handleSave,
        variant: "primary",
        loading: isSubmitting,
        disabled: !name.trim(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: isSubmitting,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label="Location name"
            value={name}
            onChange={setName}
            placeholder="e.g. Downtown Store"
            autoComplete="off"
            requiredIndicator
          />

          <TextField
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="e.g. (555) 123-4567"
            autoComplete="tel"
          />

          <TextField
            label="External ID"
            value={externalId}
            onChange={setExternalId}
            placeholder="Optional external reference"
            autoComplete="off"
          />

          <TextField
            label="Notes"
            value={note}
            onChange={setNote}
            placeholder="Optional notes about this location"
            multiline={3}
            autoComplete="off"
          />

          {/* Billing Address Section */}
          <BlockStack gap="300">
            <Text variant="headingSm" as="h4">
              Billing Address
            </Text>
            
            <InlineStack gap="300">
              <TextField
                label="First name"
                value={billingFirstName}
                onChange={setBillingFirstName}
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                value={billingLastName}
                onChange={setBillingLastName}
                autoComplete="family-name"
              />
            </InlineStack>
            
            <TextField
              label="Address line 1"
              value={billingAddress1}
              onChange={setBillingAddress1}
              autoComplete="street-address"
            />
            
            <TextField
              label="Address line 2"
              value={billingAddress2}
              onChange={setBillingAddress2}
              autoComplete="address-line2"
            />
            
            <InlineStack gap="300">
              <TextField
                label="City"
                value={billingCity}
                onChange={setBillingCity}
                autoComplete="address-level2"
              />
              <TextField
                label="ZIP / Postal code"
                value={billingZip}
                onChange={setBillingZip}
                autoComplete="postal-code"
              />
            </InlineStack>
            
            <InlineStack gap="300">
              <TextField
                label="Phone"
                value={billingPhone}
                onChange={setBillingPhone}
                autoComplete="tel"
              />
              <Select
                label="Country"
                options={countryOptions}
                value={billingCountryCode}
                onChange={setBillingCountryCode}
              />
            </InlineStack>
          </BlockStack>

          {/* Shipping Address Section */}
          <BlockStack gap="300">
            <Checkbox
              label="Billing same as shipping address"
              checked={billingSameAsShipping}
              onChange={setBillingSameAsShipping}
            />
            
            {!billingSameAsShipping && (
              <BlockStack gap="300">
                <Text variant="headingSm" as="h4">
                  Shipping Address
                </Text>
                
                <InlineStack gap="300">
                  <TextField
                    label="First name"
                    value={shippingFirstName}
                    onChange={setShippingFirstName}
                    autoComplete="given-name"
                  />
                  <TextField
                    label="Last name"
                    value={shippingLastName}
                    onChange={setShippingLastName}
                    autoComplete="family-name"
                  />
                </InlineStack>
                
                <TextField
                  label="Address line 1"
                  value={shippingAddress1}
                  onChange={setShippingAddress1}
                  autoComplete="street-address"
                />
                
                <TextField
                  label="Address line 2"
                  value={shippingAddress2}
                  onChange={setShippingAddress2}
                  autoComplete="address-line2"
                />
                
                <InlineStack gap="300">
                  <TextField
                    label="City"
                    value={shippingCity}
                    onChange={setShippingCity}
                    autoComplete="address-level2"
                  />
                  <TextField
                    label="ZIP / Postal code"
                    value={shippingZip}
                    onChange={setShippingZip}
                    autoComplete="postal-code"
                  />
                </InlineStack>
                
                <InlineStack gap="300">
                  <TextField
                    label="Phone"
                    value={shippingPhone}
                    onChange={setShippingPhone}
                    autoComplete="tel"
                  />
                  <Select
                    label="Country"
                    options={countryOptions}
                    value={shippingCountryCode}
                    onChange={setShippingCountryCode}
                  />
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>

          <Checkbox
            label="Tax exempt"
            checked={taxExempt}
            onChange={setTaxExempt}
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
