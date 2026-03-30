import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createOrder, getCustomerOrderHistory } from "../models/order.server";
import { getCustomerWithCollectionsAndLocations } from "../models/customer.server";

// Handle POST request for order creation
export const action = async ({ request }) => {
  const { liquid, admin } = await authenticate.public.appProxy(request);

  const formData = await request.formData();
  const orderDataRaw = formData.get("orderData");

  if (!orderDataRaw) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Error</h2>
        <p>No order data provided.</p>
      </div>
    `);
  }

  try {
    const orderData = JSON.parse(orderDataRaw);

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    const collectionIds = Array.from(
      new Set(
        (orderData.lineItems || [])
          .map((item) => Number(item.collectionId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );

    const enhancedOrderData = {
      ...orderData,
      customerId,
      companyId: null,
      companyShopifyId: null,
      companyLocationId: null,
      shopId: shopRecord?.id,
      collectionIds,
      billingAddress: orderData.billingAddress,
    };

    console.log("SW what is billingAddress", orderData.billingAddress);

    const result = await createOrder(admin, enhancedOrderData);

    if (result.userErrors && result.userErrors.length > 0) {
      return liquid(`
        <div class="quick-order-error">
          <h2>Order Failed</h2>
          <p>${result.userErrors.map((e) => e.message).join(", ")}</p>
          <a href="javascript:history.back()">Go Back</a>
        </div>
      `);
    }

    const orderTotal = parseFloat(result.order?.totalPriceSet?.shopMoney?.amount || "0");
    const itemCount = (orderData.lineItems || []).reduce((sum, item) => sum + item.quantity, 0);

    return liquid(`
      <div class="quick-order-success">
        <h2>Order Created Successfully</h2>
        <p><strong>Order Number:</strong> ${result.order?.name || "N/A"}</p>
        <p><strong>Items Ordered:</strong> ${itemCount}</p>
        <p><strong>Total Amount:</strong> $${orderTotal.toFixed(2)} ${result.order?.totalPriceSet?.shopMoney?.currencyCode || "USD"}</p>
        <a href="javascript:history.back()">Place Another Order</a>
      </div>
    `);
  } catch (error) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Error</h2>
        <p>Failed to create order: ${error.message}</p>
        <a href="javascript:history.back()">Go Back</a>
      </div>
    `);
  }
};

