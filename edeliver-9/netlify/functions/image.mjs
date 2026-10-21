// POST /.netlify/functions/image         -> upload an image (admin passcode required), returns { url }
// GET  /.netlify/functions/image?id=<id> -> serve an uploaded image (public)
import { getStore } from "@netlify/blobs";

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default async (req) => {
  const store = getStore("skyev-data");

  if (req.method === "GET") {
    const u = new URL(req.url);
    const id = u.searchParams.get("id") || u.pathname.split("/").pop();
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
    const r = await store.getWithMetadata("img-" + id, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, {
      headers: {
        "content-type": (r.metadata && r.metadata.type) || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (req.method === "POST") {
    const pin = (process.env.ADMIN_PIN || "").trim();
    if (!pin) return json({ error: "ADMIN_PIN is not set in Netlify environment variables." }, 500);
    if ((req.headers.get("x-admin-pin") || "").trim() !== pin) return json({ error: "Wrong passcode." }, 401);
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (TYPES.indexOf(type) < 0) return json({ error: "Only JPG, PNG or WebP images." }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return json({ error: "Image is too large (max 4 MB)." }, 413);
    const id = crypto.randomUUID();
    await store.set("img-" + id, buf, { metadata: { type } });
    const viaApi = new URL(req.url).pathname.startsWith("/api/");
    return json({ url: (viaApi ? "/api/image/" : "/.netlify/functions/image?id=") + id });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: ["/api/image", "/api/image/*"] };
