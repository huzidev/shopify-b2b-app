import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompanies } from "../models/company.server";
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
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ViewIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const companies = await getCompanies(session.shop);

  return {
    companies,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "loadCustomers") {
      const [updatedStats, updatedCustomersWithStatus] = await Promise.all([
        getCustomerStats(session.shop),
        getCustomersWithSyncStatus(admin, session.shop),
      ]);

      return {
        success: true,
        view: "customers",
        message: "Customers loaded successfully",
        updatedStats,
        updatedCustomersWithStatus,
      };
    }

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
        view: "customers",
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
        view: "customers",
        message: "Customer deleted successfully",
        updatedStats,
        updatedCustomersWithStatus,
      };
    }

    if (actionType === "syncCustomers") {
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
        view: "customers",
        syncedCount: syncResult.syncedCount,
        message: `Synced ${syncResult.syncedCount} customers from Shopify`,
        updatedStats,
        updatedCustomersWithStatus,
      };
    }

    return { success: false, error: "Unknown action" };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export default function Accounts() {
  const { companies } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [activeView, setActiveView] = useState("companies");
  const [currentCompanies] = useState(companies || []);
  const [currentStats, setCurrentStats] = useState({
    totalSyncedCustomers: 0,
    activeCustomers: 0,
  });
  const [currentCustomers, setCurrentCustomers] = useState([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Operation completed successfully");

      if (fetcher.data.view) {
        setActiveView(fetcher.data.view);
      }

      if (fetcher.data.updatedStats) {
        setCurrentStats(fetcher.data.updatedStats);
      }

      if (fetcher.data.updatedCustomersWithStatus) {
        setCurrentCustomers(fetcher.data.updatedCustomersWithStatus);
        setCustomersLoaded(true);
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

  const handleShowCustomers = () => {
    if (customersLoaded) {
      setActiveView("customers");
      return;
    }

    fetcher.submit({ actionType: "loadCustomers" }, { method: "POST" });
  };

  const handleShowCompanies = () => {
    setActiveView("companies");
  };

  const handleSyncAllCustomers = () => {
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

  const handleDeleteCustomer = (customer) => {
    setCustomerToDelete(customer);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!customerToDelete) {
      return;
    }

    fetcher.submit(
      {
        actionType: "deleteCustomer",
        shopifyCustomerId: customerToDelete.id,
      },
      { method: "POST" },
    );

    setDeleteConfirmOpen(false);
    setCustomerToDelete(null);
  };

  const companyRows = (currentCompanies || []).map((company, index) => (
    <IndexTable.Row id={String(company.id)} key={company.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {company.name || "No company name"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{company.shopifyId || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>{company.locations?.length || 0}</IndexTable.Cell>
      <IndexTable.Cell>{company._count?.catalogs || 0}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={company.status === "Active" ? "success" : "warning"}>
          {company.status || "Active"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          variant="plain"
          size="slim"
          onClick={() => navigate(`/app/company/${company.id}`)}
          accessibilityLabel="View company"
        >
          View
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const customerRows = (currentCustomers || []).map((customer, index) => (
    <IndexTable.Row id={customer.id} key={customer.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {`${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "No name"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{customer.email || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>{customer.numericId || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={customer.syncStatus === "SYNCED" ? "success" : "warning"}>
          {customer.syncStatus === "SYNCED" ? "Synced" : "Not Synced"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            icon={ViewIcon}
            variant="plain"
            size="slim"
            onClick={() => navigate(`/app/customer/${customer.numericId}`)}
            accessibilityLabel="View customer"
          />
          <Button
            icon={EditIcon}
            variant="plain"
            size="slim"
            onClick={() => navigate(`/app/edit-customer/${customer.numericId}`)}
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

  const pageActions =
    activeView === "companies"
      ? {
          primaryAction: {
            content: "Create Company",
            onAction: () => navigate("/app/create-company"),
          },
          secondaryActions: [
            {
              content: "View Customers",
              onAction: handleShowCustomers,
              loading: isLoading,
              disabled: isLoading,
            },
          ],
        }
      : {
          primaryAction: {
            content: isLoading ? "Syncing..." : "Sync Customers",
            onAction: handleSyncAllCustomers,
            loading: isLoading,
            disabled: isLoading,
          },
          secondaryActions: [
            {
              content: "View Companies",
              onAction: handleShowCompanies,
              disabled: isLoading,
            },
            {
              content: "Create Customer",
              onAction: () => setIsCreateModalOpen(true),
              disabled: isLoading,
            },
          ],
        };

  return (
    <>
      <Page
        title="Accounts"
        subtitle="Manage companies and customers from a single workspace"
        backAction={{
          onAction: () => navigate("/app"),
        }}
        primaryAction={pageActions.primaryAction}
        secondaryActions={pageActions.secondaryActions}
      >
        <BlockStack gap="500">
          {fetcher.data?.error && (
            <Banner tone="critical">
              <Text as="p">{fetcher.data.error}</Text>
            </Banner>
          )}

          {activeView === "customers" && (
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
          )}

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {activeView === "companies" ? "Company List" : "Customer List"}
              </Text>

              <IndexTable
                resourceName={{
                  singular: activeView === "companies" ? "company" : "customer",
                  plural: activeView === "companies" ? "companies" : "customers",
                }}
                itemCount={activeView === "companies" ? currentCompanies.length : currentCustomers.length}
                selectable={false}
                headings={
                  activeView === "companies"
                    ? [
                        { title: "Name" },
                        { title: "Company ID" },
                        { title: "Locations" },
                        { title: "Catalogs" },
                        { title: "Status" },
                        { title: "Actions" },
                      ]
                    : [
                        { title: "Name" },
                        { title: "Email" },
                        { title: "Shopify ID" },
                        { title: "Sync Status" },
                        { title: "Actions" },
                      ]
                }
              >
                {activeView === "companies" ? companyRows : customerRows}
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
