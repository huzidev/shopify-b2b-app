import db from "../db.server";

export async function createOrder(admin, orderData) {
  const { 
    currency, 
    lineItems, 
    customerId, 
    companyId, 
    companyShopifyId, 
    companyLocationId, 
    shopId,
    collectionId,
    collectionIds,
    billingAddress,
  } = orderData;

  // Calculate total amount from line items
  const totalAmount = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.price) * item.quantity);
  }, 0);

  console.log("SW what is billingAddress", billingAddress);

  const variables = {
    order: {
      currency: currency || "USD",
      customerId: customerId ? `gid://shopify/Customer/${customerId}` : null,
      lineItems: lineItems.map(item => ({
        title: item.title,
        priceSet: {
          shopMoney: {
            amount: parseFloat(item.price),
            currencyCode: currency || "USD"
          }
        },
        quantity: item.quantity
      })),
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          amountSet: {
            shopMoney: {
              amount: totalAmount,
              currencyCode: currency || "USD"
            }
          }
        }
      ]
    }
  };

  // Add companyLocationId if available
  if (companyLocationId) {
    variables.order.companyLocationId = companyLocationId;
  }

  // Add billing address if available, filtering out null/undefined values
  if (billingAddress && typeof billingAddress === 'object') {
    const cleanedBillingAddress = {};
    const addressFields = ['address1', 'address2', 'city', 'company', 'countryCode', 'firstName', 'lastName', 'phone', 'provinceCode', 'zip'];
    
    for (const field of addressFields) {
      if (billingAddress[field]) {
        cleanedBillingAddress[field] = billingAddress[field];
      }
    }
    
    if (Object.keys(cleanedBillingAddress).length > 0) {
      variables.order.billingAddress = cleanedBillingAddress;
    }
  }

  // Remove customerId if not provided to avoid GraphQL errors
  if (!customerId) {
    delete variables.order.customerId;
  }

  const response = await admin.graphql(
    `#graphql
    mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        userErrors {
          field
          message
        }
        order {
          id
          name
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 50) {
            nodes {
              id
              title
              quantity
            }
          }
          createdAt
          updatedAt
        }
      }
    }`,
    { variables }
  );

  const json = await response.json();
  const result = json.data.orderCreate;

  // If order was created successfully, save to local database
  if (result.order && !result.userErrors?.length && shopId) {
    try {
      const orderNumber = result.order.name;
      const shopifyOrderId = result.order.id;
      const totalPrice = parseFloat(result.order.totalPriceSet?.shopMoney?.amount || "0");
      const orderCurrency = result.order.totalPriceSet?.shopMoney?.currencyCode || currency || "USD";

      // Save order to local database
      const savedOrder = await db.order.create({
        data: {
          shopId: shopId,
          shopifyId: shopifyOrderId,
          companyId: companyId || null,
          orderNumber: orderNumber,
          totalPrice: totalPrice,
          currency: orderCurrency,
        }
      });

      console.log("SW Order saved to local DB:", savedOrder);

      // Save order items
      if (result.order.lineItems?.nodes?.length > 0) {
        for (let i = 0; i < result.order.lineItems.nodes.length; i++) {
          const lineItem = result.order.lineItems.nodes[i];
          const originalLineItem = lineItems[i];

          if (originalLineItem) {
            // Find the variant in our database to get the variant ID
            const variant = await db.variant.findFirst({
              where: {
                shopId: shopId,
                // We might need to match by product title or SKU since we don't have variant shopify ID directly
                product: {
                  title: lineItem.title
                }
              }
            });

            if (variant) {
              await db.orderItem.create({
                data: {
                  orderId: savedOrder.id,
                  variantId: variant.id,
                  quantity: lineItem.quantity,
                  price: parseFloat(originalLineItem.price),
                }
              });
            }
          }
        }
      }

      const normalizedCollectionIds = [
        ...(Array.isArray(collectionIds) ? collectionIds : []),
        ...(collectionId ? [collectionId] : []),
      ]
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id));

      if (normalizedCollectionIds.length > 0) {
        const uniqueCollectionIds = [...new Set(normalizedCollectionIds)];

        const existingCollections = await db.collection.findMany({
          where: {
            id: { in: uniqueCollectionIds },
            shopId,
          },
          select: { id: true },
        });

        if (existingCollections.length > 0) {
          await db.orderCollection.createMany({
            data: existingCollections.map((collection) => ({
              orderId: savedOrder.id,
              collectionId: collection.id,
            })),
            skipDuplicates: true,
          });
        }
      }

    } catch (dbError) {
      console.error("Error saving order to local database:", dbError);
      // Don't fail the order creation if DB save fails
    }
  }

  return result;
}

