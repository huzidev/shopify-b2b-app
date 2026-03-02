import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createOrder, getCustomerOrderHistory } from "../models/order.server";
import { getCompanyByCustomer } from "../models/company.server";
import { getProductsForPublication } from "../models/product.server";

// Handle POST request for order creation
export const action = async ({ request }) => {
  console.log("SW PROXY ORDER ACTION");

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
    const result = await createOrder(admin, orderData);

    if (result.userErrors && result.userErrors.length > 0) {
      return liquid(`
        <div class="quick-order-error">
          <h2>Order Failed</h2>
          <p>${result.userErrors.map(e => e.message).join(", ")}</p>
          <a href="javascript:history.back()">Go Back</a>
        </div>
      `);
    }

    return liquid(`
      <div class="quick-order-success">
        <h2>Order Created Successfully!</h2>
        <p>Order Number: ${result.order?.name || "N/A"}</p>
        <p>Total: ${result.order?.totalPriceSet?.shopMoney?.amount || "0"} ${result.order?.totalPriceSet?.shopMoney?.currencyCode || "USD"}</p>
        <a href="javascript:history.back()">Place Another Order</a>
      </div>
    `);
  } catch (error) {
    console.error("Order creation error:", error);
    return liquid(`
      <div class="quick-order-error">
        <h2>Error</h2>
        <p>Failed to create order: ${error.message}</p>
        <a href="javascript:history.back()">Go Back</a>
      </div>
    `);
  }
};

