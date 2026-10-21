// POST /api/video      -> upload a small video file (admin passcode required), returns { url }
// GET  /api/video/<id> -> serve an uploaded video (public, supports Range requests for seeking)
// Netlify functions accept ~6 MB per request, so uploaded files are limited to 4 MB.
import { getStore } from "@netlify/blobs";

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const TYPES = ["video/mp4", "video/webm"];
const MAX = 4 * 1024 * 1024;

export default async (req) => {
  const store = getStore("skyev-data");

  if (req.method === "GET") {
    const u = new URL(req.url);
    const id = u.searchParams.get("id") || u.pathname.split("/").pop();
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
    const r = await store.getWithMetadata("vid-" + id, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    const buf = r.data;
    const total = buf.byteLength;
    const headers = {
      "content-type": (r.metadata && r.metadata.type) || "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (m && (m[1] !== "" || m[2] !== "")) {
      let start, end;
      if (m[1] === "") {
        start = Math.max(0, total - Number(m[2]));
        end = total - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
      }
      if (start >= total || end < start) {
        return new Response(null, { status: 416, headers: { "content-range": "bytes */" + total } });
      }
      return new Response(buf.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
      });
    }
    return new Response(buf, { headers: { ...headers, "content-length": String(total) } });
  }

  if (req.method === "POST") {
    const pin = (process.env.ADMIN_PIN || "").trim();
    if (!pin) return json({ error: "ADMIN_PIN is not set in Netlify environment variables." }, 500);
    if ((req.headers.get("x-admin-pin") || "").trim() !== pin) return json({ error: "Wrong passcode." }, 401);
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (TYPES.indexOf(type) < 0) return json({ error: "Only MP4 or WebM videos." }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX) return json({ error: "Video is too large (max 4 MB). Use a YouTube/Vimeo link for bigger videos." }, 413);
    const id = crypto.randomUUID();
    await store.set("vid-" + id, buf, { metadata: { type } });
    const viaApi = new URL(req.url).pathname.startsWith("/api/");
    return json({ url: (viaApi ? "/api/video/" : "/.netlify/functions/video?id=") + id });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: ["/api/video", "/api/video/*"] };
