import { authenticate } from "../shopify.server";
import db from "../db.server";

// Helper function to parse Decimal objects from Prisma
const parseDecimal = (decimalObj) => {
  if (typeof decimalObj === 'number') {
    return decimalObj;
  }
  if (typeof decimalObj === 'string') {
    return parseFloat(decimalObj);
  }
  if (decimalObj && typeof decimalObj === 'object' && decimalObj.d) {
    // Handle Decimal.js format: {s: sign, e: exponent, d: digits}
    const digits = decimalObj.d;
    const exponent = decimalObj.e;
    const sign = decimalObj.s;
    
    if (Array.isArray(digits) && digits.length > 0) {
      if (digits.length === 1) {
        // Handle single digit case (e.g., [50] for 50%)
        return sign * digits[0];
      } else {
        // Handle multiple digits case
        const wholeDigits = digits[0];
        const fractionalDigits = digits[1] || 0;
        const value = wholeDigits + (fractionalDigits / Math.pow(10, 7)); // Assuming 7 decimal places
        return sign * value;
      }
    }
  }
  return 0;
};

// Handle collection display for customers - shows assigned collections only
export const loader = async ({ request }) => {
  console.log("SW COLLECTION PROXY HAS RUN");

  const { liquid } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");

  console.log("SW Collection Proxy - Shop:", shop, "Customer ID:", customerId);

  if (!customerId) {
    return liquid(`
      <div class="quick-order-error">
        <h2>Access Denied</h2>
        <p>Please log in to access collections.</p>
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
        <h2>Error</h2>
        <p>Shop not found.</p>
      </div>
    `);
  }

  const customerGid = `gid://shopify/Customer/${customerId}`;

  // 2️⃣ Get active collections assigned to logged in customer
  const collections = await db.collection.findMany({
    where: {
      shopId: shopRecord.id,
      status: "ACTIVE",
      customers: {
        some: {
          shopifyCustomerId: customerGid,
        },
      },
    },
    include: {
      products: true,
      customers: true,
      _count: {
        select: { products: true, customers: true }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log("SW Collections found for customer:", collections.length);

  // 3️⃣ Generate collection sections matching quick-order style
  const collectionSections = collections.length > 0 
    ? collections.map(collection => {
        const discountValue = parseDecimal(collection.discount);
        const productCount = collection._count?.products || 0;
        
        // Generate discount text
        let discountText = "";
        if (discountValue > 0) {
          discountText = `${discountValue}% OFF`;
        }

        // Generate product rows
        const productRows = collection.products.length > 0 
          ? collection.products.map(product => {
              const hasDiscount = parseFloat(product.discountedPrice) < parseFloat(product.originalPrice);
              
              return `
                <tr data-collection-id="${collection.id}" data-product-id="${product.id}" data-title="${product.productTitle}" data-price="${product.discountedPrice}">
                  <td>${product.productTitle}<br><span style="color: #666; font-size: 0.9em;">${product.variantTitle}</span><br><span style="color: #999; font-size: 0.8em;">SKU: ${product.sku}</span></td>
                  <td>
                    ${hasDiscount 
                      ? `<span class="original-price">$${parseFloat(product.originalPrice).toFixed(2)}</span> <span class="adjusted-price">$${parseFloat(product.discountedPrice).toFixed(2)}</span>`
                      : `<span class="adjusted-price">$${parseFloat(product.discountedPrice).toFixed(2)}</span>`
                    }
                  </td>
                  <td>In Stock</td>
                  <td><input type="number" class="qty-input" data-collection-id="${collection.id}" data-product-index="${product.id}" min="0" value="0" /></td>
                </tr>
              `;
            }).join("")
          : `<tr><td colspan="4" style="text-align: center; color: #666;">No products available in this collection</td></tr>`;

        return `
          <div class="location-section">
            <div class="location-header">
              <h3>${collection.title}</h3>
              ${discountText ? `<span class="discount-badge">${discountText}</span>` : ""}
            </div>
            <div style="color: #666; font-style: italic; margin-bottom: 15px;">
              ${collection.description || 'No description'} • ${productCount} ${productCount === 1 ? 'product' : 'products'}
            </div>
            
            <table class="location-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Availability</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                ${productRows}
              </tbody>
            </table>
          </div>
        `;
      }).join("")
    : `
      <div class="location-section">
        <div class="location-header">
          <h3>No Collections Available</h3>
        </div>
        <table class="location-table">
          <thead>
            <tr>
              <th colspan="4" style="text-align: center; color: #666;">No product collections assigned for this customer</th>
            </tr>
          </thead>
        </table>
      </div>
    `;

  // Get currency from first collection's first product if available
  const currency = collections.length > 0 && collections[0].products.length > 0 
    ? collections[0].products[0].currency 
    : "USD";

  // Serialize collection data for JavaScript
  const collectionsDataJson = JSON.stringify(collections.map(collection => ({
    id: collection.id,
    title: collection.title,
    discount: parseDecimal(collection.discount),
    products: collection.products.map(p => ({
      id: p.id,
      productTitle: p.productTitle,
      variantTitle: p.variantTitle,
      productId: p.productId,
      variantId: p.variantId,
      originalPrice: parseFloat(p.originalPrice),
      discountedPrice: parseFloat(p.discountedPrice),
      currency: p.currency,
      sku: p.sku
    }))
  })));

  return liquid(`
    <style>
      .quick-order-container { font-family: inherit; max-width: 1200px; margin: 0 auto; }
      .location-section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
      .location-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
      .location-header h3 { margin: 0; color: #333; }
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
    </style>

    <div class="quick-order-container">
      <div class="header-info">
        <h1>Product Collections</h1>
      </div>
      <p>Browse our curated product collections and add items to your cart</p>
      
      <form id="collectionOrderForm" method="POST">
        <input type="hidden" name="orderData" id="orderDataInput" />
        
        <div class="locations-container">
          ${collectionSections}
        </div>

        <div class="order-summary">
          <h3>Cart Summary</h3>
          <p>Items: <span id="totalItems">0</span></p>
          <p class="order-total">Total: $<span id="orderTotal">0.00</span> ${currency}</p>
          <button type="button" class="btn-order" id="addToCartBtn" disabled onclick="addSelectedToCart()">Add to Cart</button>
        </div>
      </form>
    </div>

    <script>
      (function() {
        const collectionsData = ${collectionsDataJson};
        const currency = "${currency}";
        const form = document.getElementById('collectionOrderForm');
        const totalItemsEl = document.getElementById('totalItems');
        const orderTotalEl = document.getElementById('orderTotal');
        const addToCartBtn = document.getElementById('addToCartBtn');
        
        function updateOrderSummary() {
          const qtyInputs = document.querySelectorAll('.qty-input');
          let totalItems = 0;
          let totalAmount = 0;
          
          qtyInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
              totalItems += qty;
              
              // Find the corresponding product price
              const productRow = input.closest('tr');
              const price = parseFloat(productRow.dataset.price) || 0;
              totalAmount += qty * price;
            }
          });
          
          totalItemsEl.textContent = totalItems;
          orderTotalEl.textContent = totalAmount.toFixed(2);
          addToCartBtn.disabled = totalItems === 0;
        }
        
        // Add event listeners to all quantity inputs
        document.addEventListener('input', function(e) {
          if (e.target.classList.contains('qty-input')) {
            updateOrderSummary();
          }
        });
        
        window.addSelectedToCart = function() {
          const selectedItems = [];
          const qtyInputs = document.querySelectorAll('.qty-input');
          
          qtyInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
              const productRow = input.closest('tr');
              
              selectedItems.push({
                collectionId: input.dataset.collectionId,
                productIndex: input.dataset.productIndex,
                productTitle: productRow.dataset.title,
                price: parseFloat(productRow.dataset.price),
                quantity: qty
              });
            }
          });
          
          if (selectedItems.length === 0) {
            alert('Please select at least one item with quantity > 0');
            return;
          }
          
          // Calculate totals
          const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
          const totalAmount = selectedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
          
          // Here you would integrate with Shopify's cart API
          console.log('Items to add to cart:', selectedItems);
          
          // Show success message
          alert(\`Added \${totalItems} item(s) to cart!\\nTotal: $\${totalAmount.toFixed(2)} \${currency}\`);
          
          // Reset quantities
          qtyInputs.forEach(input => input.value = "0");
          updateOrderSummary();
        };
        
        // Initial update
        updateOrderSummary();
      })();
    </script>
  `);
};