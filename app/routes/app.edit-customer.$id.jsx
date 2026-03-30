import { useEffect, useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  Page,
  Card,
  BlockStack,
  TextField,
  Button,
  Modal,
  IndexTable,
  Text,
  InlineStack,
  Banner,
  Grid,
} from "@shopify/polaris";
import { DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id: customerId } = params;

  // Get shop record
  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  // Get customer using numeric ID
  const customer = await db.customer.findFirst({
    where: {
      shopifyNumericId: customerId,
      shopId: shop.id,
    },
    include: {
      locations: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  return {
    customer,
  };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { id: customerId } = params;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const customer = await db.customer.findFirst({
    where: {
      shopifyNumericId: customerId,
      shopId: shop.id,
    },
  });

  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  try {
    if (actionType === "updateCustomer") {
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const email = (formData.get("email") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();

      // Update in local database
      const updatedCustomer = await db.customer.update({
        where: { id: customer.id },
        data: {
          firstName: firstName || null,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
        },
      });

      // Update in Shopify via metafields
      const customerGid = `gid://shopify/Customer/${customer.shopifyCustomerId}`;
      
      const metafieldResponse = await admin.graphql(
        `#graphql
        mutation updateCustomerMetafields($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer {
              id
              firstName
              lastName
              email
            }
            userErrors {
              message
              field
            }
          }
        }`,
        {
          variables: {
            input: {
              id: customerGid,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              email: email || undefined,
              phone: phone || undefined,
            },
          },
        },
      );

      const json = await metafieldResponse.json();
      const result = json?.data?.customerUpdate;

      if (result?.userErrors?.length > 0) {
        return { success: false, error: result.userErrors[0].message };
      }

      return { 
        success: true, 
        message: "Customer updated successfully",
        customer: updatedCustomer 
      };
    }

    if (actionType === "addLocation") {
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const company = (formData.get("company") || "").toString().trim();
      const address1 = (formData.get("address1") || "").toString().trim();
      const address2 = (formData.get("address2") || "").toString().trim();
      const city = (formData.get("city") || "").toString().trim();
      const province = (formData.get("province") || "").toString().trim();
      const country = (formData.get("country") || "").toString().trim();
      const zip = (formData.get("zip") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();
      const name = (formData.get("name") || "").toString().trim();
      const provinceCode = (formData.get("provinceCode") || "").toString().trim();
      const countryCode = (formData.get("countryCode") || "").toString().trim();
      const countryName = (formData.get("countryName") || "").toString().trim();

      const location = await db.customerLocation.create({
        data: {
          customerId: customer.id,
          firstName: firstName || null,
          lastName: lastName || null,
          company: company || null,
          address1: address1 || null,
          address2: address2 || null,
          city: city || null,
          province: province || null,
          country: country || null,
          zip: zip || null,
          phone: phone || null,
          name: name || null,
          provinceCode: provinceCode || null,
          countryCode: countryCode || null,
          countryName: countryName || null,
        },
      });

      return { 
        success: true, 
        message: "Location added successfully",
        location 
      };
    }

    if (actionType === "updateLocation") {
      const locationId = (formData.get("locationId") || "").toString().trim();
      const firstName = (formData.get("firstName") || "").toString().trim();
      const lastName = (formData.get("lastName") || "").toString().trim();
      const company = (formData.get("company") || "").toString().trim();
      const address1 = (formData.get("address1") || "").toString().trim();
      const address2 = (formData.get("address2") || "").toString().trim();
      const city = (formData.get("city") || "").toString().trim();
      const province = (formData.get("province") || "").toString().trim();
      const country = (formData.get("country") || "").toString().trim();
      const zip = (formData.get("zip") || "").toString().trim();
      const phone = (formData.get("phone") || "").toString().trim();
      const name = (formData.get("name") || "").toString().trim();
      const provinceCode = (formData.get("provinceCode") || "").toString().trim();
      const countryCode = (formData.get("countryCode") || "").toString().trim();
      const countryName = (formData.get("countryName") || "").toString().trim();

      const location = await db.customerLocation.update({
        where: { id: parseInt(locationId) },
        data: {
          firstName: firstName || null,
          lastName: lastName || null,
          company: company || null,
          address1: address1 || null,
          address2: address2 || null,
          city: city || null,
          province: province || null,
          country: country || null,
          zip: zip || null,
          phone: phone || null,
          name: name || null,
          provinceCode: provinceCode || null,
          countryCode: countryCode || null,
          countryName: countryName || null,
        },
      });

      return { 
        success: true, 
        message: "Location updated successfully",
        location 
      };
    }

    if (actionType === "deleteLocation") {
      const locationId = (formData.get("locationId") || "").toString().trim();

      await db.customerLocation.delete({
        where: { id: parseInt(locationId) },
      });

      return { 
        success: true, 
        message: "Location deleted successfully"
      };
    }

    return { success: false, error: "Invalid action type" };
  } catch (error) {
    console.error("Error in action:", error);
    return { success: false, error: error.message };
  }
};

export default function EditCustomer() {
  const { customer } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [firstName, setFirstName] = useState(customer?.firstName || "");
  const [lastName, setLastName] = useState(customer?.lastName || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [locations, setLocations] = useState(customer?.locations || []);

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    country: "",
    zip: "",
    phone: "",
    name: "",
    provinceCode: "",
    countryCode: "",
    countryName: "",
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState(null);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Operation completed successfully");
      
      if (fetcher.data.customer) {
        setFirstName(fetcher.data.customer.firstName || "");
        setLastName(fetcher.data.customer.lastName || "");
        setEmail(fetcher.data.customer.email || "");
        setPhone(fetcher.data.customer.phone || "");
      }

      if (fetcher.data.location) {
        if (editingLocation) {
          setLocations(locations.map(loc => loc.id === fetcher.data.location.id ? fetcher.data.location : loc));
          setEditingLocation(null);
        } else {
          setLocations([...locations, fetcher.data.location]);
        }
        setLocationForm({
          firstName: "",
          lastName: "",
          company: "",
          address1: "",
          address2: "",
          city: "",
          province: "",
          country: "",
          zip: "",
          phone: "",
          name: "",
          provinceCode: "",
          countryCode: "",
          countryName: "",
        });
        setIsLocationModalOpen(false);
      }

      if (fetcher.data.actionType === "deleteLocation") {
        setLocations(locations.filter(loc => loc.id !== locationToDelete?.id));
        setDeleteConfirmOpen(false);
        setLocationToDelete(null);
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  const handleSaveCustomer = () => {
    fetcher.submit(
      {
        actionType: "updateCustomer",
        firstName,
        lastName,
        email,
        phone,
      },
      { method: "POST" },
    );
  };

  const handleOpenLocationModal = (location = null) => {
    if (location) {
      setEditingLocation(location);
      setLocationForm(location);
    } else {
      setEditingLocation(null);
      setLocationForm({
        firstName: "",
        lastName: "",
        company: "",
        address1: "",
        address2: "",
        city: "",
        province: "",
        country: "",
        zip: "",
        phone: "",
        name: "",
        provinceCode: "",
        countryCode: "",
        countryName: "",
      });
    }
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = () => {
    const formData = new FormData();
    if (editingLocation) {
      formData.append("actionType", "updateLocation");
      formData.append("locationId", editingLocation.id);
    } else {
      formData.append("actionType", "addLocation");
    }
    Object.entries(locationForm).forEach(([key, value]) => {
      formData.append(key, value || "");
    });

    fetcher.submit(formData, { method: "POST" });
  };

  const handleDeleteLocation = (location) => {
    setLocationToDelete(location);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteLocation = () => {
    if (locationToDelete) {
      fetcher.submit(
        {
          actionType: "deleteLocation",
          locationId: locationToDelete.id,
        },
        { method: "POST" },
      );
    }
  };

  const locationRows = (locations || []).map((location, index) => (
    <IndexTable.Row id={location.id} key={location.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {location.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {location.address1}
        {location.address2 && <span>, {location.address2}</span>}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {location.city}, {location.province}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            icon={EditIcon}
            variant="plain"
            size="slim"
            onClick={() => handleOpenLocationModal(location)}
          />
          <Button
            icon={DeleteIcon}
            variant="plain"
            size="slim"
            tone="critical"
            onClick={() => handleDeleteLocation(location)}
          />
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title={`Edit ${customer?.firstName} ${customer?.lastName}`}
      backAction={{
        onAction: () => navigate("/app/customer-sync"),
      }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Customer Information
            </Text>
            <Grid columns={{ xs: 1, sm: 2 }}>
              <TextField
                label="First Name"
                value={firstName}
                onChange={setFirstName}
                autoComplete="off"
              />
              <TextField
                label="Last Name"
                value={lastName}
                onChange={setLastName}
                autoComplete="off"
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="off"
              />
              <TextField
                label="Phone"
                value={phone}
                onChange={setPhone}
                autoComplete="off"
              />
            </Grid>
            <InlineStack gap="200">
              <Button variant="primary" onClick={handleSaveCustomer} loading={fetcher.state === "submitting"}>
                Save Changes
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Locations ({locations.length})
              </Text>
              <Button
                variant="primary"
                onClick={() => handleOpenLocationModal()}
              >
                Add Location
              </Button>
            </InlineStack>

            {locations.length > 0 ? (
              <IndexTable
                resourceName={{ singular: "location", plural: "locations" }}
                itemCount={locations.length}
                selectable={false}
                headings={[
                  { title: "Name" },
                  { title: "Address" },
                  { title: "City/Province" },
                  { title: "Actions" },
                ]}
              >
                {locationRows}
              </IndexTable>
            ) : (
              <Banner>
                <Text as="p">No locations added yet. Click "Add Location" to add one.</Text>
              </Banner>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      <Modal
        open={isLocationModalOpen}
        onClose={() => {
          setIsLocationModalOpen(false);
          setEditingLocation(null);
        }}
        title={editingLocation ? "Edit Location" : "Add Location"}
        primaryAction={{
          content: editingLocation ? "Update Location" : "Add Location",
          onAction: handleSaveLocation,
          loading: fetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setIsLocationModalOpen(false);
              setEditingLocation(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Grid columns={{ xs: 1, sm: 2 }}>
              <TextField
                label="Name"
                value={locationForm.name}
                onChange={(value) => setLocationForm({ ...locationForm, name: value })}
              />
              <TextField
                label="Phone"
                value={locationForm.phone}
                onChange={(value) => setLocationForm({ ...locationForm, phone: value })}
              />
              <TextField
                label="First Name"
                value={locationForm.firstName}
                onChange={(value) => setLocationForm({ ...locationForm, firstName: value })}
              />
              <TextField
                label="Last Name"
                value={locationForm.lastName}
                onChange={(value) => setLocationForm({ ...locationForm, lastName: value })}
              />
              <TextField
                label="Company"
                value={locationForm.company}
                onChange={(value) => setLocationForm({ ...locationForm, company: value })}
              />
              <TextField
                label="Address Line 1"
                value={locationForm.address1}
                onChange={(value) => setLocationForm({ ...locationForm, address1: value })}
              />
              <TextField
                label="Address Line 2"
                value={locationForm.address2}
                onChange={(value) => setLocationForm({ ...locationForm, address2: value })}
              />
              <TextField
                label="City"
                value={locationForm.city}
                onChange={(value) => setLocationForm({ ...locationForm, city: value })}
              />
              <TextField
                label="Province"
                value={locationForm.province}
                onChange={(value) => setLocationForm({ ...locationForm, province: value })}
              />
              <TextField
                label="Province Code"
                value={locationForm.provinceCode}
                onChange={(value) => setLocationForm({ ...locationForm, provinceCode: value })}
              />
              <TextField
                label="Country"
                value={locationForm.country}
                onChange={(value) => setLocationForm({ ...locationForm, country: value })}
              />
              <TextField
                label="Country Code"
                value={locationForm.countryCode}
                onChange={(value) => setLocationForm({ ...locationForm, countryCode: value })}
              />
              <TextField
                label="Country Name"
                value={locationForm.countryName}
                onChange={(value) => setLocationForm({ ...locationForm, countryName: value })}
              />
              <TextField
                label="Zip Code"
                value={locationForm.zip}
                onChange={(value) => setLocationForm({ ...locationForm, zip: value })}
              />
            </Grid>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Location"
        primaryAction={{
          content: "Delete",
          onAction: handleConfirmDeleteLocation,
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
                Are you sure you want to delete the location <strong>{locationToDelete?.name}</strong>? This action cannot be undone.
              </Text>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
