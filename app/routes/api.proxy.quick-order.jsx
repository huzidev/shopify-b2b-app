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
    console.log("SW what is orderData in Action", orderData);

    // Get additional context for order creation 
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    // Get shop record
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    // Get company information
    const company = await getCompanyByCustomer(shop, customerId);

    // Group line items by location to handle multi-location orders
    // Each line item now includes locationShopifyId from the loader data
    const locationGroups = orderData.lineItems.reduce((groups, item) => {
      const locationKey = item.locationShopifyId || 'no-location';
      if (!groups[locationKey]) {
        groups[locationKey] = {
          companyLocationId: item.locationShopifyId,
          locationName: item.locationName,
          items: []
        };
      }
      groups[locationKey].items.push(item);
      return groups;
    }, {});

    // For now, handle the primary location (most common case)
    // TODO: In future, we could create multiple orders for multiple locations
    const primaryLocationKey = Object.keys(locationGroups)[0];
    const primaryLocation = locationGroups[primaryLocationKey];
    const companyLocationId = primaryLocation?.companyLocationId || null;

    // Enhanced order data with additional context
    const enhancedOrderData = {
      ...orderData,
      customerId,
      companyId: company?.id,
      companyShopifyId: company?.shopifyId,
      companyLocationId,
      shopId: shopRecord?.id
    };

    console.log("SW what is enhancedOrderData", enhancedOrderData);

    const result = await createOrder(admin, enhancedOrderData);

    console.log("SW what is result of order", JSON.stringify(result, null, 2));

    if (result.userErrors && result.userErrors.length > 0) {
      return liquid(`
        <style>
          .quick-order-error { 
            padding: 30px; 
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
            border: 1px solid #ffc107; 
            border-radius: 12px; 
            margin: 20px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
          }
          .quick-order-error h2 { 
            color: #856404; 
            margin: 0 0 15px 0; 
            font-size: 1.5em; 
          }
          .quick-order-error p { 
            color: #856404; 
            margin: 10px 0; 
            line-height: 1.5;
          }
          .quick-order-error a { 
            background: #dc3545; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            display: inline-block; 
            margin-top: 15px; 
            transition: all 0.3s ease;
          }
          .quick-order-error a:hover { 
            background: #c82333; 
            transform: translateY(-2px);
          }
        </style>
        <div class="quick-order-error">
          <h2>⚠️ Order Failed</h2>
          <p>${result.userErrors.map(e => e.message).join(", ")}</p>
          <a href="javascript:history.back()">🔙 Go Back</a>
        </div>
      `);
    }

    const orderTotal = parseFloat(result.order?.totalPriceSet?.shopMoney?.amount || "0");
    const itemCount = orderData.lineItems.reduce((sum, item) => sum + item.quantity, 0);

    return liquid(`
      <style>
        .quick-order-success { 
          padding: 40px; 
          background: linear-gradient(135deg, #d4edda 0%, #b7f4c7 100%); 
          border: 1px solid #28a745; 
          border-radius: 16px; 
          margin: 20px; 
          box-shadow: 0 6px 20px rgba(0,0,0,0.1);
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .quick-order-success::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.3)"/><circle cx="80" cy="80" r="3" fill="rgba(255,255,255,0.2)"/></svg>') repeat;
          pointer-events: none;
        }
        .quick-order-success h2 { 
          color: #155724; 
          margin: 0 0 20px 0; 
          font-size: 2em; 
          position: relative;
          z-index: 1;
        }
        .quick-order-success .success-icon {
          font-size: 3em;
          color: #28a745;
          margin-bottom: 15px;
          display: block;
          position: relative;
          z-index: 1;
        }
        .quick-order-success .order-details { 
          background: rgba(255,255,255,0.8); 
          padding: 20px; 
          border-radius: 12px; 
          margin: 20px 0;
          position: relative;
          z-index: 1;
        }
        .quick-order-success .order-details h3 { 
          color: #155724; 
          margin: 0 0 10px 0; 
          font-size: 1.3em;
        }
        .quick-order-success .detail-row { 
          display: flex; 
          justify-content: space-between; 
          margin: 8px 0; 
          padding: 8px 0;
          border-bottom: 1px solid rgba(21,87,36,0.1);
        }
        .quick-order-success .detail-label { 
          font-weight: 600; 
          color: #155724; 
        }
        .quick-order-success .detail-value { 
          color: #495057; 
          font-weight: 500;
        }
        .quick-order-success .total-amount {
          font-size: 1.4em;
          font-weight: bold;
          color: #28a745;
        }
        .quick-order-success a { 
          background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); 
          color: white; 
          padding: 15px 30px; 
          text-decoration: none; 
          border-radius: 8px; 
          display: inline-block; 
          margin-top: 20px; 
          font-weight: 600;
          transition: all 0.3s ease;
          position: relative;
          z-index: 1;
          box-shadow: 0 4px 12px rgba(0,123,255,0.3);
        }
        .quick-order-success a:hover { 
          transform: translateY(-3px);
          box-shadow: 0 6px 18px rgba(0,123,255,0.4);
        }
      </style>
      <div class="quick-order-success">
        <span class="success-icon">🎉</span>
        <h2>Order Created Successfully!</h2>
        
        <div class="order-details">
          <h3>Order Summary</h3>
          <div class="detail-row">
            <span class="detail-label">Order Number:</span>
            <span class="detail-value">${result.order?.name || "N/A"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Items Ordered:</span>
            <span class="detail-value">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Company:</span>
            <span class="detail-value">${company?.name || "N/A"}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Location:</span>
            <span class="detail-value">${primaryLocation?.locationName || "N/A"}</span>
          </div>
          <div class="detail-row" style="border-bottom: 2px solid #28a745; padding-bottom: 12px;">
            <span class="detail-label">Total Amount:</span>
            <span class="detail-value total-amount">$${orderTotal.toFixed(2)} ${result.order?.totalPriceSet?.shopMoney?.currencyCode || "USD"}</span>
          </div>
        </div>
        
        <a href="javascript:history.back()">🛍️ Place Another Order</a>
      </div>
    `);
  } catch (error) {
    console.error("Order creation error:", error);
    return liquid(`
      <style>
        .quick-order-error { 
          padding: 30px; 
          background: linear-gradient(135deg, #f8d7da 0%, #f1aeb5 100%); 
          border: 1px solid #dc3545; 
          border-radius: 12px; 
          margin: 20px; 
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          text-align: center;
        }
        .quick-order-error h2 { 
          color: #721c24; 
          margin: 0 0 15px 0; 
          font-size: 1.5em; 
        }
        .quick-order-error p { 
          color: #721c24; 
          margin: 10px 0; 
          line-height: 1.5;
        }
        .quick-order-error a { 
          background: #dc3545; 
          color: white; 
          padding: 12px 24px; 
          text-decoration: none; 
          border-radius: 6px; 
          display: inline-block; 
          margin-top: 15px; 
          transition: all 0.3s ease;
        }
        .quick-order-error a:hover { 
          background: #c82333; 
          transform: translateY(-2px);
        }
      </style>
      <div class="quick-order-error">
        <h2>❌ Error</h2>
        <p>Failed to create order: ${error.message}</p>
        <a href="javascript:history.back()">🔙 Go Back</a>
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
        locationShopifyId: location.shopifyId, // Add shopify ID for order creation
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
          locationShopifyId: location.shopifyId, // Add shopify ID
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
        locationShopifyId: location.shopifyId, // Add shopify ID
        catalogId: catalog.id,
        catalogTitle: catalog.title,
        priceList: catalog.priceList,
        products: allProducts,
        hasNoProducts: allProducts.length === 0
      });
    }
  }

  console.log("SW what is location data", locationData);

  const defaultLocationShopifyId = company.locations[0]?.shopifyId || "";
  const locationOptionsHtml = company.locations
    .map(
      (location) =>
        `<option value="${location.shopifyId}" ${location.shopifyId === defaultLocationShopifyId ? "selected" : ""}>${location.name}</option>`
    )
    .join("");

  // Generate HTML for products grouped by location and catalog
  const locationSections = locationData.map((locationInfo, locationIndex) => {
    // Handle location with no catalogs
    if (locationInfo.hasNoCatalogs) {
      return `
        <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
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
        <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
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
      <div class="location-section" data-location-shopify-id="${locationInfo.locationShopifyId}">
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

  // 5️⃣ Fetch customer order history
  let orderHistory = [];
  try {
    orderHistory = await getCustomerOrderHistory(admin, customerId);
    console.log("SW Order history:", orderHistory.length, "orders");
  } catch (error) {
    console.error("Error fetching order history:", error);
  }

  // Serialize location data and order history for JavaScript
  const locationDataJson = JSON.stringify(locationData);
  const orderHistoryJson = JSON.stringify(orderHistory);

  // Generate order history rows
  const orderHistoryRows = orderHistory.length > 0 
    ? orderHistory.map((order, orderIndex) => `
      <tr>
        <td><strong>${order.name}</strong></td>
        <td>${order.createdAt}</td>
        <td>${order.items.map(i => `${i.title} (x${i.quantity})`).join(", ") || "No items"}</td>
        <td>$${parseFloat(order.total).toFixed(2)} ${order.currency}</td>
        <td>
          <button type="button" class="btn-reorder" onclick="reorderItems(${orderIndex})" title="Re-order these items">
            🔄 Re-order
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" style="text-align: center; padding: 20px;">No order history found</td></tr>`;

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
      .btn-reorder { 
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
        color: white; 
        border: none; 
        padding: 8px 16px; 
        border-radius: 6px; 
        font-size: 0.9em; 
        cursor: pointer; 
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(40,167,69,0.3);
      }
      .btn-reorder:hover { 
        background: linear-gradient(135deg, #20c997 0%, #28a745 100%); 
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(40,167,69,0.4);
      }
      .locations-container { margin-top: 20px; }
      .location-filter-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 16px 0;
      }
      .location-filter-row label {
        font-weight: 600;
      }
      .location-filter-row select {
        min-width: 260px;
        padding: 8px 10px;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #fff;
      }
    </style>

    <div class="quick-order-container">
      <div class="header-info">
        <h1>Quick Order - ${company.name}</h1>
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
        const totalItemsEl = document.getElementById('totalItems');
        const orderTotalEl = document.getElementById('orderTotal');
        const orderBtn = document.getElementById('orderBtn');
        const locationFilter = document.getElementById('locationFilter');

        function applyLocationFilter() {
          const selectedLocationShopifyId = locationFilter ? locationFilter.value : '';

          document.querySelectorAll('.location-section').forEach((section) => {
            const isVisible = section.dataset.locationShopifyId === selectedLocationShopifyId;
            section.style.display = isVisible ? 'block' : 'none';

            section.querySelectorAll('.qty-input').forEach((input) => {
              if (!isVisible) {
                input.value = '0';
              }
              input.disabled = !isVisible;
            });
          });

          updateSummary();
        }
        
        // Re-order function - directly creates order
        window.reorderItems = function(orderIndex) {
          const order = orderHistory[orderIndex];
          if (!order || !order.items) {
            alert('Unable to re-order: Order data not found');
            return;
          }

          // Convert order history items to line items format
          const lineItems = [];
          let matchedItems = 0;

          // Try to match each order item with current products to get current pricing
          order.items.forEach(orderItem => {
            let matched = false;

            // Search through all locations and products for current pricing
            locationData.forEach((location) => {
              if (location.products && !matched) {
                location.products.forEach((product) => {
                  // Match by product title (case-insensitive)
                  if (!matched && product.title.toLowerCase() === orderItem.title.toLowerCase()) {
                    lineItems.push({
                      title: product.title,
                      price: product.adjustedPrice,
                      quantity: orderItem.quantity,
                      locationName: location.locationName,
                      locationShopifyId: location.locationShopifyId,
                      catalogTitle: location.catalogTitle || 'Unknown Catalog'
                    });
                    matched = true;
                    matchedItems++;
                  }
                });
              }
            });

            // If product not found in current catalogs, use original order data
            if (!matched) {
              // Find the first available location as fallback
              const fallbackLocation = locationData.find(loc => loc.locationShopifyId);
              
              lineItems.push({
                title: orderItem.title,
                price: (parseFloat(order.total) / order.items.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2), // Estimate price
                quantity: orderItem.quantity,
                locationName: fallbackLocation?.locationName || 'Unknown Location',
                locationShopifyId: fallbackLocation?.locationShopifyId || null,
                catalogTitle: 'Previous Order'
              });
            }
          });

          if (lineItems.length === 0) {
            alert('❌ Unable to re-order: No items could be processed');
            return;
          }

          // Create order data in same format as quick order
          const orderData = {
            currency: currency,
            lineItems: lineItems
          };

          // Show processing state
          const reorderBtn = event.target;
          const originalText = reorderBtn.innerHTML;
          reorderBtn.innerHTML = '⏳ Processing...';
          reorderBtn.disabled = true;

          // Submit order directly
          const formData = new FormData();
          formData.append('orderData', JSON.stringify(orderData));

          fetch(window.location.href, {
            method: 'POST',
            body: formData
          }).then(response => response.text())
          .then(html => {
            // Replace the entire page content with the response
            document.documentElement.innerHTML = html;
          }).catch(error => {
            console.error('Error creating re-order:', error);
            alert('❌ Failed to create re-order. Please try again.');
            reorderBtn.innerHTML = originalText;
            reorderBtn.disabled = false;
          });
        };
        
        function updateSummary() {
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
              const product = location.products[productIndex];
              totalItems += qty;
              const price = parseFloat(product.adjustedPrice);
              totalAmount += price * qty;
              lineItems.push({
                title: product.title,
                price: product.adjustedPrice,
                quantity: qty,
                locationName: location.locationName,
                locationShopifyId: location.locationShopifyId, // Include shopify location ID
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

        if (locationFilter) {
          locationFilter.addEventListener('change', applyLocationFilter);
        }
        
        // Form submission
        form.addEventListener('submit', function(e) {
          if (orderBtn.disabled) {
            e.preventDefault();
            return;
          }
          orderBtn.textContent = 'Processing...';
          orderBtn.disabled = true;
        });
        
        // Initial filter + calculation
        applyLocationFilter();
      })();
    </script>
  `);
};
