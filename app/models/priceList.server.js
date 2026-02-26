import db from "../db.server";

export async function getPriceListByTitle(shop, title) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const priceList = await db.priceList.findFirst({
      where: {
        shopId: dbShop.id,
        name: title
      }
    });

    return priceList;
  } catch (error) {
    console.error("Error checking price list title:", error);
    return null;
  }
}

export async function getPriceLists(shop) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return [];
    }

    const priceLists = await db.priceList.findMany({
      where: { shopId: dbShop.id },
      orderBy: {
        name: 'asc'
      }
    });

    return priceLists;
  } catch (error) {
    console.error("Error fetching price lists:", error);
    return [];
  }
}

export async function createPriceList({
  admin,
  shop,
  name,
  currency,
  adjustmentType,
  adjustmentValue
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Check if price list name already exists in our database
    const existingPriceList = await db.priceList.findFirst({
      where: {
        shopId: dbShop.id,
        name
      }
    });

    if (existingPriceList) {
      return { 
        success: false, 
        error: `A price list named "${name}" already exists. Please choose a different name.` 
      };
    }

    // Create price list in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation PriceListCreate($input: PriceListCreateInput!) {
          priceListCreate(input: $input) {
            userErrors {
              field
              message
            }
            priceList {
              id
              name
              currency
              parent {
                adjustment {
                  type
                  value
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          input: {
            name: name,
            currency: currency,
            parent: {
              adjustment: {
                type: adjustmentType,
                value: adjustmentValue
              }
            }
          }
        }
      }
    );

    const data = await response.json();
    const result = data.data.priceListCreate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    const priceList = result.priceList;

    // Save to database
    const dbPriceList = await db.priceList.create({
      data: {
        shopId: dbShop.id,
        shopifyId: priceList.id,
        name: priceList.name,
        currency: priceList.currency,
        adjustmentType: priceList.parent?.adjustment?.type || adjustmentType,
        adjustmentValue: priceList.parent?.adjustment?.value || adjustmentValue
      }
    });

    return { 
      success: true, 
      priceList: dbPriceList
    };

  } catch (error) {
    console.error("Error creating price list:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function updatePriceList({
  admin,
  shop,
  priceListId,
  adjustmentType,
  adjustmentValue
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Update price list in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation priceListUpdate($id: ID!, $input: PriceListUpdateInput!) {
          priceListUpdate(id: $id, input: $input) {
            priceList {
              id
              parent {
                adjustment {
                  type
                  value
                }
              }
            }
            userErrors {
              message
              field
              code
            }
          }
        }
      `,
      {
        variables: {
          id: priceListId,
          input: {
            parent: {
              adjustment: {
                value: adjustmentValue,
                type: adjustmentType
              }
            }
          }
        }
      }
    );

    const data = await response.json();
    const result = data.data.priceListUpdate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    // Update in database
    const dbPriceList = await db.priceList.update({
      where: {
        shopifyId_shopId: {
          shopifyId: priceListId,
          shopId: dbShop.id
        }
      },
      data: {
        adjustmentType: adjustmentType,
        adjustmentValue: adjustmentValue
      }
    });

    return { 
      success: true, 
      priceList: dbPriceList
    };

  } catch (error) {
    console.error("Error updating price list:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function deletePriceList({ admin, shop, priceListId }) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // First delete from Shopify
    const deleteMutation = `
      mutation priceListDelete($id: ID!) {
        priceListDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(deleteMutation, {
      variables: {
        id: priceListId
      }
    });

    const deleteResponse = await response.json();
    
    if (deleteResponse.data?.priceListDelete?.userErrors?.length > 0) {
      const error = deleteResponse.data.priceListDelete.userErrors[0].message;
      return { success: false, error };
    }

    // Then delete from our database
    await db.priceList.delete({
      where: {
        shopifyId_shopId: {
          shopifyId: priceListId,
          shopId: dbShop.id
        }
      }
    });

    return { success: true };

  } catch (error) {
    console.error("Error deleting price list:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function bulkDeletePriceLists({ admin, shop, priceListIds }) {
  try {
    const results = [];
    let successCount = 0;
    let errors = [];

    for (const priceListId of priceListIds) {
      const result = await deletePriceList({ admin, shop, priceListId });
      if (result.success) {
        successCount++;
      } else {
        errors.push(`Failed to delete ${priceListId}: ${result.error}`);
      }
    }

    return {
      success: true,
      deletedCount: successCount,
      errors: errors.length > 0 ? errors : null
    };

  } catch (error) {
    console.error("Error bulk deleting price lists:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}