// Show collection products for customer, filtered by selected customer location
export const loader = async ({ request }) => {
  console.log("SW COLLECTION PROXY HAS RUN");

  const { liquid, admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (!customerId) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Access Denied</h2>
        <p>Please log in to access catalog products.</p>
      </div>
    `);
  }

  const customer = await getCustomerWithCollectionsAndLocations(shop, customerId);

  if (!customer) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Customer Not Found</h2>
        <p>No customer record found for this account.</p>
      </div>
    `);
  }

  if (!customer.locations || customer.locations.length === 0) {
    return liquid(`
      <div class="quick-order-error">
        <h2>No Locations Found</h2>
        <p>No locations found for this customer.</p>
      </div>
    `);
  }

  const locationData = [];
  const uniqueCollectionsMap = new Map();

  for (const assignment of customer.collections || []) {
    if (assignment?.collection) {
      uniqueCollectionsMap.set(assignment.collection.id, assignment.collection);
    }
  }

  const assignedCollections = Array.from(uniqueCollectionsMap.values()).filter(
    (collection) => collection.status === "ACTIVE",
  );

  // Build location -> assigned collections -> collection products
  for (const location of customer.locations) {
    const locationCollections = assignedCollections.filter((collection) =>
      (collection.locations || []).some((entry) => entry.customerLocationId === location.id),
    );

    if (locationCollections.length === 0) {
      locationData.push({
        locationId: location.id,
        locationName: location.name,
        locationShopifyId: location.id,
        collectionId: null,
        collectionTitle: null,
        collectionDiscount: null,
        products: [],
        hasNoCollections: true,
        billingAddress: {
          address1: location.address1,
          address2: location.address2,
          city: location.city,
          company: location.company,
          countryCode: location.countryCode,
          firstName: location.firstName,
          lastName: location.lastName,
          phone: location.phone,
          provinceCode: location.provinceCode,
          zip: location.zip,
        },
      });
      continue;
    }

    for (const collection of locationCollections) {
      const collectionProducts = (collection.products || []).map((product) => ({
        id: product.variantId,
        title: product.productTitle,
        originalPrice: Number(product.originalPrice || 0).toFixed(2),
        adjustedPrice: Number(product.discountedPrice || 0).toFixed(2),
        hasDiscount: Number(product.discountedPrice || 0) < Number(product.originalPrice || 0),
        inventory: "N/A",
      }));

      if (collectionProducts.length === 0) {
        locationData.push({
          locationId: location.id,
          locationName: location.name,
          locationShopifyId: location.id,
          collectionId: collection.id,
          collectionTitle: collection.title,
          collectionDiscount: Number(collection.discount || 0),
          products: [],
          hasNoProducts: true,
          billingAddress: {
            address1: location.address1,
            address2: location.address2,
            city: location.city,
            company: location.company,
            countryCode: location.countryCode,
            firstName: location.firstName,
            lastName: location.lastName,
            phone: location.phone,
            provinceCode: location.provinceCode,
            zip: location.zip,
          },
        });
        continue;
      }

      locationData.push({
        locationId: location.id,
        locationName: location.name,
        locationShopifyId: location.id,
        collectionId: collection.id,
        collectionTitle: collection.title,
        collectionDiscount: Number(collection.discount || 0),
        products: collectionProducts,
        hasNoProducts: collectionProducts.length === 0,
        billingAddress: {
          address1: location.address1,
          address2: location.address2,
          city: location.city,
          company: location.company,
          countryCode: location.countryCode,
          firstName: location.firstName,
          lastName: location.lastName,
          phone: location.phone,
          provinceCode: location.provinceCode,
          zip: location.zip,
        },
      });
    }
  }

  const defaultLocationShopifyId = customer.locations[0]?.id || "";
  const locationOptionsHtml = customer.locations
    .map(
      (location) =>
        `<option value="${location.id}" ${location.id === defaultLocationShopifyId ? "selected" : ""}>${location.name || `Location ${location.id}`}</option>`,
    )
    .join("");

  const locationSections = locationData
    .map((locationInfo, locationIndex) => {
      if (locationInfo.hasNoCollections) {
        return `
          <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
            <div class="location-header">
              <h3>${locationInfo.locationName}</h3>
            </div>
            <table class="location-table">
              <thead>
                <tr>
                  <th colspan="4" style="text-align: center; color: #666;">No collections assigned for ${locationInfo.locationName}</th>
                </tr>
              </thead>
            </table>
          </div>
        `;
      }

      let adjustmentText = "";
      if (locationInfo.collectionDiscount && locationInfo.collectionDiscount > 0) {
        adjustmentText = `${locationInfo.collectionDiscount}% OFF`;
      }

      if (locationInfo.hasNoProducts) {
        return `
          <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
            <div class="location-header">
              <h3>${locationInfo.locationName} - ${locationInfo.collectionTitle}</h3>
              ${adjustmentText ? `<span class="discount-badge">${adjustmentText}</span>` : ""}
            </div>
            <table class="location-table">
              <thead>
                <tr>
                  <th colspan="4" style="text-align: center; color: #666;">No products available in this collection</th>
                </tr>
              </thead>
            </table>
          </div>
        `;
      }

      const productRows = locationInfo.products
        .map(
          (product, productIndex) => `
            <tr data-price="${product.adjustedPrice}" data-title="${product.title}">
              <td>${product.title}</td>
              <td>
                ${
                  product.hasDiscount
                    ? `<span class="original-price">$${product.originalPrice}</span> <span class="adjusted-price">$${product.adjustedPrice}</span>`
                    : `<span class="adjusted-price">$${product.adjustedPrice}</span>`
                }
              </td>
              <td>${product.inventory}</td>
              <td>
                <input type="number" class="qty-input" data-location-index="${locationIndex}" data-product-index="${productIndex}" min="0" value="0" />
              </td>
            </tr>
          `,
        )
        .join("");

      return `
        <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
          <div class="location-header">
            <h3>${locationInfo.locationName} - ${locationInfo.collectionTitle}</h3>
            ${adjustmentText ? `<span class="discount-badge">${adjustmentText}</span>` : ""}
          </div>

          <table class="location-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Inventory</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

  const currency = "USD";
  const locationDataJson = JSON.stringify(locationData);
  let orderHistory = [];

  try {
    orderHistory = await getCustomerOrderHistory(admin, customerId);
  } catch (error) {
    console.error("Error fetching order history:", error);
  }

  const orderHistoryJson = JSON.stringify(orderHistory);

  const orderHistoryRows =
    orderHistory.length > 0
      ? orderHistory
          .map(
            (order, orderIndex) => `
      <tr>
        <td><strong>${order.name}</strong></td>
        <td>${order.createdAt}</td>
        <td>${order.items.map((i) => `${i.title} (x${i.quantity})`).join(", ") || "No items"}</td>
        <td>$${parseFloat(order.total).toFixed(2)} ${order.currency}</td>
        <td>
          <button type="button" class="btn-reorder" onclick="reorderItems(${orderIndex})">Re-order</button>
        </td>
      </tr>
    `,
          )
          .join("")
      : `<tr><td colspan="5" style="text-align: center; padding: 20px;">No order history found</td></tr>`;

  const customerDisplayName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email || "Customer";

  return liquid(`
    <style>
      .quick-order-container { font-family: inherit; max-width: 1200px; margin: 0 auto; }
      .location-filter-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 16px 0;
      }
      .location-filter-row label { font-weight: 600; }
      .location-filter-row select {
        min-width: 260px;
        padding: 8px 10px;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #fff;
      }
      .location-section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
      .location-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
      .location-header h3 { margin: 0; color: #333; }
      .location-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      .quick-order-container th, .quick-order-container td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; }
      .quick-order-container th { background: #f4f4f4; font-weight: 600; }
      .quick-order-container input[type="number"] { width: 70px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-align: center; }
      .quick-order-error { padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin: 20px 0; }
      .original-price { text-decoration: line-through; color: #999; margin-right: 8px; font-size: 0.9em; }
      .adjusted-price { color: #28a745; font-weight: 600; }
      .discount-badge { display: inline-block; background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px; }
      .order-summary { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
      .order-summary h3 { margin: 0 0 10px 0; }
      .order-total { font-size: 1.2em; font-weight: bold; color: #333; }
      .btn-order {
        background: #007bff;
        color: white;
        padding: 12px 30px;
        border: none;
        border-radius: 6px;
        font-size: 1.1em;
        cursor: pointer;
        margin-top: 15px;
        display: inline-block;
      }
      .btn-order:hover { background: #0056b3; }
      .btn-order:disabled { background: #ccc; cursor: not-allowed; }
      .quick-order-success { padding: 20px; background: #d4edda; border: 1px solid #28a745; border-radius: 4px; margin: 20px 0; }
      .header-info { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
      .header-info h1 { margin: 0; }
      .locations-container { margin-top: 20px; }
      .order-history { margin-top: 40px; padding-top: 30px; border-top: 2px solid #eee; }
      .order-history h2 { margin: 0 0 15px 0; color: #333; }
      .order-history table { font-size: 0.95em; width: 100%; border-collapse: collapse; }
      .btn-reorder {
        background: #28a745;
        color: #fff;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.9em;
        cursor: pointer;
      }
      .btn-reorder:hover { background: #1f8a39; }
    </style>

    <div class="quick-order-container">
      <div class="header-info">
        <h1>Catalog Products - ${customerDisplayName}</h1>
      </div>
      <p>Shop: {{shop.name}} | Currency: ${currency}</p>

      <div class="location-filter-row">
        <label for="locationFilter">Select Location:</label>
        <select id="locationFilter" name="locationFilter">
          ${locationOptionsHtml}
        </select>
      </div>

      <form id="quickOrderForm" method="POST">
        <input type="hidden" name="orderData" id="orderDataInput" />

        <div class="locations-container">
          ${locationSections}
        </div>

        <div class="order-summary">
          <h3>Selection Summary</h3>
          <p>Items: <span id="totalItems">0</span></p>
          <p class="order-total">Total: $<span id="orderTotal">0.00</span> ${currency}</p>
          <button type="submit" class="btn-order" id="orderBtn" disabled>Order Now</button>
        </div>
      </form>

      <div class="order-history">
        <h2>Your Order History</h2>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${orderHistoryRows}
          </tbody>
        </table>
      </div>
    </div>

    <script>
      (function() {
        const locationData = ${locationDataJson};
        const orderHistory = ${orderHistoryJson};
        const currency = "${currency}";
        const form = document.getElementById('quickOrderForm');
        const orderDataInput = document.getElementById('orderDataInput');
        const locationFilter = document.getElementById('locationFilter');
        const totalItemsEl = document.getElementById('totalItems');
        const orderTotalEl = document.getElementById('orderTotal');
        const orderBtn = document.getElementById('orderBtn');

        function updateOrderSummary() {
          let totalItems = 0;
          let totalAmount = 0;
          const lineItems = [];

          document.querySelectorAll('.qty-input').forEach((input) => {
            if (input.disabled) {
              return;
            }

            const qty = parseInt(input.value) || 0;
            const locationIndex = parseInt(input.dataset.locationIndex);
            const productIndex = parseInt(input.dataset.productIndex);

            if (qty > 0 && locationData[locationIndex] && locationData[locationIndex].products && locationData[locationIndex].products[productIndex]) {
              const location = locationData[locationIndex];
              const product = locationData[locationIndex].products[productIndex];
              totalItems += qty;
              totalAmount += parseFloat(product.adjustedPrice) * qty;
              lineItems.push({
                title: product.title,
                price: product.adjustedPrice,
                quantity: qty,
                locationName: location.locationName,
                locationShopifyId: location.locationShopifyId,
                collectionId: location.collectionId,
                collectionTitle: location.collectionTitle,
              });
            }
          });

          totalItemsEl.textContent = totalItems;
          orderTotalEl.textContent = totalAmount.toFixed(2);
          orderBtn.disabled = totalItems === 0;

          const billingAddress = getSelectedLocationBillingAddress();

          orderDataInput.value = JSON.stringify({
            currency: currency,
            lineItems: lineItems,
            billingAddress: billingAddress,
          });
        }

        function applyLocationFilter() {
          const selectedLocationShopifyId = locationFilter ? locationFilter.value : String(locationData[0]?.locationShopifyId || '');

          document.querySelectorAll('.location-section').forEach((section) => {
            const isVisible = String(section.dataset.locationShopifyId) === selectedLocationShopifyId;
            section.style.display = isVisible ? 'block' : 'none';

            section.querySelectorAll('.qty-input').forEach((input) => {
              if (!isVisible) {
                input.value = '0';
              }
              input.disabled = !isVisible;
            });
          });

          updateOrderSummary();
        }

        document.addEventListener('input', function(event) {
          if (event.target.classList.contains('qty-input')) {
            updateOrderSummary();
          }
        });

        function getSelectedLocationBillingAddress() {
          const selectedLocationShopifyId = locationFilter ? locationFilter.value : String(locationData[0]?.locationShopifyId || '');
          const selectedLocation = locationData.find(loc => String(loc.locationShopifyId) === selectedLocationShopifyId);
          return selectedLocation?.billingAddress || null;
        }

        if (locationFilter) {
          locationFilter.addEventListener('change', applyLocationFilter);
        }

        window.reorderItems = function(orderIndex) {
          const order = orderHistory[orderIndex];
          if (!order || !order.items) {
            alert('Unable to re-order: Order data not found');
            return;
          }

          const lineItems = [];
          let selectedLocationData = null;

          order.items.forEach((orderItem) => {
            let matched = false;

            locationData.forEach((location) => {
              if (!matched && location.products) {
                location.products.forEach((product) => {
                  if (!matched && product.title.toLowerCase() === orderItem.title.toLowerCase()) {
                    if (!selectedLocationData) {
                      selectedLocationData = location;
                    }
                    lineItems.push({
                      title: product.title,
                      price: product.adjustedPrice,
                      quantity: orderItem.quantity,
                      locationName: location.locationName,
                      locationShopifyId: location.locationShopifyId,
                      collectionId: location.collectionId,
                      collectionTitle: location.collectionTitle,
                    });
                    matched = true;
                  }
                });
              }
            });
          });

          if (lineItems.length === 0) {
            alert('Unable to re-order: no matching items in current collections');
            return;
          }

          const payload = {
            currency: currency,
            lineItems,
            billingAddress: selectedLocationData?.billingAddress || null,
          };

          const submitData = new FormData();
          submitData.append('orderData', JSON.stringify(payload));

          fetch(window.location.href, {
            method: 'POST',
            body: submitData,
          })
            .then((response) => response.text())
            .then((html) => {
              document.documentElement.innerHTML = html;
            })
            .catch(() => {
              alert('Failed to create re-order. Please try again.');
            });
        };

        form.addEventListener('submit', function(e) {
          if (orderBtn.disabled) {
            e.preventDefault();
            return;
          }
          orderBtn.textContent = 'Processing...';
          orderBtn.disabled = true;
        });

        applyLocationFilter();
      })();
    </script>
  `);
};
