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
  Checkbox,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const [stats, customersWithStatus] = await Promise.all([
    getCustomerStats(session.shop),
    getCustomersWithSyncStatus(admin, session.shop),
  ]);

  return {
    stats,
    customersWithStatus,
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
      const acceptsMarketing = formData.get("acceptsMarketing") === "true";

      if (!email) {
        return { success: false, error: "Email is required" };
      }

      const createResult = await createCustomerInShopify(admin, session.shop, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email,
        phone: phone || undefined,
        acceptsMarketing,
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
  const [acceptsMarketing, setAcceptsMarketing] = useState(true);

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
        setAcceptsMarketing(true);
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
        acceptsMarketing: acceptsMarketing ? "true" : "false",
      },
      { method: "POST" },
    );
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
            <Checkbox
              label="Accepts marketing"
              checked={acceptsMarketing}
              onChange={setAcceptsMarketing}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
