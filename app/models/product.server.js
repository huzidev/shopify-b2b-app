import db from "../db.server";

// Get products by their Shopify IDs with detailed information
export async function getProductsByIds(admin, productIds) {
  if (!productIds || productIds.length === 0) return [];
  
  const products = [];
  
  // Process products in batches to avoid query length limits
  const batchSize = 10;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    
    for (const productId of batch) {
      try {
        const response = await admin.graphql(
          `#graphql
            query getProduct($id: ID!) {
              product(id: $id) {
                id
                title
                description
                onlineStoreUrl
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                    }
                  }
                }
              }
            }
          `,
          {
            variables: {
              id: productId
            }
          }
        );

        const data = await response.json();
        if (data.data?.product) {
          const product = data.data.product;
          const firstVariant = product.variants?.edges?.[0]?.node;
          
          products.push({
            id: product.id,
            title: product.title,
            description: product.description,
            sku: firstVariant?.sku || 'N/A',
            price: product.priceRangeV2?.minVariantPrice ? 
              `$${parseFloat(product.priceRangeV2.minVariantPrice.amount).toFixed(2)}` : 'N/A',
            variants: product.variants?.edges?.map(edge => edge.node) || []
          });
        }
      } catch (error) {
        console.error(`Error fetching product ${productId}:`, error);
      }
    }
  }

  return products;
}

// Get all available products for selection modal
export async function getAllAvailableProducts(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query getAllProducts($first: Int!) {
          products(first: $first) {
            edges {
              node {
                id
                title
                handle
                status
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      sku
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        variables: {
          first: 50
        }
      }
    );

    const data = await response.json();
    return data.data?.products?.edges?.map(edge => {
      const product = edge.node;
      const variant = product.variants?.edges?.[0]?.node;
      
      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        sku: variant?.sku || 'N/A',
        price: product.priceRangeV2?.minVariantPrice ? 
          `$${parseFloat(product.priceRangeV2.minVariantPrice.amount).toFixed(2)}` : 'N/A'
      };
    }) || [];
  } catch (error) {
    console.error("Error fetching all products:", error);
    return [];
  }
}

