import React from "react";
import {
  Modal,
  TextField,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/polaris";

export default function LocationModal({
  open,
  onClose,
  onSubmit,
  isLoading,
  isEditMode,
  locationForm,
  setLocationForm,
}) {
  const updateField = (field, value) => {
    setLocationForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isLoading) {
          onClose();
        }
      }}
      title={isEditMode ? "Edit Location" : "Add Location"}
      primaryAction={{
        content: isEditMode ? "Save Changes" : "Add Location",
        onAction: onSubmit,
        loading: isLoading,
        disabled: isLoading || !locationForm.name?.trim(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => {
            if (!isLoading) {
              onClose();
            }
          },
          disabled: isLoading,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label="Location Name"
            value={locationForm.name}
            onChange={(value) => updateField("name", value)}
            disabled={isLoading}
            placeholder="e.g. Downtown Store"
            requiredIndicator
            autoComplete="off"
          />

          <InlineStack gap="300">
            <TextField
              label="First Name"
              value={locationForm.firstName}
              onChange={(value) => updateField("firstName", value)}
              disabled={isLoading}
              autoComplete="given-name"
            />
            <TextField
              label="Last Name"
              value={locationForm.lastName}
              onChange={(value) => updateField("lastName", value)}
              disabled={isLoading}
              autoComplete="family-name"
            />
          </InlineStack>

          <TextField
            label="Company"
            value={locationForm.company}
            onChange={(value) => updateField("company", value)}
            disabled={isLoading}
            autoComplete="organization"
          />

          <TextField
            label="Phone"
            value={locationForm.phone}
            onChange={(value) => updateField("phone", value)}
            disabled={isLoading}
            placeholder="e.g. (555) 123-4567"
            autoComplete="tel"
          />

          <BlockStack gap="200">
            <Text variant="headingSm" as="h4">
              Address
            </Text>

            <TextField
              label="Address Line 1"
              value={locationForm.address1}
              onChange={(value) => updateField("address1", value)}
              disabled={isLoading}
              autoComplete="street-address"
            />

            <TextField
              label="Address Line 2"
              value={locationForm.address2}
              onChange={(value) => updateField("address2", value)}
              disabled={isLoading}
              autoComplete="address-line2"
            />

            <InlineStack gap="300">
              <TextField
                label="City"
                value={locationForm.city}
                onChange={(value) => updateField("city", value)}
                disabled={isLoading}
                autoComplete="address-level2"
              />
              <TextField
                label="Province"
                value={locationForm.province}
                onChange={(value) => updateField("province", value)}
                disabled={isLoading}
                autoComplete="address-level1"
              />
            </InlineStack>

            <InlineStack gap="300">
              <TextField
                label="Country"
                value={locationForm.country}
                onChange={(value) => updateField("country", value)}
                disabled={isLoading}
                autoComplete="country-name"
              />
              <TextField
                label="Zip Code"
                value={locationForm.zip}
                onChange={(value) => updateField("zip", value)}
                disabled={isLoading}
                autoComplete="postal-code"
              />
            </InlineStack>

            <InlineStack gap="300">
              <TextField
                label="Province Code"
                value={locationForm.provinceCode}
                onChange={(value) => updateField("provinceCode", value)}
                disabled={isLoading}
              />
              <TextField
                label="Country Code"
                value={locationForm.countryCode}
                onChange={(value) => updateField("countryCode", value)}
                disabled={isLoading}
              />
            </InlineStack>

            <TextField
              label="Country Name"
              value={locationForm.countryName}
              onChange={(value) => updateField("countryName", value)}
              disabled={isLoading}
            />
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
