import prisma from "../db.server";

// Check if catalog title exists
export async function getCatalogByTitle(shop, title) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const catalog = await prisma.catalog.findFirst({
      where: {
        shopId: dbShop.id,
        title: title
      }
    });

    return catalog;
  } catch (error) {
    console.error("Error checking catalog title:", error);
    return null;
  }
}

// Get all catalogs for a shop
export async function getCatalogs(shop) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return [];
    }

    const catalogs = await prisma.catalog.findMany({
      where: { shopId: dbShop.id },
      include: {
        company: true,
        companyLocation: true,
        priceList: true,
        publications: {
          include: {
            products: true
          }
        },
        _count: {
          select: {
            publications: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return catalogs;
  } catch (error) {
    console.error("Error fetching catalogs:", error);
    return [];
  }
}

// Get a single catalog with details
export async function getCatalog(shop, catalogId) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const catalog = await prisma.catalog.findFirst({
      where: { 
        id: parseInt(catalogId),
        shopId: dbShop.id 
      },
      include: {
        company: true,
        companyLocation: true,
        priceList: true,
        publications: {
          include: {
            products: true
          }
        }
      }
    });

    return catalog;
  } catch (error) {
    console.error("Error fetching catalog:", error);
    return null;
  }
}

// Check if catalog title exists (excluding current catalog)
export async function getCatalogByTitleExcluding(shop, title, excludeCatalogId) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const catalog = await prisma.catalog.findFirst({
      where: {
        shopId: dbShop.id,
        title: title,
        id: {
          not: parseInt(excludeCatalogId)
        }
      }
    });

    return catalog;
  } catch (error) {
    console.error("Error checking catalog title:", error);
    return null;
  }
}