export async function getQuickOrderProducts(shopId, companyId) {
  const catalog = await db.catalog.findFirst({
    where: { companyId },
    include: { publications: true, priceList: true },
  });

  if (!catalog || catalog.publications.length === 0) {
    return { products: [], priceList: null, catalog: null };
  }

  const publication = catalog.publications[0];

  const publicationProducts = await db.publicationProduct.findMany({
    where: { publicationId: publication.id },
  });

  const products = [];

  for (const pp of publicationProducts) {
    const product = await db.product.findFirst({
      where: { shopId, shopifyId: pp.productId },
      include: { variants: true },
    });

    if (!product || product.variants.length === 0) continue;

    const variant = product.variants[0];
    const originalPrice = parseFloat(variant.price);
    let adjustedPrice = originalPrice;

    // Apply price adjustment
    if (catalog.priceList) {
      const pl = catalog.priceList;
      const adjustmentValue = typeof pl.adjustmentValue === 'object' && pl.adjustmentValue.d 
        ? pl.adjustmentValue.d[0] 
        : parseFloat(pl.adjustmentValue);
      
      if (pl.adjustmentType === "PERCENTAGE_INCREASE") {
        adjustedPrice = originalPrice * (1 + adjustmentValue / 100);
      } else if (pl.adjustmentType === "PERCENTAGE_DECREASE") {
        adjustedPrice = originalPrice * (1 - adjustmentValue / 100);
      } else if (pl.adjustmentType === "FIXED_AMOUNT") {
        adjustedPrice = originalPrice + adjustmentValue;
      }
    }

    products.push({
      id: product.id,
      shopifyId: product.shopifyId,
      title: product.title,
      sku: variant.sku || "",
      variantId: variant.shopifyId,
      originalPrice: originalPrice.toFixed(2),
      adjustedPrice: adjustedPrice.toFixed(2),
      hasDiscount: catalog.priceList && adjustedPrice !== originalPrice,
      inventory: variant.inventory || 0,
    });
  }

  return { 
    products, 
    priceList: catalog.priceList,
    currency: catalog.priceList?.currency || "USD"
  };
}

export async function getCustomerOrderHistory(admin, customerId) {
  const customerGid = `gid://shopify/Customer/${customerId}`;
  
  const response = await admin.graphql(
    `#graphql
    query getCustomerOrders($id: ID!) {
      customer(id: $id) {
        id
        firstName
        lastName
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: customerGid } }
  );

  const json = await response.json();
  
  if (!json.data?.customer?.orders?.edges) {
    return [];
  }

  return json.data.customer.orders.edges.map(edge => ({
    id: edge.node.id,
    name: edge.node.name,
    createdAt: new Date(edge.node.createdAt).toLocaleDateString(),
    total: edge.node.totalPriceSet?.shopMoney?.amount || "0",
    currency: edge.node.totalPriceSet?.shopMoney?.currencyCode || "USD",
    items: edge.node.lineItems?.edges?.map(li => ({
      title: li.node.title,
      quantity: li.node.quantity
    })) || []
  }));
}

export async function getOrderByCatalogs(shop) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });

    if (!dbShop) {
      return [];
    }

    return await db.order.findMany({
      where: {
        shopId: dbShop.id,
        company: {
          is: {
            catalogs: {
              some: {
                shopId: dbShop.id,
              },
            },
          },
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  } catch (error) {
    console.error("Error fetching orders by catalogs:", error);
    return [];
  }
}

export async function getOrderByCollections(shop) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });

    if (!dbShop) {
      return [];
    }

    return await db.order.findMany({
      where: {
        shopId: dbShop.id,
        collections: {
          some: {
            collection: {
              shopId: dbShop.id,
            },
          },
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  } catch (error) {
    console.error("Error fetching orders by collections:", error);
    return [];
  }
}

// Get a single order by ID
export async function getOrder(shop, orderId) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const order = await db.order.findFirst({
      where: { 
        id: parseInt(orderId),
        shopId: dbShop.id 
      },
      include: {
        company: true,
        orderItems: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    return order;
  } catch (error) {
    console.error("Error fetching order:", error);
    return null;
  }
}
