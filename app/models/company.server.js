import prisma from "../db.server";

export async function getCompanies(shop) {
  try {
    const dbShop = await prisma.shop.findUnique({
      where: { shopDomain: shop }
    });

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

    return companies;
  } catch (error) {
    console.error("Error fetching companies:", error);
    return [];
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
            locations(first:1) {
              edges {
                node {
                  id
                  name
                }
              }
            }
            contacts(first:1) {
              edges {
                node {
                  id
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
  const contactId = company.contacts.edges[0].node.id;

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
        priceListShopifyId: priceListId,
        publicationShopifyId: publicationId,
      }
    });
  }

  return { success: true };
}

export async function deleteCompany({ admin, shop, companyId }) {
  try {
    // First delete from Shopify
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
          id: companyId
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

    await prisma.company.delete({
      where: {
        shopifyId_shopId: {
          shopifyId: companyId,
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
          input: locationData
        }
      }
    );

    const data = await response.json();
    const result = data.data.companyLocationCreate;

    if (result.userErrors.length > 0) {
      return {
        success: false,
        error: result.userErrors[0].message
      };
    }

    const location = result.companyLocation;

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
