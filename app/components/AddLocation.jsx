import React, { useState, useCallback } from "react";
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

export default function AddLocationModal() {
  const [open, setOpen] = useState(true);
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState("");

  const handleClose = useCallback(() => setOpen(false), []);
  const handleOpen = useCallback(() => setOpen(true), []);

  const handleSave = useCallback(() => {
    // Handle save logic here
    console.log({ locationName, address, selectedCatalog });
    setOpen(false);
  }, [locationName, address, selectedCatalog]);

  return (
    <div>
      {/* Trigger button to reopen modal for demo */}
      {!open && (
        <div style={{ padding: 24 }}>
          <Button variant="primary" onClick={handleOpen}>
            Add location
          </Button>
        </div>
      )}

      <Modal
        open={open}
        onClose={handleClose}
        title="Add location"
        primaryAction={{
          content: "Save location",
          onAction: handleSave,
          variant: "primary",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleClose,
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
    </div>
  );
}
