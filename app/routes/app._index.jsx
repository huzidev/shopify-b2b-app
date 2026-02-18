import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Button, Text, BlockStack } from "@shopify/polaris";
  
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page
      title="B2B Orders Management"
      subtitle="Manage your B2B orders, products, and companies"
    >
      <Layout>
        <Layout.Section>
          <BlockStack vertical spacing="loose">
            {/* Product Management Card */}
            <Card sectioned>
              <BlockStack vertical spacing="tight">
                <Text size="small" fontWeight="semibold">
                  Product Management
                </Text>
                <Text subdued>
                  Sync and manage your Shopify products for B2B ordering.
                </Text>
                <div style={{ textAlign: "right" }}>
                  <Link to="/app/product-sync">
                    <Button primary>Sync Products</Button>
                  </Link>
                </div>
              </BlockStack>
            </Card>

            {/* Company Management Card */}
            <Card sectioned>
              <BlockStack vertical spacing="tight">
                <Text size="small" fontWeight="semibold">
                  Company Management
                </Text>
                <Text subdued>
                  Create and manage B2B companies and their ordering capabilities.
                </Text>
                <div style={{ textAlign: "right" }}>
                  <Link to="/app/create-company">
                    <Button>Create Company</Button>
                  </Link>
                </div>
              </BlockStack>
            </Card>

            {/* Catalog Management Card */}
            <Card sectioned>
              <BlockStack vertical spacing="tight">
                <Text size="small" fontWeight="semibold">
                  Catalog  Management
                </Text>
                <Text subdued>
                  Create and manage B2B catalogs for your companies.
                </Text>
                <div style={{ textAlign: "right" }}>
                  <Link to="/app/create-catalog">
                    <Button>Create Catalog</Button>
                  </Link>
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
