import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompanies } from "../models/company.server";
import { getPriceLists } from "../models/priceList.server";
import { getPublications } from "../models/publicationList.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Select,
  TextField,
  Button,
  Banner,
  InlineStack,
  ProgressBar,
  Badge
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Fetch companies, price lists, and publications for this shop
  const companies = await getCompanies(session.shop);
  const priceLists = await getPriceLists(session.shop);
  const publications = await getPublications(session.shop);
  return { 
    companies,
    priceLists,
    publications
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const companyId = formData.get("companyId");
  const locationId = formData.get("locationId");
  const priceListId = formData.get("priceListId");
  const publicationId = formData.get("publicationId");
  const title = formData.get("title");

  try {
    const result = await import("../models/catalog.server").then(m =>
      m.createCatalog({
        admin,
        shop: session.shop,
        companyId,
        locationId,
        priceListId,
        publicationId,
        title
      })
    );

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function AppCreateCatalog() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { companies, priceLists, publications } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [selectedPublicationId, setSelectedPublicationId] = useState("");
  const [title, setTitle] = useState("");

  // dynamic locations for selected company
  const [locations, setLocations] = useState([]);

  const steps = [
    { id: 1, label: "Select Company", completed: !!selectedCompanyId && !!selectedLocationId },
    { id: 2, label: "Select Price List", completed: !!selectedPriceListId },
    { id: 3, label: "Select Publication", completed: !!selectedPublicationId },
    { id: 4, label: "Catalog Details", completed: !!title }
  ];

  const currentStepData = steps.find(step => step.id === currentStep);
  const completedSteps = steps.filter(step => step.completed).length;

  // Update locations when company changes
  useEffect(() => {
    const company = companies?.find(c => c.id === parseInt(selectedCompanyId));
    if (company) {
      if (company.locations && company.locations.length > 0) {
        // Use actual locations if they exist
        setLocations(company.locations);
        setSelectedLocationId(company.locations[0].shopifyId);
      } else if (company.locationShopifyId) {
        // Fallback to company's primary location
        const primaryLocation = {
          shopifyId: company.locationShopifyId,
          name: `${company.name} - Primary Location`
        };
        setLocations([primaryLocation]);
        setSelectedLocationId(company.locationShopifyId);
      } else {
        setLocations([]);
        setSelectedLocationId("");
      }
      // Set default title
      if (!title) {
        setTitle(`Catalog for ${company.name}`);
      }
    } else {
      setLocations([]);
      setSelectedLocationId("");
    }
  }, [selectedCompanyId, companies, title]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Catalog created successfully!");
      // Reset form
      setCurrentStep(1);
      setSelectedCompanyId("");
      setSelectedLocationId("");
      setSelectedPriceListId("");
      setSelectedPublicationId("");
      setTitle("");
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    fetcher.submit(
      { 
        companyId: selectedCompanyId, 
        locationId: selectedLocationId, 
        priceListId: selectedPriceListId,
        publicationId: selectedPublicationId,
        title 
      },
      { method: "POST" }
    );
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return selectedCompanyId && selectedLocationId;
      case 2:
        return selectedPriceListId;
      case 3:
        return selectedPublicationId;
      case 4:
        return title;
      default:
        return false;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <BlockStack gap="4">
            <Text variant="headingMd" as="h3">
              Step 1: Select Company & Location
            </Text>
            
            <Select
              label="Select Company"
              options={[
                { label: "Choose a company...", value: "", disabled: true },
                ...(companies?.map(c => ({
                  label: c.name,
                  value: c.id.toString()
                })) || [])
              ]}
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
            />

            {locations.length > 0 && (
              <Select
                label="Select Company Location"
                options={locations.map(l => ({
                  label: l.name,
                  value: l.shopifyId
                }))}
                value={selectedLocationId}
                onChange={setSelectedLocationId}
              />
            )}
          </BlockStack>
        );

      case 2:
        return (
          <BlockStack gap="4">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h3">
                Step 2: Select Price List
              </Text>
              <Button url="/app/price-list" external>
                Manage Price Lists
              </Button>
            </InlineStack>
            
            {priceLists?.length === 0 ? (
              <Banner status="warning">
                <Text as="p">
                  No price lists found. <Button url="/app/price-list" external plain>Create a price list</Button> first.
                </Text>
              </Banner>
            ) : (
              <Select
                label="Select Price List"
                options={[
                  { label: "Choose a price list...", value: "", disabled: true },
                  ...(priceLists?.map(pl => ({
                    label: `${pl.name} (${pl.currency}) - ${pl.adjustmentType?.replace('_', ' ')} ${pl.adjustmentValue}%`,
                    value: pl.id.toString()
                  })) || [])
                ]}
                value={selectedPriceListId}
                onChange={setSelectedPriceListId}
              />
            )}
          </BlockStack>
        );

      case 3:
        return (
          <BlockStack gap="4">
            <Text variant="headingMd" as="h3">
              Step 3: Select Publication
            </Text>
            
            <Text variant="bodyMd" as="p">
              Choose a publication to control which products are available in this catalog.
            </Text>

            {publications?.length === 0 ? (
              <Banner status="warning">
                <Text as="p">
                  No publications found. You may need to create a publication first.
                </Text>
              </Banner>
            ) : (
              <Select
                label="Publication"
                options={[
                  { label: "Select a publication...", value: "", disabled: true },
                  ...(publications?.map(pub => ({
                    label: pub.title || "Untitled Publication",
                    value: pub.id.toString()
                  })) || [])
                ]}
                value={selectedPublicationId}
                onChange={setSelectedPublicationId}
              />
            )}

            {selectedPublicationId && (
              <Card sectioned>
                <BlockStack gap="2">
                  <Text variant="headingSm" as="h4">Selected Publication</Text>
                  {(() => {
                    const selectedPub = publications?.find(p => p.id === parseInt(selectedPublicationId));
                    return (
                      <BlockStack gap="1">
                        <Text><strong>Title:</strong> {selectedPub?.title || "Untitled Publication"}</Text>
                        <Text><strong>Default State:</strong> {selectedPub?.defaultState}</Text>
                        <Text><strong>Auto Publish:</strong> {selectedPub?.autoPublish ? "Yes" : "No"}</Text>
                        {selectedPub?.catalog && (
                          <Text><strong>Catalog:</strong> {selectedPub.catalog.title}</Text>
                        )}
                      </BlockStack>
                    );
                  })()}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        );

      case 4:
        const selectedCompany = companies?.find(c => c.id === parseInt(selectedCompanyId));
        const selectedPriceList = priceLists?.find(pl => pl.id === parseInt(selectedPriceListId));
        const selectedPublication = publications?.find(p => p.id === parseInt(selectedPublicationId));
        
        return (
          <BlockStack gap="4">
            <Text variant="headingMd" as="h3">
              Step 4: Catalog Details
            </Text>
            
            <Card sectioned>
              <BlockStack gap="3">
                <Text variant="headingSm" as="h4">Summary</Text>
                <Text><strong>Company:</strong> {selectedCompany?.name}</Text>
                <Text><strong>Location:</strong> {locations.find(l => l.shopifyId === selectedLocationId)?.name}</Text>
                <Text><strong>Price List:</strong> {selectedPriceList?.name} ({selectedPriceList?.currency})</Text>
                <Text><strong>Publication:</strong> {selectedPublication?.title || "Untitled Publication"}</Text>
              </BlockStack>
            </Card>

            <TextField
              label="Catalog Title"
              value={title}
              onChange={setTitle}
              autoComplete="off"
            />
          </BlockStack>
        );

      default:
        return null;
    }
  };

  return (
    <Page
      title="Create Catalog"
      subtitle="Create and manage B2B catalogs"
      backAction={{
        content: "Back to Dashboard",
        url: "/app"
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="6">
            {fetcher.data?.error && (
              <Banner status="critical">
                <Text as="p">{fetcher.data.error}</Text>
              </Banner>
            )}

            {/* Progress Indicator */}
            <Card sectioned>
              <BlockStack gap="4">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h2">
                    Progress: Step {currentStep} of 4
                  </Text>
                  <Text variant="bodySm">
                    {completedSteps} of 4 steps completed
                  </Text>
                </InlineStack>
                <ProgressBar progress={(completedSteps / 3) * 100} />
                <InlineStack gap="4">
                  {steps.map((step) => (
                    <Badge 
                      key={step.id} 
                      status={step.completed ? "success" : currentStep === step.id ? "info" : "default"}
                    >
                      {step.label}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Step Content */}
            <Card sectioned>
              {renderStepContent()}
            </Card>

            {/* Navigation */}
            <Card sectioned>
              <InlineStack align="space-between">
                <Button 
                  onClick={handlePrevious} 
                  disabled={currentStep === 1}
                >
                  Previous
                </Button>
                
                <InlineStack gap="2">
                  {currentStep < 4 ? (
                    <Button 
                      primary 
                      onClick={handleNext}
                      disabled={!canProceedToNext()}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      primary
                      loading={isLoading}
                      disabled={!canProceedToNext() || isLoading}
                      onClick={handleSubmit}
                    >
                      {isLoading ? "Creating Catalog..." : "Create Catalog"}
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
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
