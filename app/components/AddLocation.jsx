import React, { useState, useCallback } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  TextField,
  Select,
  BlockStack,
  Button,
  InlineStack,
} from "@shopify/polaris";

const catalogOptions = [
  { label: "Select catalogs...", value: "" },
  { label: "Core Wholesale Catalog", value: "core" },
  { label: "Holiday 2026 Catalog", value: "holiday" },
  { label: "Seasonal Promotions", value: "seasonal" },
  { label: "Bulk Orders Catalog", value: "bulk" },
];

export default function AddLocationModal({ onClose, companyId }) {
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const fetcher = useFetcher();

  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        actionType: "addLocation",
        locationName,
        address,
        selectedCatalog,
      },
      { method: "post" }
    );
    onClose();
  }, [locationName, address, selectedCatalog, fetcher, onClose]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Add location"
      primaryAction={{
        content: "Save location",
        onAction: handleSave,
        variant: "primary",
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label="Location name"
            value={locationName}
            onChange={setLocationName}
            placeholder="e.g. Downtown Store"
            autoComplete="off"
          />

          <TextField
            label="Address"
            value={address}
            onChange={setAddress}
            placeholder="e.g. 100 Main St, Denver, CO"
            autoComplete="street-address"
          />

          <Select
            label="Assign catalogs"
            options={catalogOptions}
            value={selectedCatalog}
            onChange={setSelectedCatalog}
            placeholder="Select catalogs..."
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
