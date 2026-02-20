import React from "react";
import {
  Banner,
  BlockStack,
  useCustomer,
  useAppMetafields,
  usePurchasingCompany,
  useCheckoutSettings,
} from "@shopify/ui-extensions-react/checkout";

export function App() {

  const metafields = useAppMetafields();
  const isHighValueClient = metafields.some(entry =>
    entry.target.type === 'company' &&
    entry.metafield.key === 'high_value' &&
    entry.metafield.value === 'true'
  );

  const customer = useCustomer();
  const checkoutSettings = useCheckoutSettings();
  const purchasingCompany = usePurchasingCompany();

  // If there isn't a purchasing company, then Shopify handles a D2C buyer checkout.
  // In this case, you don't want to render anything.
  if(!purchasingCompany) {
    return null;
  }

  if(checkoutSettings.orderSubmission === 'ORDER') {
   return null;
  }

  if(checkoutSettings.orderSubmission === 'DRAFT_ORDER') {
    const message = isHighValueClient ?
      `${customer.firstName}, even during the holidays we will serve ${purchasingCompany.company.name} promptly, expect the usual turnaround time of 2-3 business days.` :
      `Sorry ${customer.firstName}, there will be delays in draft order reviews during this holiday season. Expect a turnaround time of 5-10 business days.`
    const status = isHighValueClient ? 'info' : 'warning';

    return (
      <Banner status={status} title="Holiday impacts on draft orders">{message}</Banner>
    );
  }

  return null;
}