import db from "../db.server";

function extractNumericCustomerId(customerGid) {
  if (!customerGid || typeof customerGid !== "string") {
    return null;
  }

  const parts = customerGid.split("/");
  return parts[parts.length - 1] || null;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.join(",");
  }

  if (typeof tags === "string") {
    return tags;
  }

  return null;
}

async function getShopRecord(shop) {
  if (!shop) {
    return null;
  }

  return db.shop.findUnique({
    where: { shopDomain: shop },
  });
}

async function fetchShopifyCustomers(admin) {
  const response = await admin.graphql(
    `#graphql
      query CustomerList {
        customers(first: 100) {
          nodes {
            id
            firstName
            lastName
            defaultEmailAddress {
              emailAddress
            }
            defaultPhoneNumber {
              phoneNumber
            }
            state
            tags
            createdAt
            updatedAt
          }
        }
      }
    `,
  );

  const json = await response.json();
  return json?.data?.customers?.nodes || [];
}

function toDbCustomer(shopId, customer) {
  return {
    shopId,
    shopifyCustomerId: customer.id,
    shopifyNumericId: extractNumericCustomerId(customer.id),
    email: customer.defaultEmailAddress?.emailAddress || null,
    firstName: customer.firstName || null,
    lastName: customer.lastName || null,
    phone: customer.defaultPhoneNumber?.phoneNumber || null,
    state: customer.state || null,
    tags: normalizeTags(customer.tags),
  };
}

export async function syncCustomersToDatabase(admin, shop) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    const customers = await fetchShopifyCustomers(admin);
    let syncedCount = 0;

    for (const customer of customers) {
      const customerData = toDbCustomer(dbShop.id, customer);

      await db.customer.upsert({
        where: {
          shopifyCustomerId_shopId: {
            shopifyCustomerId: customerData.shopifyCustomerId,
            shopId: dbShop.id,
          },
        },
        create: customerData,
        update: {
          shopifyNumericId: customerData.shopifyNumericId,
          email: customerData.email,
          firstName: customerData.firstName,
          lastName: customerData.lastName,
          phone: customerData.phone,
          state: customerData.state,
          tags: customerData.tags,
        },
      });

      syncedCount += 1;
    }

    return {
      success: true,
      syncedCount,
      totalFromShopify: customers.length,
    };
  } catch (error) {
    console.error("Error syncing customers:", error);
    return { success: false, error: error.message };
  }
}

export async function getCustomerStats(shop) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return {
        totalSyncedCustomers: 0,
        activeCustomers: 0,
      };
    }

    const [totalSyncedCustomers, activeCustomers] = await Promise.all([
      db.customer.count({ where: { shopId: dbShop.id } }),
      db.customer.count({
        where: {
          shopId: dbShop.id,
          OR: [{ state: "ENABLED" }, { state: "ACTIVE" }],
        },
      }),
    ]);

    return {
      totalSyncedCustomers,
      activeCustomers,
    };
  } catch (error) {
    console.error("Error fetching customer stats:", error);
    return {
      totalSyncedCustomers: 0,
      activeCustomers: 0,
    };
  }
}

export async function getCustomersWithSyncStatus(admin, shop) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return [];
    }

    const [shopifyCustomers, dbCustomers] = await Promise.all([
      fetchShopifyCustomers(admin),
      db.customer.findMany({
        where: { shopId: dbShop.id },
      }),
    ]);

    const syncedMap = new Map(dbCustomers.map((customer) => [customer.shopifyCustomerId, customer]));

    return shopifyCustomers.map((customer) => {
      const dbCustomer = syncedMap.get(customer.id);

      return {
        id: customer.id,
        numericId: extractNumericCustomerId(customer.id),
        firstName: customer.firstName || "",
        lastName: customer.lastName || "",
        email: customer.defaultEmailAddress?.emailAddress || "",
        phone: customer.defaultPhoneNumber?.phoneNumber || "",
        state: customer.state || "",
        syncStatus: dbCustomer ? "SYNCED" : "NOT_SYNCED",
        syncedAt: dbCustomer?.updatedAt || null,
      };
    });
  } catch (error) {
    console.error("Error fetching customers with sync status:", error);
    return [];
  }
}

