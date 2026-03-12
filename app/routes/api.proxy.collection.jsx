import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getCollectionProducts } from "../models/collection.server";

// Handle collection display for customers
export const loader = async ({ request }) => {
  console.log("SW COLLECTION PROXY HAS RUN");

  const { liquid, admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const collectionId = url.searchParams.get("collection_id");
  const customerId = url.searchParams.get("logged_in_customer_id");

  console.log("SW Collection Proxy - Shop:", shop, "Collection ID:", collectionId, "Customer ID:", customerId);

  if (!collectionId) {
    return liquid(`
      <div class="collection-error">
        <h2>Error</h2>
        <p>No collection specified.</p>
      </div>
    `);
  }

  // 1️⃣ Get shop
  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return liquid(`
      <div class="collection-error">
        <h2>Error</h2>
        <p>Shop not found.</p>
      </div>
    `);
  }

  // 2️⃣ Get collection and its products
  const collection = await db.collection.findFirst({
    where: {
      id: parseInt(collectionId),
      shopId: shopRecord.id,
      status: "ACTIVE",
    },
    include: {
      products: {
        orderBy: {
          createdAt: 'desc'
        }
      },
    },
  });

  if (!collection) {
    return liquid(`
      <div class="collection-error">
        <h2>Collection Not Found</h2>
        <p>The collection you're looking for is not available.</p>
      </div>
    `);
  }

  console.log("SW Collection found:", collection.title, "Products:", collection.products.length);

  // 3️⃣ Generate HTML for the collection
  const currency = collection.products.length > 0 ? collection.products[0].currency : "USD";

  // Generate product rows
  const productRows = collection.products.length > 0 
    ? collection.products.map(product => {
        const hasDiscount = parseFloat(product.discountedPrice) < parseFloat(product.originalPrice);
        
        return `
          <tr>
            <td class="product-info">
              <div class="product-title">${product.productTitle}</div>
              <div class="product-variant">${product.variantTitle}</div>
              <div class="product-sku">SKU: ${product.sku}</div>
            </td>
            <td class="price-info">
              ${hasDiscount ? `
                <div class="original-price">$${parseFloat(product.originalPrice).toFixed(2)}</div>
                <div class="discounted-price">$${parseFloat(product.discountedPrice).toFixed(2)}</div>
                <div class="discount-badge">Sale!</div>
              ` : `
                <div class="current-price">$${parseFloat(product.discountedPrice).toFixed(2)}</div>
              `}
            </td>
            <td class="quantity-controls">
              <input type="number" 
                     min="0" 
                     value="0" 
                     id="qty_${product.variantId}" 
                     class="quantity-input"
                     data-product-id="${product.productId}"
                     data-variant-id="${product.variantId}"
                     data-price="${product.discountedPrice}">
            </td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="3" style="text-align: center; padding: 20px;">No products found</td></tr>`;

  return liquid(`
    <div class="collection-container">
      <style>
        .collection-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
        
        .collection-header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .collection-title {
          font-size: 2em;
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .collection-description {
          color: #666;
          font-size: 1.1em;
        }
        
        .products-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .products-table th {
          background: #2c3e50;
          color: white;
          padding: 15px;
          text-align: left;
          font-weight: 600;
        }
        
        .products-table td {
          padding: 15px;
          border-bottom: 1px solid #eee;
        }
        
        .product-info .product-title {
          font-weight: 600;
          margin-bottom: 5px;
          color: #333;
        }
        
        .product-info .product-variant {
          color: #666;
          margin-bottom: 3px;
        }
        
        .product-info .product-sku {
          color: #999;
          font-size: 0.9em;
        }
        
        .price-info {
          text-align: center;
        }
        
        .original-price {
          text-decoration: line-through;
          color: #999;
          font-size: 0.9em;
        }
        
        .discounted-price {
          color: #e74c3c;
          font-weight: 600;
          font-size: 1.1em;
        }
        
        .current-price {
          color: #333;
          font-weight: 600;
          font-size: 1.1em;
        }
        
        .discount-badge {
          background: #e74c3c;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.8em;
          margin-top: 5px;
          display: inline-block;
        }
        
        .quantity-input {
          width: 80px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-align: center;
        }
        
        .quantity-controls {
          text-align: center;
        }
        
        .order-actions {
          margin-top: 30px;
          text-align: center;
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
        }
        
        .btn-order {
          background: #27ae60;
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.1em;
          font-weight: 600;
          transition: background-color 0.3s;
        }
        
        .btn-order:hover {
          background: #219a52;
        }
        
        .btn-order:disabled {
          background: #bdc3c7;
          cursor: not-allowed;
        }
        
        .empty-collection {
          text-align: center;
          padding: 40px;
          color: #666;
        }
        
        @media (max-width: 768px) {
          .collection-container {
            padding: 10px;
          }
          
          .products-table {
            font-size: 0.9em;
          }
          
          .products-table th,
          .products-table td {
            padding: 10px 5px;
          }
          
          .quantity-input {
            width: 60px;
          }
        }
      </style>

      <div class="collection-header">
        <h1 class="collection-title">${collection.title}</h1>
        ${collection.description ? `<p class="collection-description">${collection.description}</p>` : ''}
      </div>

      ${collection.products.length > 0 ? `
        <table class="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>

        <div class="order-actions">
          <button type="button" class="btn-order" onclick="addToCart()">
            Add Selected Items to Cart
          </button>
        </div>
      ` : `
        <div class="empty-collection">
          <h3>No Products Available</h3>
          <p>This collection is currently empty or products are out of stock.</p>
        </div>
      `}

      <script>
        function addToCart() {
          const quantities = [];
          const quantityInputs = document.querySelectorAll('.quantity-input');
          
          quantityInputs.forEach(input => {
            const quantity = parseInt(input.value) || 0;
            if (quantity > 0) {
              quantities.push({
                variantId: input.dataset.variantId,
                productId: input.dataset.productId,
                quantity: quantity,
                price: parseFloat(input.dataset.price)
              });
            }
          });

          if (quantities.length === 0) {
            alert('Please select at least one item with quantity > 0');
            return;
          }

          // Here you would integrate with Shopify's cart API
          // For now, just show what would be added
          console.log('Items to add to cart:', quantities);
          
          let total = quantities.reduce((sum, item) => sum + (item.quantity * item.price), 0);
          let itemCount = quantities.reduce((sum, item) => sum + item.quantity, 0);
          
          alert(\`Added \${itemCount} item(s) to cart. Total: $\${total.toFixed(2)}\`);
          
          // Reset quantities
          quantityInputs.forEach(input => input.value = "0");
        }
      </script>
    </div>
  `);
};