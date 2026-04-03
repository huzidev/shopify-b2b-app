import { Banner, BlockStack, Modal, Text } from "@shopify/polaris";

export default function CustomerDeleteModal({ open, onClose, onConfirm, customer }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete Customer"
      primaryAction={{
        content: "Delete",
        onAction: onConfirm,
        tone: "critical",
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Banner tone="warning">
            <Text as="p">
              Are you sure you want to delete customer <strong>{customer?.firstName} {customer?.lastName}</strong>? This action cannot be undone.
            </Text>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}