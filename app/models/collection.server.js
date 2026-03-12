import db from "../db.server";

// Create a new collection with discounted products
export async function createCollection(shop, { title, description, products }) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    // Check for duplicate collection title
    const existingCollection = await db.collection.findFirst({
      where: {
        shopId: shopRecord.id,
        title: title,
      },
    });

    if (existingCollection) {
      return { success: false, error: `Collection with title "${title}" already exists` };
    }

    // Create the collection
    const collection = await db.collection.create({
      data: {
        shopId: shopRecord.id,
        title,
        description,
        status: "ACTIVE",
      },
    });

    // Add products to the collection
    if (products && products.length > 0) {
      const collectionProducts = products.map(product => ({
        collectionId: collection.id,
        productId: product.productId,
        variantId: product.variantId,
        originalPrice: parseFloat(product.originalPrice),
        discountedPrice: parseFloat(product.discountedPrice),
        currency: product.currency || "USD",
        sku: product.sku || "",
        productTitle: product.productTitle,
        variantTitle: product.variantTitle || "",
      }));

      await db.collectionProduct.createMany({
        data: collectionProducts,
      });
    }

    // Return the created collection with its products
    const createdCollection = await db.collection.findUnique({
      where: { id: collection.id },
      include: {
        products: true,
        _count: {
          select: { products: true }
        }
      },
    });

    return { 
      success: true, 
      collection: createdCollection 
    };
  } catch (error) {
    console.error("Error creating collection:", error);
    return { success: false, error: error.message };
  }
}

// Get all collections for a shop
export async function getCollections(shop) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return [];
    }

    const collections = await db.collection.findMany({
      where: { shopId: shopRecord.id },
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return collections;
  } catch (error) {
    console.error("Error fetching collections:", error);
    return [];
  }
}

// Get a single collection by ID
export async function getCollection(shop, collectionId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return null;
    }

    const collection = await db.collection.findFirst({
      where: {
        id: parseInt(collectionId),
        shopId: shopRecord.id,
      },
      include: {
        products: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: { products: true }
        }
      },
    });

    return collection;
  } catch (error) {
    console.error("Error fetching collection:", error);
    return null;
  }
}

// Get collection by title (for duplicate checking)
export async function getCollectionByTitle(shop, title) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return null;
    }

    const collection = await db.collection.findFirst({
      where: {
        shopId: shopRecord.id,
        title: title,
      },
    });

    return collection;
  } catch (error) {
    console.error("Error fetching collection by title:", error);
    return null;
  }
}

// Update collection status (ACTIVE/INACTIVE)
export async function updateCollectionStatus(shop, collectionId, status) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    const collection = await db.collection.updateMany({
      where: {
        id: parseInt(collectionId),
        shopId: shopRecord.id,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return { success: true, collection };
  } catch (error) {
    console.error("Error updating collection status:", error);
    return { success: false, error: error.message };
  }
}

// Delete a collection
export async function deleteCollection(shop, collectionId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    // Delete collection products first (cascade should handle this, but being explicit)
    await db.collectionProduct.deleteMany({
      where: { collectionId: parseInt(collectionId) },
    });

    // Delete the collection
    const result = await db.collection.deleteMany({
      where: {
        id: parseInt(collectionId),
        shopId: shopRecord.id,
      },
    });

    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Error deleting collection:", error);
    return { success: false, error: error.message };
  }
}

// Add products to an existing collection
export async function addProductsToCollection(shop, collectionId, products) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    const collectionProducts = products.map(product => ({
      collectionId: parseInt(collectionId),
      productId: product.productId,
      variantId: product.variantId,
      originalPrice: parseFloat(product.originalPrice),
      discountedPrice: parseFloat(product.discountedPrice),
      currency: product.currency || "USD",
      sku: product.sku || "",
      productTitle: product.productTitle,
      variantTitle: product.variantTitle || "",
    }));

    await db.collectionProduct.createMany({
      data: collectionProducts,
      skipDuplicates: true, // Skip if variant already exists in collection
    });

    return { success: true };
  } catch (error) {
    console.error("Error adding products to collection:", error);
    return { success: false, error: error.message };
  }
}

// Remove a product from a collection
export async function removeProductFromCollection(shop, collectionId, variantId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    const result = await db.collectionProduct.deleteMany({
      where: {
        collectionId: parseInt(collectionId),
        variantId: variantId,
      },
    });

    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Error removing product from collection:", error);
    return { success: false, error: error.message };
  }
}

// Get collections for a specific product (used in proxy routes)
export async function getCollectionsForProduct(shop, productId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return [];
    }

    const collections = await db.collection.findMany({
      where: {
        shopId: shopRecord.id,
        status: "ACTIVE",
        products: {
          some: {
            productId: productId,
          }
        }
      },
      include: {
        products: {
          where: {
            productId: productId,
          }
        }
      }
    });

    return collections;
  } catch (error) {
    console.error("Error fetching collections for product:", error);
    return [];
  }
}

// Get all products in a collection for display in proxy routes
export async function getCollectionProducts(shop, collectionId) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return [];
    }

    const collection = await db.collection.findFirst({
      where: {
        id: parseInt(collectionId),
        shopId: shopRecord.id,
        status: "ACTIVE",
      },
      include: {
        products: true,
      },
    });

    if (!collection) {
      return [];
    }

    return collection.products;
  } catch (error) {
    console.error("Error fetching collection products:", error);
    return [];
  }
}

// Update product pricing in a collection
export async function updateProductPricing(shop, collectionId, variantId, discountedPrice) {
  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return { success: false, error: "Shop not found" };
    }

    const result = await db.collectionProduct.updateMany({
      where: {
        collectionId: parseInt(collectionId),
        variantId: variantId,
      },
      data: {
        discountedPrice: parseFloat(discountedPrice),
      },
    });

    return { success: true, updatedCount: result.count };
  } catch (error) {
    console.error("Error updating product pricing:", error);
    return { success: false, error: error.message };
  }
}