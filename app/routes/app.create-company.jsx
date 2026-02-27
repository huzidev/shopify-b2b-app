import { useFetcher, useActionData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createCompany } from "../models/company.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const name = formData.get("name");
  const locationName = formData.get("locationName");
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");
  const email = formData.get("email");

  try {
    const result = await createCompany({
      admin,
      shop: session.shop,
      name,
      locationName,
      firstName,
      lastName,
      email,
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function AppCreateCompany() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading = fetcher.state === "submitting";

  const [name, setName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Company created successfully!");
      setName("");
      setLocationName("");
      setFirstName("");
      setLastName("");
      setEmail("");
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSubmit = () => {
    fetcher.submit(
      { name, locationName, firstName, lastName, email },
      { method: "POST" }
    );
  };

  return (
    <Page
      title="Create Company"
      subtitle="Create and manage B2B companies"
      backAction={{
        onAction: () => navigate("/app/manage-companies"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="4">
            {fetcher.data?.error && (
              <Banner status="critical">
                <Text as="p">{fetcher.data.error}</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="4">
                <Text variant="headingMd" as="h2">
                  Company Details
                </Text>

                <TextField
                  label="Company Name"
                  value={name}
                  onChange={setName}
                />
                <TextField
                  label="Location Name"
                  value={locationName}
                  onChange={setLocationName}
                />
                <TextField
                  label="Contact First Name"
                  value={firstName}
                  onChange={setFirstName}
                />
                <TextField
                  label="Contact Last Name"
                  value={lastName}
                  onChange={setLastName}
                />
                <TextField
                  label="Contact Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                />

                <div style={{ textAlign: "right" }}>
                  <Button
                    primary
                    loading={isLoading}
                    disabled={!name || isLoading}
                    onClick={handleSubmit}
                  >
                    {isLoading ? "Creating..." : "Create Company"}
                  </Button>
                </div>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
