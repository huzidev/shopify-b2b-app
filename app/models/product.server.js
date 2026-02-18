import db from "../db.server";

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
