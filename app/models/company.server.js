import prisma from "../db.server";
import { getProductsForPublication } from "./product.server";

function mergeLocationCatalogs(location) {
  const linkedCatalogs = (location.catalogLocations || []).map((entry) => entry.catalog).filter(Boolean);
  const primaryCatalogs = location.catalogs || [];
  const mergedMap = new Map();

  for (const catalog of [...linkedCatalogs, ...primaryCatalogs]) {
    if (!mergedMap.has(catalog.id)) {
      mergedMap.set(catalog.id, catalog);
    }
  }

  return {
    ...location,
    catalogs: Array.from(mergedMap.values())
  };
}

function normalizeCompanyLocationsWithCatalogs(company) {
  if (!company || !company.locations) {
    return company;
  }

  return {
    ...company,
    locations: company.locations.map(mergeLocationCatalogs)
  };
}

// Get company by customer ID for quick order
export async function getCompanyByCustomer(shop, customerId) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    // Look up company by customer ID using the new CompanyCustomer relationship
    const customerGid = `gid://shopify/Customer/${customerId}`;
    
    const companyCustomer = await prisma.companyCustomer.findFirst({
      where: {
        shopId: dbShop.id,
        shopifyCustomerId: customerGid
      },
      include: {
        company: {
          include: {
            locations: {
              include: {
                catalogs: {
                  include: {
                    priceList: true,
                    publications: {
                      include: {
                        products: true
                      }
                    }
                  }
                },
                catalogLocations: {
                  include: {
                    catalog: {
                      include: {
                        priceList: true,
                        publications: {
                          include: {
                            products: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    return normalizeCompanyLocationsWithCatalogs(companyCustomer?.company || null);
  } catch (error) {
    console.error("Error fetching company by customer:", error);
    return null;
  }
}

export async function getCompanies(shop) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    console.log("SW what is db Shop", dbShop);

    if (!dbShop) {
      return [];
    }

    const companies = await prisma.company.findMany({
      where: { shopId: dbShop.id },
      include: {
        locations: true,
        catalogs: true,
        _count: {
          select: {
            orders: true,
            catalogs: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log("SW what is get companies in SSR", companies);
    return companies;
  } catch (error) {
    console.error("Error fetching companies:", error);
    return [];
  }
}

export async function getCompany(shop, companyId) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return null;
    }

    const company = await prisma.company.findFirst({
      where: { 
        id: parseInt(companyId),
        shopId: dbShop.id 
      },
      include: {
        customers: true, // Get all associated customers
        locations: {
          include: {
            catalogs: {
              include: {
                priceList: true,
                publications: {
                  include: {
                    products: true
                  }
                }
              }
            },
            catalogLocations: {
              include: {
                catalog: {
                  include: {
                    priceList: true,
                    publications: {
                      include: {
                        products: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        catalogs: {
          include: {
            priceList: true,
            publications: {
              include: {
                products: true
              }
            }
          }
        },
        orders: {
          include: {
            orderItems: {
              include: {
                variant: {
                  include: {
                    product: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: {
            orders: true,
            catalogs: true,
            locations: true,
            customers: true
          }
        }
      }
    });

    if (!company) {
      return null;
    }

    const normalizedCompany = normalizeCompanyLocationsWithCatalogs(company);

    // Fetch products with pricing for each location
    const locationProducts = [];

    for (const location of normalizedCompany.locations) {
      if (location.catalogs.length === 0) {
        locationProducts.push({
          locationId: location.id,
          locationName: location.name,
          locationShopifyId: location.shopifyId,
          catalogId: null,
          catalogTitle: null,
          priceList: null,
          products: [],
          hasNoCatalogs: true
        });
        continue;
      }

      for (const catalog of location.catalogs) {
        if (!catalog.publications || catalog.publications.length === 0) {
          locationProducts.push({
            locationId: location.id,
            locationName: location.name,
            locationShopifyId: location.shopifyId,
            catalogId: catalog.id,
            catalogTitle: catalog.title,
            priceList: catalog.priceList,
            products: [],
            hasNoProducts: true
          });
          continue;
        }

        let allProducts = [];
        for (const publication of catalog.publications) {
          const products = await getProductsForPublication(dbShop.id, publication.id, catalog.priceList);
          allProducts = [...allProducts, ...products];
        }

        locationProducts.push({
          locationId: location.id,
          locationName: location.name,
          locationShopifyId: location.shopifyId,
          catalogId: catalog.id,
          catalogTitle: catalog.title,
          priceList: catalog.priceList,
          products: allProducts,
          hasNoProducts: allProducts.length === 0
        });
      }
    }

    // Add the location products to the company object
    normalizedCompany.locationProducts = locationProducts;

    return normalizedCompany;
  } catch (error) {
    console.error("Error fetching company:", error);
    return null;
  }
}

export async function createCompany({
  admin,
  shop,
  name,
  locationName,
  firstName,
  lastName,
  email
}) {
  const response = await admin.graphql(
    `#graphql
      mutation {
        companyCreate(input: {
          company: {
            name: "${name}"
          },
          companyLocation: {
            name: "${locationName}"
          },
          companyContact: {
            firstName: "${firstName}",
            lastName: "${lastName}",
            email: "${email}"
          }
        }) {
          company {
            id
            name
            mainContact {
              id
              customer {
                id
                email
                firstName
                lastName
              }
            }
            contacts(first: 10) {
              edges {
                node {
                  id
                  customer {
                    id
                    email
                    firstName
                    lastName
                  }
                }
              }
            }
            locations(first:1) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `
  );

  const data = await response.json();
  const result = data.data.companyCreate;

  if (result.userErrors.length > 0) {
    return {
      success: false,
      error: result.userErrors[0].message
    };
  }

  const company = result.company;
  const locationId = company.locations.edges[0].node.id;
  
  // Extract customer information from the response
  const mainContact = company.mainContact;
  const customer = mainContact.customer;
  const contactId = mainContact.id;

  const catalogBase = await admin.graphql(`
    {
      priceLists(first:1) {
        edges {
          node { id }
        }
      }
      publications(first:1) {
        edges {
          node { id }
        }
      }
    }
  `);

  const catalogData = await catalogBase.json();

  const priceListId =
    catalogData.data.priceLists.edges[0]?.node.id;

  const publicationId =
    catalogData.data.publications.edges[0]?.node.id;

  const catalogResponse = await admin.graphql(
    `#graphql
      mutation {
        catalogCreate(input: {
          title: "Catalog for ${name}",
          status: ACTIVE,
          context: {
            companyLocationIds: ["${locationId}"]
          },
          priceListId: "${priceListId}",
          publicationId: "${publicationId}"
        }) {
          catalog {
            id
            title
            status
          }
          userErrors {
            message
          }
        }
      }
    `
  );

  const catalogResult = await catalogResponse.json();
  const catalog = catalogResult.data.catalogCreate.catalog;

  const dbShop = await prisma.shop.findUnique({
    where: { shopDomain: shop }
  });

  const dbCompany = await prisma.company.create({
    data: {
      shopId: dbShop.id,
      shopifyId: company.id,
      locationShopifyId: locationId,
      contactShopifyId: contactId,
      name,
    }
  });

  // Save customer relationship to database
  if (customer) {
    await prisma.companyCustomer.create({
      data: {
        shopId: dbShop.id,
        shopifyCustomerId: customer.id,
        companyId: dbCompany.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
      }
    });
  }

  // Save company location to database
  const dbLocation = await prisma.companyLocation.create({
    data: {
      companyId: dbCompany.id,
      shopifyId: locationId,
      name: locationName,
    }
  });

  // Save catalog to database
  if (catalog) {
    await prisma.catalog.create({
      data: {
        shopId: dbShop.id,
        companyId: dbCompany.id,
        companyLocationId: dbLocation.id,
        shopifyId: catalog.id,
        title: catalog.title,
        status: catalog.status,
        publicationShopifyId: publicationId,
      }
    });
  }

  return { success: true };
}

export async function deactivateCompanies(shop, companyIds) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    await prisma.company.updateMany({
      where: {
        id: { in: companyIds.map((id) => parseInt(id)) },
        shopId: dbShop.id,
      },
      data: { status: "Inactive" },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deactivating companies:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteCompany({ admin, shop, companyShopifyId }) {
  try {
    // First delete from Shopify using the exact mutation format requested
    const response = await admin.graphql(
      `#graphql
        mutation companyDelete($id: ID!) {
          companyDelete(id: $id) {
            deletedCompanyId
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          id: companyShopifyId
        }
      }
    );

    const data = await response.json();
    const result = data.data.companyDelete;

    if (result.userErrors.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    // Then delete from database
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    if (!dbShop) {
      return {
        success: false,
        error: "Shop not found"
      };
    }

    // Delete the company and all related records (cascade should handle this)
    await prisma.company.delete({
      where: {
        shopifyId_shopId: {
          shopifyId: companyShopifyId,
          shopId: dbShop.id
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting company:", error);
    return {
      success: false,
      error: "Failed to delete company"
    };
  }
}

export async function updateCompany({ admin, shop, companyId, name }) {
  try {
    const response = await admin.graphql(
      `#graphql
        mutation companyUpdate($companyId: ID!, $input: CompanyInput!) {
          companyUpdate(companyId: $companyId, input: $input) {
            company {
              id
              name
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
          companyId: companyId,
          input: {
            name: name
          }
        }
      }
    );

    const data = await response.json();
    const result = data.data.companyUpdate;

    if (result.userErrors.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    // Update in database
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    await prisma.company.updateMany({
      where: {
        shopifyId: companyId,
        shopId: dbShop.id
      },
      data: {
        name: name
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating company:", error);
    return {
      success: false,
      error: "Failed to update company"
    };
  }
}

export async function createCompanyLocation({ admin, shop, companyId, locationData }) {
  try {
    console.log('SW what is locationData received:', JSON.stringify(locationData, null, 2));
    
    // Ensure required fields are present and non-empty for billing address
    const billingAddress = locationData.billingAddress && (
      locationData.billingAddress.firstName || 
      locationData.billingAddress.lastName || 
      locationData.billingAddress.address1
    ) ? {
      ...(locationData.billingAddress.firstName && { firstName: locationData.billingAddress.firstName }),
      ...(locationData.billingAddress.lastName && { lastName: locationData.billingAddress.lastName }),
      ...(locationData.billingAddress.address1 && { address1: locationData.billingAddress.address1 }),
      ...(locationData.billingAddress.address2 && { address2: locationData.billingAddress.address2 }),
      ...(locationData.billingAddress.city && { city: locationData.billingAddress.city }),
      ...(locationData.billingAddress.zip && { zip: locationData.billingAddress.zip }),
      ...(locationData.billingAddress.phone && { phone: locationData.billingAddress.phone }),
      ...(locationData.billingAddress.countryCode && { countryCode: locationData.billingAddress.countryCode }),
    } : null;

    // Ensure required fields are present and non-empty for shipping address
    const shippingAddress = locationData.shippingAddress && (
      locationData.shippingAddress.firstName || 
      locationData.shippingAddress.lastName || 
      locationData.shippingAddress.address1
    ) ? {
      ...(locationData.shippingAddress.firstName && { firstName: locationData.shippingAddress.firstName }),
      ...(locationData.shippingAddress.lastName && { lastName: locationData.shippingAddress.lastName }),
      ...(locationData.shippingAddress.address1 && { address1: locationData.shippingAddress.address1 }),
      ...(locationData.shippingAddress.address2 && { address2: locationData.shippingAddress.address2 }),
      ...(locationData.shippingAddress.city && { city: locationData.shippingAddress.city }),
      ...(locationData.shippingAddress.zip && { zip: locationData.shippingAddress.zip }),
      ...(locationData.shippingAddress.phone && { phone: locationData.shippingAddress.phone }),
      ...(locationData.shippingAddress.countryCode && { countryCode: locationData.shippingAddress.countryCode }),
    } : null;

    // Build the input object with only non-null fields
    const input = {
      ...(locationData.name && { name: locationData.name }),
      ...(locationData.phone && { phone: locationData.phone }),
      ...(locationData.locale && { locale: locationData.locale }),
      ...(locationData.externalId && { externalId: locationData.externalId }),
      ...(locationData.note && { note: locationData.note }),
      ...(billingAddress && { billingAddress }),
      ...(shippingAddress && { shippingAddress }),
    };

    console.log('SW what is final input:', JSON.stringify(input, null, 2));

    const response = await admin.graphql(
      `#graphql
        mutation companyLocationCreate($companyId: ID!, $input: CompanyLocationInput!) {
          companyLocationCreate(companyId: $companyId, input: $input) {
            companyLocation {
              id
              name
              phone
              locale
              externalId
              note
              billingAddress {
                address1
                address2
                city
                zip
                firstName
                lastName
                phone
                countryCode
              }
              shippingAddress {
                address1
                address2
                city
                zip
                firstName
                lastName
                phone
                countryCode
              }
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
          companyId: companyId,
          input: input
        }
      }
    );

    const data = await response.json();
    const result = data.data.companyLocationCreate;

    console.log("SW what is result", JSON.stringify(result, null, 2));

    if (result.userErrors && result.userErrors.length > 0) {
      return {
        success: false,
        error: result.userErrors.map(err => err.message).join(", ")
      };
    }

    const location = result.companyLocation;

    if (!location) {
      return {
        success: false,
        error: "No location was created"
      };
    }

    console.log("SW what is location", location);

    // Save location to database
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

    const dbCompany = await prisma.company.findUnique({
      where: {
        shopifyId_shopId: {
          shopifyId: companyId,
          shopId: dbShop.id
        }
      }
    });

    console.log("SW what is db Company", dbCompany);

    if (dbCompany) {
      await prisma.companyLocation.create({
        data: {
          companyId: dbCompany.id,
          shopifyId: location.id,
          name: location.name,
        }
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error creating company location:", error);
    return {
      success: false,
      error: "Failed to create company location"
    };
  }
}
