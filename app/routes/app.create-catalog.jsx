import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCompanies } from "../models/company.server";
import { createPriceList, getPriceListByTitle } from "../models/priceList.server";
import { createPublication, updatePublication, getPublicationByTitle } from "../models/publicationList.server";
import { getCatalogByTitle } from "../models/catalog.server";
import { PriceListForm } from "../components/PriceListForm";
import { PublicationForm } from "../components/PublicationForm";
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
  Box,
  ProgressBar,
  Badge
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Fetch companies for the form
  const companies = await getCompanies(session.shop);
  return { 
    companies
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  try {
    if (actionType === "createCatalog") {
      const companyId = formData.get("companyId");
      const locationId = formData.get("locationId");
      const title = formData.get("title");
      
      // Parse price list data
      const priceListData = JSON.parse(formData.get("priceListData"));
      
      // Parse publication data  
      const publicationData = JSON.parse(formData.get("publicationData"));
      const selectedProducts = JSON.parse(formData.get("selectedProducts") || "[]");

      // STEP 0: Validate all titles for duplicates BEFORE making any mutations
      const [existingPriceList, existingPublication, existingCatalog] = await Promise.all([
        getPriceListByTitle(session.shop, priceListData.name),
        getPublicationByTitle(session.shop, publicationData.title),
        getCatalogByTitle(session.shop, title)
      ]);

      // Check for duplicate price list name
      if (existingPriceList) {
        return {
          success: false,
          error: `Price list name "${priceListData.name}" already exists. Please choose a different name.`,
          step: "priceList"
        };
      }

      // Check for duplicate publication title
      if (existingPublication) {
        return {
          success: false,
          error: `Publication title "${publicationData.title}" already exists. Please choose a different title.`,
          step: "publication"
        };
      }

      // Check for duplicate catalog title
      if (existingCatalog) {
        return {
          success: false,
          error: `Catalog title "${title}" already exists. Please choose a different title.`,
          step: "catalog"
        };
      }

      // All titles are unique, proceed with mutations
      
      // Step 1: Create the price list
      const priceListResult = await createPriceList({
        admin,
        shop: session.shop,
        name: priceListData.name,
        currency: priceListData.currency,
        adjustmentType: priceListData.adjustmentType,
        adjustmentValue: parseFloat(priceListData.adjustmentValue)
      });

      if (!priceListResult.success) {
        return { 
          success: false, 
          error: `Failed to create price list: ${priceListResult.error}`,
          step: "priceList"
        };
      }

      // Step 2: Create the publication (without catalog initially)
      const publicationResult = await createPublication({
        admin,
        shop: session.shop,
        catalogId: null, // Will be updated after catalog creation
        title: publicationData.title,
        defaultState: publicationData.defaultState,
        autoPublish: false
      });

      if (!publicationResult.success) {
        return { 
          success: false, 
          error: `Failed to create publication: ${publicationResult.error}`,
          step: "publication"
        };
      }

      // Step 2.5: If manual product selection, add products to publication
      if (publicationData.defaultState === "EMPTY" && selectedProducts.length > 0) {
        const productIds = selectedProducts.map(product => product.id);
        
        const updateResult = await updatePublication({
          admin,
          shop: session.shop,
          publicationId: publicationResult.publication.id,
          publishablesToAdd: productIds,
          publishablesToRemove: []
        });

        if (!updateResult.success) {
          console.warn(`Failed to add products to publication: ${updateResult.error}`);
          // Don't fail the entire process, just log the warning
        }
      }

      // Step 3: Create the catalog with the new price list and publication
      const result = await import("../models/catalog.server").then(m =>
        m.createCatalog({
          admin,
          shop: session.shop,
          companyId,
          locationId,
          priceListId: priceListResult.priceList.id.toString(),
          publicationId: publicationResult.publication.id.toString(),
          title
        })
      );

      if (!result.success) {
        return { 
          success: false, 
          error: `Failed to create catalog: ${result.error}`,
          step: "catalog"
        };
      }

      // Step 4: Update the publication to link it with the created catalog
      const prismaClient = await import("../db.server").then(m => m.default);
      try {
        await prismaClient.publication.update({
          where: { id: publicationResult.publication.id },
          data: { catalogId: result.catalog.id }
        });
      } catch (linkError) {
        console.warn(`Failed to link publication to catalog: ${linkError.message}`);
        // Don't fail the process as catalog is already created successfully
      }

      return { 
        success: true, 
        catalog: result.catalog,
        priceList: priceListResult.priceList,
        publication: publicationResult.publication
      };
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function AppCreateCatalog() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { companies } = useLoaderData();
  const isLoading = fetcher.state === "submitting";

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [title, setTitle] = useState("");
  const navigate = useNavigate();

  // Price List Form State
  const [priceListData, setPriceListData] = useState({
    name: "",
    currency: "USD",
    adjustmentType: "PERCENTAGE_INCREASE",
    adjustmentValue: "0"
  });

  // Publication Form State
  const [publicationData, setPublicationData] = useState({
    title: "",
    defaultState: "ALL_PRODUCTS"
  });

  const [selectedProducts, setSelectedProducts] = useState([]);
  const [errors, setErrors] = useState({});

  // Track which steps user has visited to prevent auto-completion
  const [visitedSteps, setVisitedSteps] = useState(new Set([1]));
  const [hasAutoGeneratedNames, setHasAutoGeneratedNames] = useState(false);

  // dynamic locations for selected company
  const [locations, setLocations] = useState([]);

  const steps = [
    { id: 1, label: "Company & Location", completed: !!selectedCompanyId && !!selectedLocationId },
    { id: 2, label: "Create Price List", completed: visitedSteps.has(2) && !!priceListData.name && !!priceListData.adjustmentValue },
    { id: 3, label: "Create Publication", completed: visitedSteps.has(3) && !!publicationData.title && (publicationData.defaultState === "ALL_PRODUCTS" || selectedProducts.length > 0) },
    { id: 4, label: "Catalog Details", completed: visitedSteps.has(4) && !!title }
  ];

  const currentStepData = steps.find(step => step.id === currentStep);
  const completedSteps = steps.filter(step => step.completed).length;
  
  // Progress based on current step, not completion status
  // Show 100% when loading (submitting) on final step
  const progressPercentage = isLoading && currentStep === 4 ? 100 : ((currentStep - 1) / 4) * 100;

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
      
      // Auto-set names based on company - only if not manually changed
      if (!hasAutoGeneratedNames) {
        setTitle(`Catalog for ${company.name}`);
        setPriceListData(prev => ({
          ...prev,
          name: `${company.name} Pricing`
        }));
        setPublicationData(prev => ({
          ...prev,
          title: `${company.name} Publication`
        }));
        setHasAutoGeneratedNames(true);
      }
    } else {
      setLocations([]);
      setSelectedLocationId("");
    }
  }, [selectedCompanyId, companies, hasAutoGeneratedNames]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Catalog created successfully!");
      // Reset form
      setCurrentStep(1);
      setSelectedCompanyId("");
      setSelectedLocationId("");
      setPriceListData({
        name: "",
        currency: "USD",
        adjustmentType: "PERCENTAGE_INCREASE",
        adjustmentValue: "0"
      });
      setPublicationData({
        title: "",
        defaultState: "ALL_PRODUCTS"
      });
      setSelectedProducts([]);
      setTitle("");
      setErrors({});
      setVisitedSteps(new Set([1]));
      setHasAutoGeneratedNames(false);
    } else if (fetcher.data?.error) {
      const error = fetcher.data.error;
      const step = fetcher.data.step;
      
      // Set error for specific step
      const newErrors = {};
      if (step === "priceList") {
        newErrors.priceList = error;
        setCurrentStep(2); // Navigate to price list step
      } else if (step === "publication") {
        newErrors.publication = error;
        setCurrentStep(3); // Navigate to publication step
      } else {
        newErrors.general = error;
      }
      setErrors(newErrors);
      
      shopify.toast.show(`Error: ${error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleNext = () => {
    if (currentStep < 4) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setVisitedSteps(prev => new Set([...prev, nextStep]));
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    setErrors({}); // Clear previous errors
    
    fetcher.submit(
      { 
        actionType: "createCatalog",
        companyId: selectedCompanyId, 
        locationId: selectedLocationId, 
        priceListData: JSON.stringify(priceListData),
        publicationData: JSON.stringify(publicationData),
        selectedProducts: JSON.stringify(selectedProducts),
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
        const hasValidPriceList = priceListData.name && 
          priceListData.adjustmentValue !== null && 
          priceListData.adjustmentValue !== "";
        return hasValidPriceList;
      case 3:
        const hasValidPublication = publicationData.title && 
          (publicationData.defaultState === "ALL_PRODUCTS" || selectedProducts.length > 0);
        return hasValidPublication;
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
          <Card sectioned>
            <BlockStack gap="400">
              <Box>
                <Text variant="headingMd" as="h3">
                  Select Company & Location
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Choose the company and location for this catalog. This determines who can access the catalog and where products will be available.
                </Text>
              </Box>
              
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
                requiredIndicator
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
                  requiredIndicator
                />
              )}

              {selectedCompanyId && locations.length === 0 && (
                <Banner status="warning">
                  <Text as="p">
                    This company has no configured locations. Please ensure the company has been set up properly.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        );

      case 2:
        return (
          <PriceListForm 
            formData={priceListData}
            onChange={setPriceListData}
            errors={errors}
            existingPriceLists={[]}
            disabled={isLoading}
          />
        );

      case 3:
        return (
          <PublicationForm 
            formData={publicationData}
            onChange={setPublicationData}
            errors={errors}
            disabled={isLoading}
            selectedProducts={selectedProducts}
            onProductsChange={setSelectedProducts}
          />
        );

      case 4:
        const selectedCompany = companies?.find(c => c.id === parseInt(selectedCompanyId));
        
        return (
          <Card sectioned>
            <BlockStack gap="400">
              <Box>
                <Text variant="headingMd" as="h3">
                  Catalog Details & Review
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Review your settings and provide a name for your catalog.
                </Text>
              </Box>
              
              {errors.general && (
                <Banner status="critical">
                  <Text as="p">{errors.general}</Text>
                </Banner>
              )}

              <Card sectioned subdued>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h4">Summary</Text>
                  <InlineStack wrap={false} gap="400">
                    <Box style={{ flex: 1 }}>
                      <Text variant="bodyMd"><strong>Company:</strong> {selectedCompany?.name}</Text>
                      <Text variant="bodyMd"><strong>Location:</strong> {locations.find(l => l.shopifyId === selectedLocationId)?.name}</Text>
                    </Box>
                    <Box style={{ flex: 1 }}>
                      <Text variant="bodyMd"><strong>Price List:</strong> {priceListData.name}</Text>
                      <Text variant="bodyMd"><strong>Publication:</strong> {publicationData.title}</Text>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>

              <TextField
                label="Catalog Title"
                value={title}
                onChange={setTitle}
                placeholder="e.g. Core Wholesale Catalog, VIP Customer Catalog"
                autoComplete="off"
                requiredIndicator
              />
            </BlockStack>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <Page
      title="Create Catalog"
      subtitle="Create a new B2B catalog with custom pricing and product selection"
      backAction={{
        onAction: () => navigate("/app"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Global error banner */}
            {errors.general && (
              <Banner status="critical">
                <Text as="p">{errors.general}</Text>
              </Banner>
            )}

            {/* Progress Indicator */}
            <Card sectioned>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">
                    Step {currentStep} of 4: {currentStepData?.label}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {completedSteps} of 4 steps completed
                  </Text>
                </InlineStack>
                <ProgressBar progress={progressPercentage} />
                <InlineStack gap="200" wrap>
                  {steps.map((step) => (
                    <Badge 
                      key={step.id} 
                      status={step.completed ? "success" : currentStep === step.id ? "attention" : "default"}
                    >
                      {step.id}. {step.label}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Step Content */}
            {renderStepContent()}

            {/* Navigation */}
            <Card sectioned>
              <InlineStack align="space-between">
                <Button 
                  onClick={handlePrevious} 
                  disabled={currentStep === 1 || isLoading}
                >
                  Previous
                </Button>
                
                <InlineStack gap="200">
                  {currentStep < 4 ? (
                    <Button 
                      variant="primary" 
                      onClick={handleNext}
                      disabled={!canProceedToNext() || isLoading}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
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
