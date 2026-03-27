// app/routes/api.proxy.jsx
export async function loader({ request }) {
  console.log("SW is proxy route even called");

  const url = new URL(request.url);
  const pathPrefix = url.searchParams.get("path_prefix"); // /apps/b2b
  const requestedPath = url.pathname.replace("/api/proxy", "");
  // e.g. requestedPath = "/quick-order"

  if (requestedPath === "/quick-order") {
    // handle quick-order logic
    return Response.json({ data: "..." });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