export const loader = async ({ request }) => {
  console.log("SW PROXY HAS RUN");

  const { liquid, admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");

  console.log("SW what is SHop Domain", shop);

  if (!customerId) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Access Denied</h2>
        <p>Please log in to access quick order.</p>
      </div>
    `);
  }

  // 1️⃣ Get shop
  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Shop Not Found</h2>
        <p>Unable to find shop configuration.</p>
      </div>
    `);
  }

  console.log("SW what is customerId", customerId);

  // 2️⃣ Find the company for this logged-in customer using model function
  const company = await getCompanyByCustomer(shop, customerId);

  if (!company) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Company Not Found</h2>
        <p>No company found for this customer.</p>
      </div>
    `);
  }

  console.log("SW what company matched:", company.shopifyId, company.name);

  // 3️⃣ Get all locations and their catalogs
  if (!company || !company.locations || company.locations.length === 0) {
    return liquid(`
      <div class="quick-order-error">
        <h2>No Locations Found</h2>
        <p>No locations found for this company.</p>
      </div>
    `);
  }

  const locationData = [];

  // Process each location and ALL its catalogs
  for (const location of company.locations) {
    if (location.catalogs.length === 0) {
      // Location has no catalogs
      locationData.push({
        locationId: location.id,
        locationName: location.name,
        catalogId: null,
        catalogTitle: null,
        priceList: null,
        products: [],
        hasNoCatalogs: true
      });
      continue;
    }

    // Process ALL catalogs for this location
    for (const catalog of location.catalogs) {
      if (!catalog.publications || catalog.publications.length === 0) {
        // Catalog has no publications
        locationData.push({
          locationId: location.id,
          locationName: location.name,
          catalogId: catalog.id,
          catalogTitle: catalog.title,
          priceList: catalog.priceList,
          products: [],
          hasNoProducts: true
        });
        continue;
      }

      // Process all publications in this catalog
      let allProducts = [];
      for (const publication of catalog.publications) {
        const products = await getProductsForPublication(shopRecord.id, publication.id, catalog.priceList);
        allProducts = [...allProducts, ...products];
      }

      locationData.push({
        locationId: location.id,
        locationName: location.name,
        catalogId: catalog.id,
        catalogTitle: catalog.title,
        priceList: catalog.priceList,
        products: allProducts,
        hasNoProducts: allProducts.length === 0
      });
    }
  }

  console.log("SW what is location data", locationData);

  // Generate HTML for products grouped by location and catalog
  const locationSections = locationData.map((locationInfo, locationIndex) => {
    // Handle location with no catalogs
    if (locationInfo.hasNoCatalogs) {
      return `
        <div class="location-section">
          <div class="location-header">
            <h3>${locationInfo.locationName}</h3>
          </div>
          <table class="location-table">
            <thead>
              <tr>
                <th colspan="4" style="text-align: center; color: #666;">No catalogs for ${locationInfo.locationName}</th>
              </tr>
            </thead>
          </table>
        </div>
      `;
    }

    // Handle catalog with no products
    if (locationInfo.hasNoProducts) {
      let adjustmentText = "";
      const priceList = locationInfo.priceList;
      
      if (priceList) {
        const adjustmentValue = typeof priceList.adjustmentValue === 'object' && priceList.adjustmentValue.d 
          ? priceList.adjustmentValue.d[0] 
          : parseFloat(priceList.adjustmentValue);

        if (priceList.adjustmentType === "PERCENTAGE_DECREASE") {
          adjustmentText = `${adjustmentValue}% OFF`;
        } else if (priceList.adjustmentType === "PERCENTAGE_INCREASE") {
          adjustmentText = `${adjustmentValue}% Markup`;
        } else if (priceList.adjustmentType === "FIXED_AMOUNT") {
          adjustmentText = `$${adjustmentValue} adjustment`;
        }
      }

      return `
        <div class="location-section">
          <div class="location-header">
            <h3>${locationInfo.locationName} - ${locationInfo.catalogTitle}</h3>
            ${adjustmentText ? `<span class="discount-badge">${adjustmentText}</span>` : ""}
          </div>
          <table class="location-table">
            <thead>
              <tr>
                <th colspan="4" style="text-align: center; color: #666;">No products available in this catalog</th>
              </tr>
            </thead>
          </table>
        </div>
      `;
    }

    // Generate adjustment text for this catalog's price list
    let adjustmentText = "";
    let adjustmentValue = 0;
    const priceList = locationInfo.priceList;

    if (priceList) {
      adjustmentValue = typeof priceList.adjustmentValue === 'object' && priceList.adjustmentValue.d 
        ? priceList.adjustmentValue.d[0] 
        : parseFloat(priceList.adjustmentValue);

      if (priceList.adjustmentType === "PERCENTAGE_DECREASE") {
        adjustmentText = `${adjustmentValue}% OFF`;
      } else if (priceList.adjustmentType === "PERCENTAGE_INCREASE") {
        adjustmentText = `${adjustmentValue}% Markup`;
      } else if (priceList.adjustmentType === "FIXED_AMOUNT") {
        adjustmentText = `$${adjustmentValue} adjustment`;
      }
    }

    const productRows = locationInfo.products.map((p, productIndex) => `
      <tr data-location-id="${locationInfo.locationId}" data-catalog-id="${locationInfo.catalogId}" data-product-id="${p.id}" data-title="${p.title}" data-price="${p.adjustedPrice}">
        <td>${p.title}</td>
        <td>
          ${p.hasDiscount 
            ? `<span class="original-price">$${p.originalPrice}</span> <span class="adjusted-price">$${p.adjustedPrice}</span>`
            : `<span class="adjusted-price">$${p.adjustedPrice}</span>`
          }
        </td>
        <td>${p.inventory}</td>
        <td><input type="number" class="qty-input" data-location-index="${locationIndex}" data-product-index="${productIndex}" min="0" value="0" /></td>
      </tr>
    `).join("");

    return `
      <div class="location-section">
        <div class="location-header">
          <h3>${locationInfo.locationName} - ${locationInfo.catalogTitle}</h3>
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
  }).join("");

  // Get currency from first location's price list that has one
  const locationWithPriceList = locationData.find(loc => loc.priceList);
  const currency = locationWithPriceList?.priceList?.currency || "USD";

  // Serialize location data for JavaScript
  const locationDataJson = JSON.stringify(locationData);

  // 5️⃣ Fetch customer order history
  let orderHistory = [];
  try {
    orderHistory = await getCustomerOrderHistory(admin, customerId);
    console.log("SW Order history:", orderHistory.length, "orders");
  } catch (error) {
    console.error("Error fetching order history:", error);
  }

  // Generate order history rows
  const orderHistoryRows = orderHistory.length > 0 
    ? orderHistory.map(order => `
      <tr>
        <td><strong>${order.name}</strong></td>
        <td>${order.createdAt}</td>
        <td>${order.items.map(i => `${i.title} (x${i.quantity})`).join(", ") || "No items"}</td>
        <td>$${parseFloat(order.total).toFixed(2)} ${order.currency}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" style="text-align: center; padding: 20px;">No order history found</td></tr>`;

  return liquid(`
    <style>
      .quick-order-container { font-family: inherit; max-width: 1200px; margin: 0 auto; }
      .location-section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
      .location-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
      .location-header h3 { margin: 0; color: #333; }
      .catalog-info { color: #666; font-style: italic; }
      .location-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      .quick-order-container th, .quick-order-container td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; }
      .quick-order-container th { background: #f4f4f4; font-weight: 600; }
      .quick-order-container input[type="number"] { width: 70px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-align: center; }
      .quick-order-error { padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin: 20px 0; }
      .quick-order-success { padding: 20px; background: #d4edda; border: 1px solid #28a745; border-radius: 4px; margin: 20px 0; }
      .quick-order-success a, .quick-order-error a { color: #007bff; text-decoration: underline; }
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
      .header-info { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
      .header-info h1 { margin: 0; }
      .order-history { margin-top: 40px; padding-top: 30px; border-top: 2px solid #eee; }
      .order-history h2 { margin: 0 0 15px 0; color: #333; }
      .order-history table { font-size: 0.95em; width: 100%; border-collapse: collapse; }
      .order-history td { vertical-align: top; padding: 12px 8px; border: 1px solid #ddd; }
      .order-history .items-col { max-width: 300px; font-size: 0.9em; color: #666; }
      .locations-container { margin-top: 20px; }
    </style>

    <div class="quick-order-container">
      <div class="header-info">
        <h1>Quick Order - ${company.name}</h1>
      </div>
      <p>Shop: {{shop.name}} | Currency: ${currency}</p>
      
      <form id="quickOrderForm" method="POST">
        <input type="hidden" name="orderData" id="orderDataInput" />
        
        <div class="locations-container">
          ${locationSections}
        </div>

        <div class="order-summary">
          <h3>Order Summary</h3>
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
        const currency = "${currency}";
        const form = document.getElementById('quickOrderForm');
        const orderDataInput = document.getElementById('orderDataInput');
        const totalItemsEl = document.getElementById('totalItems');
        const orderTotalEl = document.getElementById('orderTotal');
        const orderBtn = document.getElementById('orderBtn');
        
        function updateSummary() {
          let totalItems = 0;
          let totalAmount = 0;
          const lineItems = [];
          
          document.querySelectorAll('.qty-input').forEach((input) => {
            const qty = parseInt(input.value) || 0;
            const locationIndex = parseInt(input.dataset.locationIndex);
            const productIndex = parseInt(input.dataset.productIndex);
            
            if (qty > 0 && locationData[locationIndex] && locationData[locationIndex].products && locationData[locationIndex].products[productIndex]) {
              const location = locationData[locationIndex];
              const product = location.products[productIndex];
              totalItems += qty;
              const price = parseFloat(product.adjustedPrice);
              totalAmount += price * qty;
              lineItems.push({
                title: product.title,
                price: product.adjustedPrice,
                quantity: qty,
                locationName: location.locationName,
                catalogTitle: location.catalogTitle || 'Unknown Catalog'
              });
            }
          });
          
          totalItemsEl.textContent = totalItems;
          orderTotalEl.textContent = totalAmount.toFixed(2);
          orderBtn.disabled = totalItems === 0;
          
          // Update hidden input with order data
          orderDataInput.value = JSON.stringify({
            currency: currency,
            lineItems: lineItems
          });
        }
        
        // Add event listeners to quantity inputs
        document.querySelectorAll('.qty-input').forEach(input => {
          input.addEventListener('change', updateSummary);
          input.addEventListener('input', updateSummary);
        });
        
        // Form submission
        form.addEventListener('submit', function(e) {
          if (orderBtn.disabled) {
            e.preventDefault();
            return;
          }
          orderBtn.textContent = 'Processing...';
          orderBtn.disabled = true;
        });
        
        // Initial calculation
        updateSummary();
      })();
    </script>
  `);
};
