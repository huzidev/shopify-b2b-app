import {
  BlockStack,
  Card,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Text,
} from "@shopify/polaris";

export function UsageCard({ currentSubscription, usageData, isLoading = false, showOverallUsage = false }) {
  const getCurrentMonth = () => {
    const now = new Date();
    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  console.log("SW currentSubscription?.maxCatalogs", currentSubscription?.maxCatalogs);
  console.log("SW currentSubscription?.maxCompanies", currentSubscription?.maxCompanies);

  // Get limits from current subscription or default values
  // Use stable subscription data when loading to prevent UI updates during subscription process
  const catalogLimit = currentSubscription?.maxCatalogs || 1;
  const companyLimit = currentSubscription?.maxCompanies || 5; 
  const orderLimit = currentSubscription?.maxOrders || 50;

  const metrics = [
    {
      label: "Active Catalogs",
      current: usageData?.totalCatalogs || 0,
      limit: catalogLimit,
      unit: "catalogs",
    },
    {
      label: "Companies",
      current: usageData?.totalCompanies || 0,
      limit: companyLimit,
      unit: "companies",
    },
    {
      label: "Monthly Orders",
      current: usageData?.thisMonthOrders || 0,
      limit: orderLimit,
      unit: "orders",
    },
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            {showOverallUsage ? "Overall Usage" : "Usage This Month"}
          </Text>
          <Text as="span" variant="bodyMd" tone="subdued">
            {getCurrentMonth()}
          </Text>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="600">
          {metrics.map((metric) => {
            const isUnlimited = metric.limit === -1 || metric.limit === 999999 || metric.limit === 999;
            const percentage = isUnlimited 
              ? 0 // Unlimited plans
              : Math.min((metric.current / metric.limit) * 100, 100);
            const isNearLimit = percentage >= 80 && !isUnlimited;

            return (
              <BlockStack key={metric.label} gap="200">
                <Text as="p" variant="bodyMd">
                  {metric.label}
                </Text>
                <Text
                  as="span"
                  variant="bodySm"
                  tone={isNearLimit ? "caution" : "subdued"}
                >
                  {metric.current.toLocaleString()} / {
                    isUnlimited
                      ? "∞" 
                      : metric.limit.toLocaleString()
                  }{" "}
                  {metric.unit}
                </Text>
                <ProgressBar
                  progress={percentage}
                  tone={isNearLimit ? "critical" : "primary"}
                  size="small"
                />
              </BlockStack>
            );
          })}
        </InlineGrid>
      </BlockStack>
    </Card>
  );
}