export async function getAllProductsFromShopify(admin) {
  const response = await admin.graphql(
    `#graphql
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              status
              variants(first: 20) {
                edges {
                  node {
                    id
                    sku
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
    {
      variables: {
        first: 50,
      },
    },
  );

  const responseJson = await response.json();
  return responseJson.data.products;
}

export async function syncProductsToDatabase(admin, shop) {
  try {
    // Ensure shop record exists
    const shopRecord = await db.shop.upsert({
      where: { shopDomain: shop },
      update: {},
      create: {
        shopDomain: shop,
        accessToken: "", // This would be populated from session
      },
    });

    const productsData = await getAllProductsFromShopify(admin);
    let syncedCount = 0;

    if (productsData?.edges) {
      for (const productEdge of productsData.edges) {
        const productNode = productEdge.node;

        // Create or update product
        const product = await db.product.upsert({
          where: {
            shopifyId_shopId: {
              shopifyId: productNode.id,
              shopId: shopRecord.id,
            },
          },
          update: {
            title: productNode.title,
            handle: productNode.handle,
            status: productNode.status,
          },
          create: {
            shopifyId: productNode.id,
            shopId: shopRecord.id,
            title: productNode.title,
            handle: productNode.handle,
            status: productNode.status,
          },
        });

        // Create or update variants
        if (productNode.variants?.edges) {
          for (const variantEdge of productNode.variants.edges) {
            const variantNode = variantEdge.node;

            await db.variant.upsert({
              where: {
                shopifyId_shopId: {
                  shopifyId: variantNode.id,
                  shopId: shopRecord.id,
                },
              },
              update: {
                sku: variantNode.sku || null,
                title: variantNode.title || null,
                price: variantNode.price || "0",
                inventory: variantNode.inventoryQuantity || 0,
              },
              create: {
                shopifyId: variantNode.id,
                shopId: shopRecord.id,
                productId: product.id,
                sku: variantNode.sku || null,
                title: variantNode.title || null,
                price: variantNode.price || "0",
                inventory: variantNode.inventoryQuantity || 0,
              },
            });
          }
        }
        syncedCount++;
      }
    }

    return { success: true, syncedCount };
  } catch (error) {
    console.error("Error syncing products:", error);
    return { success: false, error: error.message };
  }
}

export async function getProductStats(shop) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!shopRecord) {
      return { productCount: 0, variantCount: 0 };
    }

    const variantCount = await db.variant.count({
      where: {
        product: {
          shopId: shopRecord.id,
        },
      },
    });

    return {
      productCount: shopRecord._count.products,
      variantCount,
    };
  } catch (error) {
    console.error("Error getting product stats:", error);
    return { productCount: 0, variantCount: 0 };
  }
}

export async function getAllDbProducts(shop) {
  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) return [];

  return await db.product.findMany({
    where: { shopId: shopRecord.id },
    select: {
      shopifyId: true,
    },
  });
}

export async function syncSingleProduct(admin, shop, productId) {
  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  const response = await admin.graphql(
    `#graphql
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          status
          variants(first: 20) {
            edges {
              node {
                id
                sku
                title
                price
                inventoryQuantity
              }
            }
          }
        }
      }`,
    {
      variables: { id: productId },
    }
  );

  const json = await response.json();
  const productNode = json.data.product;

  const product = await db.product.upsert({
    where: {
      shopifyId_shopId: {
        shopifyId: productNode.id,
        shopId: shopRecord.id,
      },
    },
    update: {
      title: productNode.title,
      handle: productNode.handle,
      status: productNode.status,
    },
    create: {
      shopifyId: productNode.id,
      shopId: shopRecord.id,
      title: productNode.title,
      handle: productNode.handle,
      status: productNode.status,
    },
  });

  for (const variantEdge of productNode.variants.edges) {
    const variantNode = variantEdge.node;

    await db.variant.upsert({
      where: {
        shopifyId_shopId: {
          shopifyId: variantNode.id,
          shopId: shopRecord.id,
        },
      },
      update: {
        sku: variantNode.sku,
        title: variantNode.title,
        price: variantNode.price,
        inventory: variantNode.inventoryQuantity,
      },
      create: {
        shopifyId: variantNode.id,
        shopId: shopRecord.id,
        productId: product.id,
        sku: variantNode.sku,
        title: variantNode.title,
        price: variantNode.price,
        inventory: variantNode.inventoryQuantity,
      },
    });
  }

  return { success: true };
}

export async function getProductsWithSyncStatus(admin, shop) {
  try {
    // Get products from Shopify
    const shopifyProducts = await getAllProductsFromShopify(admin);
    
    // Get synced product IDs from database
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      // If no shop record, all products are unsynced
      return shopifyProducts.edges.map((edge) => ({
        ...edge.node,
        syncStatus: "NOT_SYNCED",
      }));
    }

    const syncedProducts = await db.product.findMany({
      where: { shopId: shopRecord.id },
      select: { shopifyId: true },
    });

    const syncedProductIds = new Set(syncedProducts.map(p => p.shopifyId));

    // Map products with sync status
    return shopifyProducts.edges.map((edge) => {
      const product = edge.node;
      return {
        ...product,
        syncStatus: syncedProductIds.has(product.id) ? "SYNCED" : "NOT_SYNCED",
      };
    });
  } catch (error) {
    console.error("Error getting products with sync status:", error);
    return [];
  }
}

export async function removeProductFromDatabase(shop, productId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    // First remove all variants of the product
    await db.variant.deleteMany({
      where: {
        product: {
          shopifyId: productId,
          shopId: shopRecord.id,
        },
      },
    });

    // Then remove the product
    const result = await db.product.deleteMany({
      where: {
        shopifyId: productId,
        shopId: shopRecord.id,
      },
    });

    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Error removing product:", error);
    return { success: false, error: error.message };
  }
}