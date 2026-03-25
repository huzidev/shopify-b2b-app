import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getOrderByCatalogs,
  getOrderByCollections,
} from "../models/order.server";
import { Page, LegacyCard, DataTable, Text, Link, Button } from "@shopify/polaris";

const ROWS_PER_PAGE = 10;

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value?.d) {
    return Number(value.d[0] || 0);
  }
  return Number.parseFloat(value) || 0;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const catalogOrders = await getOrderByCatalogs(session.shop);
  console.log("SW what is catalogOrders?", catalogOrders);

  const orders = [...catalogOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return { orders };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType !== "fetchCollectionsOrders") {
    return { success: false, error: "Unknown action" };
  }

  const collectionOrders = await getOrderByCollections(session.shop);
  console.log("SW what is collectionOrders", collectionOrders);
  
  const orders = [...collectionOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    success: true,
    source: "collections",
    orders,
  };
};

export default function Orders() {
  const { orders: catalogOrders } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [activeSource, setActiveSource] = useState("catalogs");
  const [collectionOrders, setCollectionOrders] = useState([]);
  const [sortedRows, setSortedRows] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.source === "collections") {
      setCollectionOrders(fetcher.data.orders || []);
      setActiveSource("collections");
    }
  }, [fetcher.data]);

  const currentOrders =
    activeSource === "collections" ? collectionOrders : catalogOrders;

  const loadCollectionOrders = useCallback(() => {
    fetcher.submit({ actionType: "fetchCollectionsOrders" }, { method: "POST" });
  }, [fetcher]);

  const baseRows = useMemo(
    () =>
      (currentOrders || []).map((order) => {
        const totalPrice = toNumber(order.totalPrice);
        const orderItemsLength = order._count?.orderItems || 0;

        return {
          order,
          sortValues: [
            order.shopifyId || order.id,
            order.company?.id || 0,
            order.orderNumber || "",
            totalPrice,
            order.currency || "",
            orderItemsLength,
            new Date(order.createdAt).getTime(),
          ],
          cells: [
            <Text>{order.shopifyId || `#${order.id}`}</Text>,
            order.company?.id ? (
              <Link url={`/app/company/${order.company.id}`} removeUnderline={false}>
                <Text tone="interactive">{order.company.id}</Text>
              </Link>
            ) : (
              <Text tone="subdued">-</Text>
            ),
            <Link url={`/app/order/${order.id}`} removeUnderline={false}>
              <Text tone="interactive">{order.orderNumber || `#${order.id}`}</Text>
            </Link>,
            <Text>{totalPrice.toFixed(2)}</Text>,
            <Text>{order.currency || "USD"}</Text>,
            <Text>{orderItemsLength}</Text>,
            <Text>{new Date(order.createdAt).toLocaleDateString()}</Text>,
          ],
        };
      }),
    [currentOrders],
  );

  useEffect(() => {
    setSortedRows(null);
    setCurrentPage(1);
  }, [activeSource, currentOrders]);

  const dataRows = sortedRows || baseRows;

  const handleSort = useCallback(
    (index, direction) => {
      const sorted = [...dataRows].sort((a, b) => {
        const valueA = a.sortValues[index];
        const valueB = b.sortValues[index];

        if (typeof valueA === "number" && typeof valueB === "number") {
          return direction === "descending" ? valueB - valueA : valueA - valueB;
        }

        const textA = String(valueA || "").toLowerCase();
        const textB = String(valueB || "").toLowerCase();

        if (textA < textB) return direction === "descending" ? 1 : -1;
        if (textA > textB) return direction === "descending" ? -1 : 1;
        return 0;
      });

      setSortedRows(sorted);
      setCurrentPage(1);
    },
    [dataRows],
  );

  const totalPages = Math.max(1, Math.ceil(dataRows.length / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedRows = dataRows
    .slice(startIndex, startIndex + ROWS_PER_PAGE)
    .map((row) => row.cells);

  return (
    <Page
      title="Orders History"
      subtitle={`Showing ${currentOrders.length} ${activeSource} orders`}
      backAction={{
        onAction: () => navigate("/app"),
      }}
      primaryAction={
        <Button
          onClick={loadCollectionOrders}
          loading={fetcher.state !== "idle"}
          disabled={activeSource === "collections" && fetcher.state === "idle"}
        >
          Collections orders
        </Button>
      }
    >
      <LegacyCard>
        <DataTable
          columnContentTypes={[
            "text",
            "numeric",
            "text",
            "numeric",
            "text",
            "numeric",
            "text",
          ]}
          headings={[
            "Order ID",
            "Company ID",
            "Order Number",
            "Total Price",
            "Currency",
            "Order Items",
            "Order Placed",
          ]}
          rows={paginatedRows}
          sortable={[true, true, true, true, true, true, true]}
          defaultSortDirection="descending"
          initialSortColumnIndex={6}
          onSort={handleSort}
          pagination={{
            hasPrevious: currentPage > 1,
            onPrevious: () => setCurrentPage((page) => Math.max(1, page - 1)),
            hasNext: currentPage < totalPages,
            onNext: () => setCurrentPage((page) => Math.min(totalPages, page + 1)),
            label: `Page ${currentPage} of ${totalPages}`,
          }}
        />
      </LegacyCard>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