export async function createCustomerInShopify(admin, shop, input) {
  try {
    const safeInput = {
      firstName: input?.firstName,
      lastName: input?.lastName,
      email: input?.email,
      phone: input?.phone,
    };

    const response = await admin.graphql(
      `#graphql
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            userErrors {
              field
              message
            }
            customer {
              id
              firstName
              lastName
              email
              phone
            }
          }
        }
      `,
      {
        variables: { input: safeInput },
      },
    );

    const json = await response.json();
    const result = json?.data?.customerCreate;

    if (!result) {
      return { success: false, error: "Failed to create customer" };
    }

    if (result.userErrors?.length > 0) {
      return { success: false, error: result.userErrors[0].message };
    }

    const createdCustomer = result.customer;
    if (!createdCustomer?.id) {
      return { success: false, error: "Customer created but no customer ID was returned" };
    }

    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    await db.customer.upsert({
      where: {
        shopifyCustomerId_shopId: {
          shopifyCustomerId: createdCustomer.id,
          shopId: dbShop.id,
        },
      },
      create: {
        shopId: dbShop.id,
        shopifyCustomerId: createdCustomer.id,
        shopifyNumericId: extractNumericCustomerId(createdCustomer.id),
        email: createdCustomer.email || null,
        firstName: createdCustomer.firstName || null,
        lastName: createdCustomer.lastName || null,
        phone: createdCustomer.phone || null,
        state: "ENABLED",
      },
      update: {
        shopifyNumericId: extractNumericCustomerId(createdCustomer.id),
        email: createdCustomer.email || null,
        firstName: createdCustomer.firstName || null,
        lastName: createdCustomer.lastName || null,
        phone: createdCustomer.phone || null,
        state: "ENABLED",
      },
    });

    return { success: true, customer: createdCustomer };
  } catch (error) {
    console.error("Error creating customer:", error);
    return { success: false, error: error.message };
  }
}

export async function searchSyncedCustomers(shop, searchTerm, limit = 20) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return [];
    }

    const query = (searchTerm || "").trim();

    const where = query
      ? {
          shopId: dbShop.id,
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { shopifyNumericId: { contains: query, mode: "insensitive" } },
            { shopifyCustomerId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {
          shopId: dbShop.id,
        };

    const customers = await db.customer.findMany({
      where,
      take: limit,
      include: {
        locations: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return customers;
  } catch (error) {
    console.error("Error searching customers:", error);
    return [];
  }
}

export async function getCustomerById(shop, customerId) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return null;
    }

    const customer = await db.customer.findFirst({
      where: {
        id: parseInt(customerId),
        shopId: dbShop.id,
      },
      include: {
        locations: true,
      },
    });

    return customer;
  } catch (error) {
    console.error("Error fetching customer:", error);
    return null;
  }
}

export async function getCustomerLocations(customerId) {
  try {
    const locations = await db.customerLocation.findMany({
      where: { customerId: parseInt(customerId) },
      orderBy: { createdAt: "desc" },
    });

    return locations;
  } catch (error) {
    console.error("Error fetching customer locations:", error);
    return [];
  }
}

export async function createCustomerLocation(customerId, locationData) {
  try {
    const location = await db.customerLocation.create({
      data: {
        customerId: parseInt(customerId),
        firstName: locationData.firstName || null,
        lastName: locationData.lastName || null,
        company: locationData.company || null,
        address1: locationData.address1 || null,
        address2: locationData.address2 || null,
        city: locationData.city || null,
        province: locationData.province || null,
        country: locationData.country || null,
        zip: locationData.zip || null,
        phone: locationData.phone || null,
        name: locationData.name || null,
        provinceCode: locationData.provinceCode || null,
        countryCode: locationData.countryCode || null,
        countryName: locationData.countryName || null,
      },
    });

    return { success: true, location };
  } catch (error) {
    console.error("Error creating customer location:", error);
    return { success: false, error: error.message };
  }
}