// Update catalog
export async function updateCatalog({
  admin,
  shop,
  catalogId,
  title,
  status,
  priceListId,
  publicationId,
  newLocationId
}) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    // Get current catalog
    const catalog = await prisma.catalog.findFirst({
      where: {
        id: parseInt(catalogId),
        shopId: dbShop.id
      },
      include: {
        priceList: true,
        publications: true,
        companyLocation: true
      }
    });

    if (!catalog) {
      return { success: false, error: "Catalog not found" };
    }

    // Check for duplicate title if title is being changed
    if (title && title !== catalog.title) {
      const existingCatalog = await getCatalogByTitleExcluding(shop, title, catalogId);
      if (existingCatalog) {
        return {
          success: false,
          error: `A catalog named "${title}" already exists. Please choose a different name.`
        };
      }
    }

    // Prepare update input
    const updateInput = {};
    
    if (title) updateInput.title = title;
    if (status) updateInput.status = status;
    
    // Add context with company location IDs if location is being updated
    if (newLocationId) {
      updateInput.context = {
        companyLocationIds: [newLocationId]
      };
    }
    
    // Add priceListId if provided and it's a Shopify ID
    if (priceListId) {
      if (priceListId.startsWith('gid://shopify/PriceList/')) {
        updateInput.priceListId = priceListId;
      } else {
        // It's a database ID, get the Shopify ID
        const priceList = await prisma.priceList.findFirst({
          where: {
            id: parseInt(priceListId),
            shopId: dbShop.id
          }
        });
        if (priceList) {
          updateInput.priceListId = priceList.shopifyId;
        }
      }
    }

    // Add publicationId if provided and it's a Shopify ID
    if (publicationId) {
      if (publicationId.startsWith('gid://shopify/Publication/')) {
        updateInput.publicationId = publicationId;
      } else {
        // It's a database ID, get the Shopify ID
        const publication = await prisma.publication.findFirst({
          where: {
            id: parseInt(publicationId),
            shopId: dbShop.id
          }
        });
        if (publication) {
          updateInput.publicationId = publication.shopifyId;
        }
      }
    }

    // Update catalog in Shopify
    const response = await admin.graphql(
      `#graphql
        mutation catalogUpdate($id: ID!, $input: CatalogUpdateInput!) {
          catalogUpdate(id: $id, input: $input) {
            catalog {
              id
              title
              status
              priceList { id }
              publication { id }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          id: catalog.shopifyId,
          input: updateInput
        }
      }
    );

    const data = await response.json();
    const result = data.data.catalogUpdate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    // Update local database
    const updateData = {};
    if (title) updateData.title = title;
    if (status) updateData.status = status;
    
    // Update company location if provided
    if (newLocationId) {
      const newDbLocation = await prisma.companyLocation.findUnique({
        where: { shopifyId: newLocationId }
      });
      if (newDbLocation) {
        updateData.companyLocationId = newDbLocation.id;
      }
    }

    const updatedCatalog = await prisma.catalog.update({
      where: { id: parseInt(catalogId) },
      data: updateData,
      include: {
        company: true,
        companyLocation: true,
        priceList: true,
        publications: {
          include: {
            products: true
          }
        }
      }
    });

    return {
      success: true,
      catalog: updatedCatalog
    };

  } catch (error) {
    console.error("Error updating catalog:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function createCatalog({
  admin,
  shop,
  companyId,
  locationId,
  priceListId,
  publicationId,
  title
}) {
  try {
    // Get company data from database
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    const company = await prisma.company.findFirst({
      where: { 
        id: parseInt(companyId),
        shopId: dbShop.id
      }
    });

    if (!company) {
      return { success: false, error: "Company not found" };
    }

    // Get selected price list from database
    const selectedPriceList = await prisma.priceList.findFirst({
      where: {
        id: parseInt(priceListId),
        shopId: dbShop.id
      }
    });

    if (!selectedPriceList) {
      return { success: false, error: "Selected price list not found" };
    }

    let shopifyPublicationId = null;

    // Get selected publication from database if provided
    if (publicationId) {
      const selectedPublication = await prisma.publication.findFirst({
        where: {
          id: parseInt(publicationId),
          shopId: dbShop.id
        }
      });

      if (selectedPublication) {
        shopifyPublicationId = selectedPublication.shopifyId;
      } else {
        return { success: false, error: "Selected publication not found" };
      }
    }

    // Create catalog in Shopify
    const catalogInput = {
      title: title,
      status: "ACTIVE",
      context: {
        companyLocationIds: [locationId]
      },
      priceListId: selectedPriceList.shopifyId
    };

    // Only add publicationId if we have one
    if (shopifyPublicationId) {
      catalogInput.publicationId = shopifyPublicationId;
    }

    const catalogResponse = await admin.graphql(
      `#graphql
        mutation catalogCreate($input: CatalogCreateInput!) {
          catalogCreate(input: $input) {
            catalog {
              id
              title
              status
              priceList { id }
              publication { id }
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
          input: catalogInput
        }
      }
    );

    const catalogResult = await catalogResponse.json();
    const result = catalogResult.data.catalogCreate;

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    const catalog = result.catalog;

    // If no publication existed, create one now using the catalog
    if (!publicationId) {
      const createPublicationResponse = await admin.graphql(
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
            input: {
              catalogId: catalog.id,
              defaultState: "ALL_PRODUCTS"
            }
          }
        }
      );

      const publicationResult = await createPublicationResponse.json();
      if (publicationResult.data.publicationCreate.publication) {
        publicationId = publicationResult.data.publicationCreate.publication.id;
      }
    }

    // Find or create company location in database
    let dbLocation = await prisma.companyLocation.findUnique({
      where: { shopifyId: locationId }
    });

    if (!dbLocation) {
      // If location doesn't exist, create it (this shouldn't happen if createCompany worked correctly)
      dbLocation = await prisma.companyLocation.create({
        data: {
          companyId: company.id,
          shopifyId: locationId,
          name: "Default Location"
        }
      });
    }

    // Save catalog to database
    const dbCatalog = await prisma.catalog.create({
      data: {
        shopId: dbShop.id,
        companyId: company.id,
        companyLocationId: dbLocation.id,
        priceListId: selectedPriceList.id,
        shopifyId: catalog.id,
        title: catalog.title,
        status: catalog.status,
        publicationShopifyId: publicationId || "",
      }
    });

    return { 
      success: true, 
      catalog: {
        id: dbCatalog.id,
        shopifyId: catalog.id,
        title: catalog.title,
        status: catalog.status
      }
    };

  } catch (error) {
    console.error("Error creating catalog:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}
