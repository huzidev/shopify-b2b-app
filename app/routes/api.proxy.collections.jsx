import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getCompanyByCustomer } from "../models/company.server";
import { getProductsForPublication } from "../models/product.server";

// Show catalog products for customer, filtered by selected company location
export const loader = async ({ request }) => {
  console.log("SW COLLECTION PROXY HAS RUN");

  const { liquid } = await authenticate.public.appProxy(request);

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

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Error</h2>
        <p>Shop not found.</p>
      </div>
    `);
  }

  const company = await getCompanyByCustomer(shop, customerId);

  if (!company) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Company Not Found</h2>
        <p>No company found for this customer.</p>
      </div>
    `);
  }

  if (!company.locations || company.locations.length === 0) {
    return liquid(`
      <div class="quick-order-error">
        <h2>No Locations Found</h2>
        <p>No locations found for this company.</p>
      </div>
    `);
  }

  const locationData = [];

  // Build location -> catalog -> publication products
  for (const location of company.locations) {
    if (location.catalogs.length === 0) {
      locationData.push({
        locationId: location.id,
        locationName: location.name,
        locationShopifyId: location.shopifyId,
        catalogId: null,
        catalogTitle: null,
        priceList: null,
        products: [],
        hasNoCatalogs: true,
      });
      continue;
    }

    for (const catalog of location.catalogs) {
      if (!catalog.publications || catalog.publications.length === 0) {
        locationData.push({
          locationId: location.id,
          locationName: location.name,
          locationShopifyId: location.shopifyId,
          catalogId: catalog.id,
          catalogTitle: catalog.title,
          priceList: catalog.priceList,
          products: [],
          hasNoProducts: true,
        });
        continue;
      }

      let allProducts = [];
      for (const publication of catalog.publications) {
        const products = await getProductsForPublication(
          shopRecord.id,
          publication.id,
          catalog.priceList,
        );
        allProducts = [...allProducts, ...products];
      }

      locationData.push({
        locationId: location.id,
        locationName: location.name,
        locationShopifyId: location.shopifyId,
        catalogId: catalog.id,
        catalogTitle: catalog.title,
        priceList: catalog.priceList,
        products: allProducts,
        hasNoProducts: allProducts.length === 0,
      });
    }
  }

  const defaultLocationShopifyId = company.locations[0]?.shopifyId || "";
  const locationOptionsHtml = company.locations
    .map(
      (location) =>
        `<option value="${location.shopifyId}" ${location.shopifyId === defaultLocationShopifyId ? "selected" : ""}>${location.name}</option>`,
    )
    .join("");

  const locationSections = locationData
    .map((locationInfo, locationIndex) => {
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

      let adjustmentText = "";
      const priceList = locationInfo.priceList;

      if (priceList) {
        const adjustmentValue =
          typeof priceList.adjustmentValue === "object" && priceList.adjustmentValue.d
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

      if (locationInfo.hasNoProducts) {
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
    })
    .join("");

  const locationWithPriceList = locationData.find((entry) => entry.priceList);
  const currency = locationWithPriceList?.priceList?.currency || "USD";
  const locationDataJson = JSON.stringify(locationData);

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
      .header-info { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
      .header-info h1 { margin: 0; }
      .locations-container { margin-top: 20px; }
    </style>

    <div class="quick-order-container">
      <div class="header-info">
        <h1>Catalog Products - ${company.name}</h1>
      </div>
      <p>Shop: {{shop.name}} | Currency: ${currency}</p>

      <div class="location-filter-row">
        <label for="locationFilter">Select Location:</label>
        <select id="locationFilter" name="locationFilter">
          ${locationOptionsHtml}
        </select>
      </div>

      <form id="catalogProductForm" method="POST">
        <div class="locations-container">
          ${locationSections}
        </div>

        <div class="order-summary">
          <h3>Selection Summary</h3>
          <p>Items: <span id="totalItems">0</span></p>
          <p class="order-total">Total: $<span id="orderTotal">0.00</span> ${currency}</p>
          <button type="button" class="btn-order" id="addToCartBtn" disabled onclick="addSelectedToCart()">Add to Cart</button>
        </div>
      </form>
    </div>

    <script>
      (function() {
        const locationData = ${locationDataJson};
        const currency = "${currency}";
        const locationFilter = document.getElementById('locationFilter');
        const totalItemsEl = document.getElementById('totalItems');
        const orderTotalEl = document.getElementById('orderTotal');
        const addToCartBtn = document.getElementById('addToCartBtn');

        function updateOrderSummary() {
          let totalItems = 0;
          let totalAmount = 0;

          document.querySelectorAll('.qty-input').forEach((input) => {
            if (input.disabled) {
              return;
            }

            const qty = parseInt(input.value) || 0;
            const locationIndex = parseInt(input.dataset.locationIndex);
            const productIndex = parseInt(input.dataset.productIndex);

            if (qty > 0 && locationData[locationIndex] && locationData[locationIndex].products && locationData[locationIndex].products[productIndex]) {
              const product = locationData[locationIndex].products[productIndex];
              totalItems += qty;
              totalAmount += parseFloat(product.adjustedPrice) * qty;
            }
          });

          totalItemsEl.textContent = totalItems;
          orderTotalEl.textContent = totalAmount.toFixed(2);
          addToCartBtn.disabled = totalItems === 0;
        }

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

          updateOrderSummary();
        }

        document.addEventListener('input', function(event) {
          if (event.target.classList.contains('qty-input')) {
            updateOrderSummary();
          }
        });

        if (locationFilter) {
          locationFilter.addEventListener('change', applyLocationFilter);
        }

        window.addSelectedToCart = function() {
          const selectedItems = [];

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

              selectedItems.push({
                locationName: location.locationName,
                catalogTitle: location.catalogTitle,
                productTitle: product.title,
                quantity: qty,
                unitPrice: parseFloat(product.adjustedPrice),
                totalPrice: parseFloat(product.adjustedPrice) * qty,
              });
            }
          });

          if (selectedItems.length === 0) {
            alert('Please select at least one item with quantity greater than 0.');
            return;
          }

          const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
          const totalAmount = selectedItems.reduce((sum, item) => sum + item.totalPrice, 0);

          console.log('Catalog items selected:', selectedItems);
          alert('Added ' + totalItems + ' item(s) to cart. Total: $' + totalAmount.toFixed(2) + ' ' + currency);

          document.querySelectorAll('.qty-input').forEach((input) => {
            if (!input.disabled) {
              input.value = '0';
            }
          });
          updateOrderSummary();
        };

        applyLocationFilter();
      })();
    </script>
  `);
};