export async function updateCustomerLocation(locationId, locationData) {
  try {
    const location = await db.customerLocation.update({
      where: { id: parseInt(locationId) },
      data: {
        firstName: locationData.firstName || null,
        lastName: locationData.lastName || null,
        company: locationData.company || null,
        address1: locationData.address1 || null,
        address2: locationData.address2 || null,
        city: locationData.city || null,
        province: locationData.province || null,
        country: locationData.country || null,
        zip: locationData.zip || null,
        phone: locationData.phone || null,
        name: locationData.name || null,
        provinceCode: locationData.provinceCode || null,
        countryCode: locationData.countryCode || null,
        countryName: locationData.countryName || null,
      },
    });

    return { success: true, location };
  } catch (error) {
    console.error("Error updating customer location:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteCustomerLocation(locationId) {
  try {
    await db.customerLocation.delete({
      where: { id: parseInt(locationId) },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting customer location:", error);
    return { success: false, error: error.message };
  }
}

export async function updateCustomerMetafields(admin, customerId, metafields) {
  try {
    const customerGid = `gid://shopify/Customer/${customerId}`;

    const response = await admin.graphql(
      `#graphql
      mutation updateCustomerMetafields($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            firstName
            lastName
            email
            metafields(first: 10) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                }
              }
            }
          }
          userErrors {
            message
            field
          }
        }
      }`,
      {
        variables: {
          input: {
            id: customerGid,
            metafields: metafields,
          },
        },
      },
    );

    const json = await response.json();
    const result = json?.data?.customerUpdate;

    if (result?.userErrors?.length > 0) {
      return { success: false, error: result.userErrors[0].message };
    }

    return { success: true, customer: result?.customer };
  } catch (error) {
    console.error("Error updating customer metafields:", error);
    return { success: false, error: error.message };
  }
}

function resolveCustomerGid(shopifyCustomerId) {
  if (!shopifyCustomerId) return null;
  const raw = String(shopifyCustomerId).trim();
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/Customer/")) return raw;
  return `gid://shopify/Customer/${raw}`;
}

export async function updateCustomerProfile(admin, shop, customerNumericId, input) {
  try {
    const dbShop = await getShopRecord(shop);
    if (!dbShop) {
      return { success: false, error: "Shop not found" };
    }

    const customer = await db.customer.findFirst({
      where: {
        shopifyNumericId: String(customerNumericId),
        shopId: dbShop.id,
      },
    });

    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const firstName = (input?.firstName || "").toString().trim();
    const lastName = (input?.lastName || "").toString().trim();
    const email = (input?.email || "").toString().trim();
    const phone = (input?.phone || "").toString().trim();

    const customerGid = resolveCustomerGid(customer.shopifyCustomerId || customer.shopifyNumericId);
    if (!customerGid) {
      return { success: false, error: "Invalid Shopify customer ID" };
    }

    // Update Shopify first. Local DB is updated only when Shopify succeeds.
    const response = await admin.graphql(
      `#graphql
      mutation updateCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            firstName
            lastName
            email
            phone
          }
          userErrors {
            message
            field
          }
        }
      }`,
      {
        variables: {
          input: {
            id: customerGid,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            email: email || undefined,
            phone: phone || undefined,
          },
        },
      },
    );

    const json = await response.json();
    const result = json?.data?.customerUpdate;

    if (!result) {
      return { success: false, error: "No response from Shopify" };
    }

    if (result.userErrors?.length > 0) {
      return { success: false, error: result.userErrors[0].message };
    }

    const updatedCustomer = await db.customer.update({
      where: { id: customer.id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
      },
    });

    return {
      success: true,
      message: "Customer updated successfully",
      customer: updatedCustomer,
      shopifyCustomer: result.customer,
    };
  } catch (error) {
    console.error("Error updating customer profile:", error);
    return { success: false, error: error.message };
  }
}

export async function getCustomerOrders(shop, customerId) {
  try {
    const orders = await db.order.findMany({
      where: {
        shop: {
          shopDomain: shop,
        },
      },
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return orders;
  } catch (error) {
    console.error("Error fetching customer orders:", error);
    return [];
  }
}
