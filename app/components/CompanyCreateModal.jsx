import { Banner, BlockStack, Modal, Text, TextField } from "@shopify/polaris";

export default function CompanyCreateModal({
  open,
  onClose,
  onConfirm,
  isLoading,
  name,
  setName,
  locationName,
  setLocationName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  setEmail,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Company"
      primaryAction={{
        content: "Create Company",
        onAction: onConfirm,
        loading: isLoading,
        disabled: isLoading || !name,
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
            <Text as="p">A company, location, and primary contact will be created and synced to the local database.</Text>
          </Banner>

          <TextField label="Company Name" value={name} onChange={setName} autoComplete="off" />
          <TextField label="Location Name" value={locationName} onChange={setLocationName} autoComplete="off" />
          <TextField label="Contact First Name" value={firstName} onChange={setFirstName} autoComplete="off" />
          <TextField label="Contact Last Name" value={lastName} onChange={setLastName} autoComplete="off" />
          <TextField label="Contact Email" type="email" value={email} onChange={setEmail} autoComplete="off" />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}