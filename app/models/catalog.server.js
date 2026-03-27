import prisma from "../db.server";

async function upsertCompanyLocationsByShopifyIds(companyId, shopifyLocationIds) {
  const normalizedIds = [...new Set((shopifyLocationIds || []).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return [];
  }

  const existingLocations = await prisma.companyLocation.findMany({
    where: {
      companyId,
      shopifyId: { in: normalizedIds }
    }
  });

  const existingByShopifyId = new Map(existingLocations.map((location) => [location.shopifyId, location]));
  const locations = [...existingLocations];

  for (const shopifyId of normalizedIds) {
    if (!existingByShopifyId.has(shopifyId)) {
      const createdLocation = await prisma.companyLocation.create({
        data: {
          companyId,
          shopifyId,
          name: "Default Location"
        }
      });
      locations.push(createdLocation);
      existingByShopifyId.set(shopifyId, createdLocation);
    }
  }

  return locations;
}

async function syncCatalogLocations(catalogId, companyId, shopifyLocationIds) {
  const locations = await upsertCompanyLocationsByShopifyIds(companyId, shopifyLocationIds);
  const locationIds = locations.map((location) => location.id);

  await prisma.catalogLocation.deleteMany({
    where: { catalogId }
  });

  if (locationIds.length > 0) {
    await prisma.catalogLocation.createMany({
      data: locationIds.map((locationId) => ({
        catalogId,
        locationId
      })),
      skipDuplicates: true
    });
  }

  return locations;
}

async function fetchCatalogAssignedLocations(admin, catalogShopifyId) {
  if (!admin || !catalogShopifyId) {
    return [];
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query getCatalogAssignedLocations($id: ID!) {
          catalog(id: $id) {
            context {
              ... on CompanyLocationCatalogContext {
                companyLocations(first: 250) {
                  nodes {
                    id
                  }
                }
              }
            }
          }
        }
      `,
      {
        variables: { id: catalogShopifyId }
      }
    );

    const data = await response.json();
    const nodes = data?.data?.catalog?.context?.companyLocations?.nodes || [];
    return nodes.map((node) => node.id).filter(Boolean);
  } catch (error) {
    console.warn("Unable to fetch catalog assigned locations from Shopify:", error?.message || error);
    return [];
  }
}

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
export async function getCatalogs(shop, admin = null) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    console.log("SW what is db Shop", dbShop);

    if (!dbShop) {
      return [];
    }

    const catalogs = await prisma.catalog.findMany({
      where: { shopId: dbShop.id },
      include: {
        company: true,
        companyLocation: true,
        catalogLocations: {
          include: {
            location: true
          }
        },
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

    const catalogsWithLocationAssignments = await Promise.all(
      catalogs.map(async (catalog) => {
        const dbAssignedLocationIds = catalog.catalogLocations?.map((entry) => entry.location?.shopifyId).filter(Boolean) || [];
        const shopifyAssignedLocationIds = dbAssignedLocationIds.length === 0
          ? await fetchCatalogAssignedLocations(admin, catalog.shopifyId)
          : [];
        const fallbackLocationIds = catalog.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : [];
        const resolvedLocationIds = dbAssignedLocationIds.length > 0
          ? dbAssignedLocationIds
          : (shopifyAssignedLocationIds.length > 0 ? shopifyAssignedLocationIds : fallbackLocationIds);

        return {
          ...catalog,
          assignedLocationIds: resolvedLocationIds,
          assignedLocationCount: resolvedLocationIds.length
        };
      })
    );

    console.log("SW what is catalogs from backend?", catalogsWithLocationAssignments);

    return catalogsWithLocationAssignments;
  } catch (error) {
    console.error("Error fetching catalogs:", error);
    return [];
  }
}

// Get a single catalog with details
export async function getCatalog(shop, catalogId, admin = null) {
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
        catalogLocations: {
          include: {
            location: true
          }
        },
        priceList: true,
        publications: {
          include: {
            products: true
          }
        }
      }
    });

    if (!catalog) {
      return null;
    }

    const dbAssignedLocationIds = catalog.catalogLocations?.map((entry) => entry.location?.shopifyId).filter(Boolean) || [];
    const assignedLocationIds = dbAssignedLocationIds.length > 0
      ? dbAssignedLocationIds
      : await fetchCatalogAssignedLocations(admin, catalog.shopifyId);
    const fallbackLocationIds = catalog.companyLocation?.shopifyId ? [catalog.companyLocation.shopifyId] : [];
    const resolvedLocationIds = assignedLocationIds.length > 0 ? assignedLocationIds : fallbackLocationIds;

    return {
      ...catalog,
      assignedLocationIds: resolvedLocationIds,
      assignedLocationCount: resolvedLocationIds.length
    };
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
  newLocationId,
  newLocationIds
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
        company: true,
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
    
    const normalizedLocationIds = Array.isArray(newLocationIds)
      ? newLocationIds.filter(Boolean)
      : newLocationIds
        ? [newLocationIds]
        : newLocationId
          ? [newLocationId]
          : [];

    // Add context with company location IDs if location is being updated
    if (normalizedLocationIds.length > 0) {
      updateInput.context = {
        companyLocationIds: normalizedLocationIds
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
    
    // Update primary company location if provided
    if (normalizedLocationIds.length > 0) {
      const newDbLocation = await prisma.companyLocation.findUnique({
        where: { shopifyId: normalizedLocationIds[0] }
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
        catalogLocations: {
          include: {
            location: true
          }
        },
        priceList: true,
        publications: {
          include: {
            products: true
          }
        }
      }
    });

    if (normalizedLocationIds.length > 0) {
      await syncCatalogLocations(updatedCatalog.id, catalog.companyId, normalizedLocationIds);
    }

    const refreshedCatalog = await prisma.catalog.findUnique({
      where: { id: updatedCatalog.id },
      include: {
        company: true,
        companyLocation: true,
        catalogLocations: {
          include: {
            location: true
          }
        },
        priceList: true,
        publications: {
          include: {
            products: true
          }
        }
      }
    });

    const resolvedLocationIds = refreshedCatalog?.catalogLocations?.map((entry) => entry.location?.shopifyId).filter(Boolean) || [];
    const fallbackLocationIds = refreshedCatalog?.companyLocation?.shopifyId ? [refreshedCatalog.companyLocation.shopifyId] : [];
    const finalLocationIds = resolvedLocationIds.length > 0 ? resolvedLocationIds : fallbackLocationIds;

    return {
      success: true,
      catalog: {
        ...(refreshedCatalog || updatedCatalog),
        assignedLocationIds: finalLocationIds,
        assignedLocationCount: finalLocationIds.length
      }
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
  locationIds,
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

    const normalizedLocationIds = Array.isArray(locationIds)
      ? locationIds.filter(Boolean)
      : locationIds
        ? [locationIds]
        : [];

    if (normalizedLocationIds.length === 0) {
      return { success: false, error: "At least one company location must be selected" };
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
        companyLocationIds: normalizedLocationIds
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

    // Find or create selected company locations in database
    const dbLocations = await upsertCompanyLocationsByShopifyIds(company.id, normalizedLocationIds);
    const primaryLocation = dbLocations[0];

    if (!primaryLocation) {
      return { success: false, error: "Unable to resolve selected company locations" };
    }

    // Save catalog to database
    const dbCatalog = await prisma.catalog.create({
      data: {
        shopId: dbShop.id,
        companyId: company.id,
        companyLocationId: primaryLocation.id,
        priceListId: selectedPriceList.id,
        shopifyId: catalog.id,
        title: catalog.title,
        status: catalog.status,
        publicationShopifyId: publicationId || "",
      }
    });

    await prisma.catalogLocation.createMany({
      data: dbLocations.map((location) => ({
        catalogId: dbCatalog.id,
        locationId: location.id
      })),
      skipDuplicates: true
    });

    return { 
      success: true, 
      catalog: {
        id: dbCatalog.id,
        shopifyId: catalog.id,
        title: catalog.title,
        status: catalog.status,
        assignedLocationIds: dbLocations.map((location) => location.shopifyId),
        assignedLocationCount: dbLocations.length
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
