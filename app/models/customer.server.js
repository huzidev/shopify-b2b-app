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
    const response = await admin.graphql(
      `#graphql
        mutation customerCreate($input: CustomerCreateInput!) {
          customerCreate(input: $input) {
            customer {
              id
              firstName
              lastName
              email
              phone
              acceptsMarketing
            }
            customerUserErrors {
              field
              message
              code
            }
          }
        }
      `,
      {
        variables: { input },
      },
    );

    const json = await response.json();
    const result = json?.data?.customerCreate;

    if (!result) {
      return { success: false, error: "Failed to create customer" };
    }

    if (result.customerUserErrors?.length > 0) {
      return { success: false, error: result.customerUserErrors[0].message };
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
