import { Banner, BlockStack, Modal, Text, TextField } from "@shopify/polaris";

export default function CustomerCreateModal({
  open,
  onClose,
  onConfirm,
  isLoading,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  setEmail,
  phone,
  setPhone,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Customer"
      primaryAction={{
        content: "Confirm and Create",
        onAction: onConfirm,
        loading: isLoading,
        disabled: isLoading || !email,
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
          <Banner tone="info">
            <Text as="p">Customer will be created in Shopify and immediately synced to the local database.</Text>
          </Banner>

          <TextField label="First Name" value={firstName} onChange={setFirstName} autoComplete="off" />
          <TextField label="Last Name" value={lastName} onChange={setLastName} autoComplete="off" />
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" />
          <TextField label="Phone" value={phone} onChange={setPhone} autoComplete="off" />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}