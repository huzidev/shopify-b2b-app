import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createCompany, getCompanies } from "../models/company.server";
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
  Page,
  Text,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ViewIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import CustomerCreateModal from "../components/CustomerCreateModal";
import CustomerDeleteModal from "../components/CustomerDeleteModal";
import CompanyCreateModal from "../components/CompanyCreateModal";

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
    if (actionType === "createCompany") {
      const name = (formData.get("name") || "").toString().trim();
      const locationName = (formData.get("locationName") || "").toString().trim();
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const email = (formData.get("email") || "").toString().trim();

      if (!name) {
        return { success: false, error: "Company name is required" };
      }

      const result = await createCompany({
        admin,
        shop: session.shop,
        name,
        locationName,
        firstName,
        lastName,
        email,
      });

      if (!result?.success) {
        return result;
      }

      const updatedCompanies = await getCompanies(session.shop);

      return {
        success: true,
        view: "companies",
        message: "Company created successfully",
        updatedCompanies,
      };
    }

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
  const [currentCompanies, setCurrentCompanies] = useState(companies || []);
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

  const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLocationName, setCompanyLocationName] = useState("");
  const [companyFirstName, setCompanyFirstName] = useState("");
  const [companyLastName, setCompanyLastName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

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

      if (fetcher.data.updatedCompanies) {
        setCurrentCompanies(fetcher.data.updatedCompanies);
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

      if (isCreateCompanyModalOpen) {
        setIsCreateCompanyModalOpen(false);
        setCompanyName("");
        setCompanyLocationName("");
        setCompanyFirstName("");
        setCompanyLastName("");
        setCompanyEmail("");
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, isCreateCompanyModalOpen, isCreateModalOpen, shopify]);

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

  const handleCreateCompanyConfirm = () => {
    fetcher.submit(
      {
        actionType: "createCompany",
        name: companyName,
        locationName: companyLocationName,
        firstName: companyFirstName,
        lastName: companyLastName,
        email: companyEmail,
      },
      { method: "POST" },
    );
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
            onAction: () => setIsCreateCompanyModalOpen(true),
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

      <CustomerCreateModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleCreateCustomerConfirm}
        isLoading={isLoading}
        firstName={firstName}
        setFirstName={setFirstName}
        lastName={lastName}
        setLastName={setLastName}
        email={email}
        setEmail={setEmail}
        phone={phone}
        setPhone={setPhone}
      />

      <CustomerDeleteModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        customer={customerToDelete}
      />

      <CompanyCreateModal
        open={isCreateCompanyModalOpen}
        onClose={() => setIsCreateCompanyModalOpen(false)}
        onConfirm={handleCreateCompanyConfirm}
        isLoading={isLoading}
        name={companyName}
        setName={setCompanyName}
        locationName={companyLocationName}
        setLocationName={setCompanyLocationName}
        firstName={companyFirstName}
        setFirstName={setCompanyFirstName}
        lastName={companyLastName}
        setLastName={setCompanyLastName}
        email={companyEmail}
        setEmail={setCompanyEmail}
      />
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
