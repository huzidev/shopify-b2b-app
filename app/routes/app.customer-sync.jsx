import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  createCustomerInShopify,
  getCustomerStats,
  getCustomersWithSyncStatus,
  syncCustomersToDatabase,
} from "../models/customer.server";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField,
  Icon,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { EyeIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const [stats, customersWithStatus] = await Promise.all([
    getCustomerStats(session.shop),
    getCustomersWithSyncStatus(admin, session.shop),
  ]);

  // Fetch location counts for each customer
  const customersWithLocations = customersWithStatus.map(customer => {
    // Will be fetched on client if needed
    return customer;
  });

  return {
    stats,
    customersWithStatus: customersWithLocations,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "createCustomer") {
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const email = (formData.get("email") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();

      if (!email) {
        return { success: false, error: "Email is required" };
      }

      const createResult = await createCustomerInShopify(admin, session.shop, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email,
        phone: phone || undefined,
      });

      if (!createResult.success) {
        return createResult;
      }

      const [updatedStats, updatedCustomersWithStatus] = await Promise.all([
        getCustomerStats(session.shop),
        getCustomersWithSyncStatus(admin, session.shop),
      ]);

      return {
        success: true,
        message: "Customer created successfully",
        updatedStats,
        updatedCustomersWithStatus,
      };
    }

    if (actionType === "deleteCustomer") {
      const shopifyCustomerId = (formData.get("shopifyCustomerId") || "").toString().trim();
      
      if (!shopifyCustomerId) {
        return { success: false, error: "Customer ID is required" };
      }

      // Delete from Shopify
      const deleteResponse = await admin.graphql(
        `#graphql
        mutation deleteCustomer($id: ID!) {
          customerDelete(input: {id: $id}) {
            userErrors {
              field
              message
            }
            deletedCustomerIds
          }
        }`,
        {
          variables: {
            id: shopifyCustomerId,
          },
        },
      );

      const json = await deleteResponse.json();
      const result = json?.data?.customerDelete;

      if (result?.userErrors?.length > 0) {
        return { success: false, error: result.userErrors[0].message };
      }

      const [updatedStats, updatedCustomersWithStatus] = await Promise.all([
        getCustomerStats(session.shop),
        getCustomersWithSyncStatus(admin, session.shop),
      ]);

      return {
        success: true,
        message: "Customer deleted successfully",
        updatedStats,
        updatedCustomersWithStatus,
      };
    }

    const syncResult = await syncCustomersToDatabase(admin, session.shop);
    if (!syncResult.success) {
      return syncResult;
    }

    const [updatedStats, updatedCustomersWithStatus] = await Promise.all([
      getCustomerStats(session.shop),
      getCustomersWithSyncStatus(admin, session.shop),
    ]);

    return {
      success: true,
      syncedCount: syncResult.syncedCount,
      message: `Synced ${syncResult.syncedCount} customers from Shopify`,
      updatedStats,
      updatedCustomersWithStatus,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export default function AppCustomerSync() {
  const { stats, customersWithStatus } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const isLoading = fetcher.state === "submitting";

  const [currentStats, setCurrentStats] = useState(stats);
  const [currentCustomers, setCurrentCustomers] = useState(customersWithStatus || []);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [customerLocations, setCustomerLocations] = useState({});

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Operation completed successfully");
      if (fetcher.data.updatedStats) {
        setCurrentStats(fetcher.data.updatedStats);
      }
      if (fetcher.data.updatedCustomersWithStatus) {
        setCurrentCustomers(fetcher.data.updatedCustomersWithStatus);
      }
      if (isCreateModalOpen) {
        setIsCreateModalOpen(false);
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, isCreateModalOpen, shopify]);

  const syncedCount = useMemo(
    () => (currentCustomers || []).filter((customer) => customer.syncStatus === "SYNCED").length,
    [currentCustomers],
  );

  const handleSyncAll = () => {
    fetcher.submit({ actionType: "syncCustomers" }, { method: "POST" });
  };

  const handleCreateCustomerConfirm = () => {
    fetcher.submit(
      {
        actionType: "createCustomer",
        firstName,
        lastName,
        email,
        phone,
      },
      { method: "POST" },
    );
  };

  const handleViewCustomer = (customerId, numericId) => {
    navigate(`/app/customer/${numericId}`);
  };

  const handleEditCustomer = (customerId, numericId) => {
    navigate(`/app/edit-customer/${numericId}`);
  };

  const handleDeleteCustomer = (customer) => {
    setCustomerToDelete(customer);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (customerToDelete) {
      fetcher.submit(
        {
          actionType: "deleteCustomer",
          customerId: customerToDelete.id,
          shopifyCustomerId: customerToDelete.shopifyCustomerId,
        },
        { method: "POST" },
      );
      setDeleteConfirmOpen(false);
      setCustomerToDelete(null);
    }
  };

  const rows = (currentCustomers || []).map((customer, index) => (
    <IndexTable.Row id={customer.id} key={customer.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {`${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "No name"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{customer.email || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>{customer.numericId || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>{customer.state || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={customer.syncStatus === "SYNCED" ? "success" : "warning"}>
          {customer.syncStatus === "SYNCED" ? "Synced" : "Not Synced"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {customerLocations[customer.id] || 0}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            icon={EyeIcon}
            variant="plain"
            size="slim"
            onClick={() => handleViewCustomer(customer.id, customer.numericId)}
            accessibilityLabel="View customer"
          />
          <Button
            icon={EditIcon}
            variant="plain"
            size="slim"
            onClick={() => handleEditCustomer(customer.id, customer.numericId)}
            accessibilityLabel="Edit customer"
          />
          <Button
            icon={DeleteIcon}
            variant="plain"
            size="slim"
            onClick={() => handleDeleteCustomer(customer)}
            accessibilityLabel="Delete customer"
            tone="critical"
          />
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <>
      <Page
        title="Sync Customers"
        subtitle="Sync Shopify customers to database for collection-level assignment"
        backAction={{
          onAction: () => navigate("/app/collections"),
        }}
        primaryAction={{
          content: isLoading ? "Syncing..." : "Sync All Customers",
          onAction: handleSyncAll,
          loading: isLoading,
          disabled: isLoading,
        }}
        secondaryActions={[
          {
            content: "Create Customer",
            onAction: () => setIsCreateModalOpen(true),
            disabled: isLoading,
          },
        ]}
      >
        <BlockStack gap="500">
          {fetcher.data?.error && (
            <Banner tone="critical">
              <Text as="p">{fetcher.data.error}</Text>
            </Banner>
          )}

          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Customer Sync Stats
              </Text>
              <InlineStack gap="400">
                <Text as="p">Total Synced: {currentStats.totalSyncedCustomers}</Text>
                <Text as="p">Active: {currentStats.activeCustomers}</Text>
                <Text as="p">Visible in Shopify: {currentCustomers.length}</Text>
                <Text as="p">Mapped as Synced: {syncedCount}</Text>
              </InlineStack>
            </InlineStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Customer List
              </Text>

              <IndexTable
                resourceName={{ singular: "customer", plural: "customers" }}
                itemCount={currentCustomers.length}
                selectable={false}
                headings={[
                  { title: "Name" },
                  { title: "Email" },
                  { title: "Shopify ID" },
                  { title: "State" },
                  { title: "Sync Status" },
                  { title: "Locations" },
                  { title: "Actions" },
                ]}
              >
                {rows}
              </IndexTable>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Customer"
        primaryAction={{
          content: "Confirm and Create",
          onAction: handleCreateCustomerConfirm,
          loading: isLoading,
          disabled: isLoading || !email,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsCreateModalOpen(false),
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

      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Customer"
        primaryAction={{
          content: "Delete",
          onAction: handleConfirmDelete,
          tone: "critical",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteConfirmOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">
              <Text as="p">
                Are you sure you want to delete customer <strong>{customerToDelete?.firstName} {customerToDelete?.lastName}</strong>? This action cannot be undone.
              </Text>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
