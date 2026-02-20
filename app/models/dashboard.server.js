import prisma from "../db.server";

// Get dashboard stats from database
export async function getDashboardStats(shop) {
  const dbShop = await prisma.shop.findUnique({
    where: { shopDomain: shop }
  });

  if (!dbShop) {
    return {
      totalCompanies: 0,
      activeCatalogs: 0,
      totalLocations: 0,
      totalPublications: 0,
      pendingPublications: 0
    };
  }

  const [companiesCount, catalogsData, locationsCount, publicationsData] = await Promise.all([
    prisma.company.count({
      where: { shopId: dbShop.id }
    }),
    prisma.catalog.groupBy({
      by: ['status'],
      where: { shopId: dbShop.id },
      _count: { id: true }
    }),
    prisma.companyLocation.count({}),
    prisma.publication.groupBy({
      by: ['defaultState'],
      where: { shopId: dbShop.id },
      _count: { id: true }
    })
  ]);

  const activeCatalogs = catalogsData.find(item => item.status === 'Active')?._count?.id || 0;
  const totalPublications = publicationsData.reduce((total, item) => total + item._count.id, 0);
  const pendingPublications = publicationsData.find(item => item.defaultState === 'EMPTY')?._count?.id || 0;

  return {
    totalCompanies: companiesCount,
    activeCatalogs,
    totalLocations: locationsCount,
    totalPublications,
    pendingPublications
  };
}

// Get recent activity data
export async function getRecentActivity(shop) {
  const dbShop = await prisma.shop.findUnique({
    where: { shopDomain: shop }
  });

  if (!dbShop) return [];

  // Get recent catalogs with company info
  const recentCatalogs = await prisma.catalog.findMany({
    where: { shopId: dbShop.id },
    include: {
      company: true
    },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });

  // Get recent publications
  const recentPublications = await prisma.publication.findMany({
    where: { shopId: dbShop.id },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });

  // Combine and format activity data
  const activity = [];

  recentCatalogs.forEach(catalog => {
    activity.push({
      time: catalog.updatedAt.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }),
      entity: "Catalog",
      action: `Updated catalog "${catalog.title}" for ${catalog.company.name}`,
      status: catalog.status || "Active"
    });
  });

  recentPublications.forEach(publication => {
    activity.push({
      time: publication.updatedAt.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }),
      entity: "Publication",
      action: `Updated publication "${publication.title || 'Untitled'}"`,
      status: publication.autoPublish ? "Active" : "Draft"
    });
  });

  return activity.sort((a, b) => new Date(`1970/01/01 ${b.time}`) - new Date(`1970/01/01 ${a.time}`)).slice(0, 10);
}

// Get company activity for recent activity feed
export async function getCompanyActivity(shop, limit = 5) {
  const dbShop = await prisma.shop.findUnique({
    where: { shopDomain: shop }
  });

  if (!dbShop) return [];

  const recentCompanies = await prisma.company.findMany({
    where: { shopId: dbShop.id },
    orderBy: { id: 'desc' },
    take: limit
  });

  return recentCompanies.map(company => ({
    time: new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    }),
    entity: "Company",
    action: `Company "${company.name}" was updated`,
    status: "Active"
  }));
}

// Get location activity for recent activity feed
export async function getLocationActivity(shop, limit = 5) {
  const dbShop = await prisma.shop.findUnique({
    where: { shopDomain: shop }
  });

  if (!dbShop) return [];

  const recentLocations = await prisma.companyLocation.findMany({
    include: {
      company: true
    },
    orderBy: { id: 'desc' },
    take: limit
  });

  return recentLocations.map(location => ({
    time: new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    }),
    entity: "Location",
    action: `Location "${location.name}" updated for ${location.company.name}`,
    status: "Active"
  }));
}