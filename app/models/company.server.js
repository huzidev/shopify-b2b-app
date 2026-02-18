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
