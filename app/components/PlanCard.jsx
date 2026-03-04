import {
  Badge,
  BlockStack,
  Button,
  Card,
  Icon,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";

export function PlanCard({ 
  plan, 
  isCurrent, 
  loadingPlan, 
  onSubscribe, 
  getPlanRelation 
}) {
  const planRelation = getPlanRelation(plan.planId);

  const getButtonText = () => {
    // If this is the current plan, always show "Current Plan"
    if (isCurrent) {
      return "Current Plan";
    }
    
    switch (planRelation) {
      case 'upgrade':
        return `Upgrade to ${plan.name}`;
      case 'downgrade':
        return `Downgrade to ${plan.name}`;
      default:
        if (plan.planId === "free") {
          return "Start Free Plan";
        } else {
          return "Start 5 days free trial";
        }
    }
  };

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
      }}
    >
      {plan.badge && (
        <div
          style={{
            position: "absolute",
            top: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
          }}
        >
          <Badge tone="info">{plan.badge}</Badge>
        </div>
      )}
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingLg">
              {plan.name}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {plan.subtitle}
            </Text>
          </BlockStack>

          <InlineStack align="start" blockAlign="baseline" gap="100">
            {plan.discount && plan.discountedPrice !== undefined && plan.discountedPrice < plan.price ? (
              <InlineStack gap="200" align="start" blockAlign="baseline">
                <Text as="span" variant="heading2xl" tone="success">
                  ${plan.discountedPrice}
                </Text>
                <Text as="span" variant="bodyMd" tone="subdued" style={{ textDecoration: 'line-through' }}>
                  ${plan.originalPrice || plan.price}
                </Text>
                <div style={{ 
                  backgroundColor: '#e6f7ff', 
                  color: '#0066cc', 
                  padding: '2px 8px', 
                  borderRadius: '4px', 
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {plan.discount.type === 'percentage' 
                    ? `-${plan.discount.value}%` 
                    : `-$${plan.discount.value}`
                  }
                </div>
              </InlineStack>
            ) : (
              <Text as="span" variant="heading2xl">
                ${plan.price}
              </Text>
            )}
            <Text as="span" variant="bodyLg" tone="subdued">
              /{plan.period}
            </Text>
          </InlineStack>

          <Button
            variant={plan.highlighted ? "primary" : "secondary"}
            size="large"
            fullWidth
            disabled={isCurrent || loadingPlan !== null}
            loading={loadingPlan === plan.planId}
            onClick={() => onSubscribe(plan.planId)}
          >
            {getButtonText()}
          </Button>

          <BlockStack gap="300">
            {plan.features.map((feature, index) => (
              <InlineStack key={index} gap="300" blockAlign="start">
                <div style={{ paddingTop: "2px" }}>
                  <Icon source={CheckIcon} tone="success" />
                </div>
                <Text as="span" variant="bodyMd">
                  {feature}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    </div>
  );
}