import db from "../db.server";

// Check if publication title exists
export async function getPublicationByTitle(shop, title) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const publication = await db.publication.findFirst({
      where: {
        shopId: dbShop.id,
        title: title
      }
    });

    return publication;
  } catch (error) {
    console.error("Error checking publication title:", error);
    return null;
  }
}

// Get catalogs for publication creation dropdown
export async function getCatalogsForPublication(shop) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return [];
    }

    const catalogs = await db.catalog.findMany({
      where: { shopId: dbShop.id },
      include: {
        company: true,
        companyLocation: true
      },
      orderBy: {
        title: 'asc'
      }
    });

    return catalogs;
  } catch (error) {
    console.error("Error fetching catalogs for publication:", error);
    return [];
  }
}

export async function getPublications(shop) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return [];
    }

    const publications = await db.publication.findMany({
      where: { shopId: dbShop.id },
      include: {
        catalog: {
          include: {
            company: true,
            companyLocation: true
          }
        },
        products: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return publications;
  } catch (error) {
    console.error("Error fetching publications:", error);
    return [];
  }
}

export async function getPublicationProducts(shop, publicationId) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return [];
    }

    const publication = await db.publication.findFirst({
      where: {
        id: parseInt(publicationId),
        shopId: dbShop.id
      },
      include: {
        products: true
      }
    });

    if (!publication) {
      return [];
    }

    return publication.products.map(pp => pp.productId);
  } catch (error) {
    console.error("Error fetching publication products:", error);
    return [];
  }
}

export async function createPublication({
  admin,
  shop,
  catalogId,
  title,
  defaultState = "ALL_PRODUCTS",
  autoPublish = false
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    let catalog = null;
    let catalogIdForApi = null;

    // Only validate and fetch catalog if catalogId is provided
    if (catalogId) {
      // Validate catalogId
      const parsedCatalogId = parseInt(catalogId);
      if (isNaN(parsedCatalogId)) {
        return { success: false, error: "Invalid catalog ID provided" };
      }

      // Get catalog from database
      catalog = await db.catalog.findFirst({
        where: {
          id: parsedCatalogId,
          shopId: dbShop.id
        }
      });

      if (!catalog) {
        return { success: false, error: "Catalog not found" };
      }

      catalogIdForApi = catalog.shopifyId;
    }

    // Create publication input
    const publicationInput = {
      defaultState: defaultState,
      autoPublish: autoPublish
    };

    // Only include catalogId if catalog is provided
    if (catalogIdForApi) {
      publicationInput.catalogId = catalogIdForApi;
    }

    // Create publication in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation publicationCreate($input: PublicationCreateInput!) {
          publicationCreate(input: $input) {
            publication {
              id
              catalog { id title }
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: publicationInput
        }
      }
    );

    const data = await response.json();
    const result = data.data.publicationCreate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    const publication = result.publication;

    // Save to database
    const dbPublication = await db.publication.create({
      data: {
        shopId: dbShop.id,
        catalogId: catalog?.id || null,
        shopifyId: publication.id,
        title: title || publication.catalog?.title || catalog?.title || "Untitled Publication",
        defaultState: defaultState,
        autoPublish: autoPublish
      }
    });

    return { 
      success: true, 
      publication: dbPublication
    };

  } catch (error) {
    console.error("Error creating publication:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function updatePublication({
  admin,
  shop,
  publicationId,
  publishablesToAdd = [],
  publishablesToRemove = []
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Get publication from database
    const publication = await db.publication.findFirst({
      where: {
        id: parseInt(publicationId),
        shopId: dbShop.id
      },
      include: {
        products: true
      }
    });

    if (!publication) {
      return { success: false, error: "Publication not found" };
    }

    // Update publication in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation publicationUpdate($id: ID!, $input: PublicationUpdateInput!) {
          publicationUpdate(id: $id, input: $input) {
            publication {
              products(first: 10) {
                edges {
                  node {
                    id
                    title
                  }
                }
              }
            }
            userErrors {
              field
              code
              message
            }
          }
        }
      `,
      {
        variables: {
          id: publication.shopifyId,
          input: {
            publishablesToAdd,
            publishablesToRemove,
            autoPublish: publication.autoPublish
          }
        }
      }
    );

    const data = await response.json();
    const result = data.data.publicationUpdate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    // Update local database
    // Remove products that were removed
    if (publishablesToRemove.length > 0) {
      await db.publicationProduct.deleteMany({
        where: {
          publicationId: publication.id,
          productId: {
            in: publishablesToRemove
          }
        }
      });
    }

    // Add products that were added
    if (publishablesToAdd.length > 0) {
      const existingProducts = publication.products.map(p => p.productId);
      const newProducts = publishablesToAdd.filter(productId => !existingProducts.includes(productId));
      
      if (newProducts.length > 0) {
        await db.publicationProduct.createMany({
          data: newProducts.map(productId => ({
            publicationId: publication.id,
            productId
          }))
        });
      }
    }

    return { 
      success: true, 
      publication: result.publication
    };

  } catch (error) {
    console.error("Error updating publication:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function addFixedPrices({
  admin,
  shop,
  priceListId,
  prices
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Get price list from database
    const priceList = await db.priceList.findFirst({
      where: {
        id: parseInt(priceListId),
        shopId: dbShop.id
      }
    });

    if (!priceList) {
      return { success: false, error: "Price list not found" };
    }

    // Add fixed prices in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation priceListFixedPricesAdd($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
          priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
            prices {
              compareAtPrice {
                amount
                currencyCode
              }
              price {
                amount
                currencyCode
              }
              variant {
                id
              }
            }
            userErrors {
              field
              code
              message
            }
          }
        }
      `,
      {
        variables: {
          priceListId: priceList.shopifyId,
          prices: prices
        }
      }
    );

    const data = await response.json();
    const result = data.data.priceListFixedPricesAdd;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    return { 
      success: true, 
      prices: result.prices
    };

  } catch (error) {
    console.error("Error adding fixed prices:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

export async function deleteFixedPrices({
  admin,
  shop,
  priceListId,
  variantIds
}) {
  try {
    const dbShop = await db.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Get price list from database
    const priceList = await db.priceList.findFirst({
      where: {
        id: parseInt(priceListId),
        shopId: dbShop.id
      }
    });

    if (!priceList) {
      return { success: false, error: "Price list not found" };
    }

    // Delete fixed prices in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation priceListFixedPricesDelete($priceListId: ID!, $variantIds: [ID!]!) {
          priceListFixedPricesDelete(priceListId: $priceListId, variantIds: $variantIds) {
            deletedFixedPriceVariantIds
            userErrors {
              field
              code
              message
            }
          }
        }
      `,
      {
        variables: {
          priceListId: priceList.shopifyId,
          variantIds: variantIds
        }
      }
    );

    const data = await response.json();
    const result = data.data.priceListFixedPricesDelete;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    return { 
      success: true, 
      deletedVariantIds: result.deletedFixedPriceVariantIds
    };

  } catch (error) {
    console.error("Error deleting fixed prices:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}