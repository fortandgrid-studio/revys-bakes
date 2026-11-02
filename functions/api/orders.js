import { neon } from "@neondatabase/serverless";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PHONE = /^\+63\d{10}$/;
const CATALOG = {
  classic: 90, triple: 99, chocnut: 95, ube: 99, korean: 99,
  hojicha: 99, pistachio: 99, strawberry: 99, sampler: 805, tub: 199
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function serverError() {
  return json({ error: "The orders service is temporarily unavailable. Check the Pages Function logs." }, 500);
}

function storage(env) {
  return new S3Client({
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT_URL_S3,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
    }

    const MIME_BY_EXTENSION = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      gif: "image/gif", bmp: "image/bmp", avif: "image/avif", svg: "image/svg+xml",
      heic: "image/heic", heif: "image/heif", tiff: "image/tiff", tif: "image/tiff"
    };

    function receiptType(fileOrKey) {
      const value = typeof fileOrKey === "string" ? fileOrKey : fileOrKey.type || fileOrKey.name || "";
      if (value.startsWith("image/")) return value;
      const extension = value.split(".").pop().toLowerCase();
      return MIME_BY_EXTENSION[extension] || "application/octet-stream";
    }
  });
}

export async function onRequestPost({ request, env }) {
  const sql = neon(env.DATABASE_URL);
  const form = await request.formData();
  const proof = form.get("paymentProof");
  let order;
  try { order = JSON.parse(form.get("order") || ""); } catch { return json({ error: "Invalid order payload" }, 400); }
  if (!order?.customer?.name || !PHONE.test(order.customer.phone) || !order.customer.pickupDetails || !order.customer.time) return json({ error: "Invalid customer details" }, 400);
  if (!(proof instanceof File) || (!proof.type.startsWith("image/") && receiptType(proof) === "application/octet-stream") || proof.size === 0 || proof.size > MAX_PROOF_BYTES) return json({ error: "Please attach an image receipt up to 5MB" }, 400);
  if (!Array.isArray(order.items) || !order.items.length) return json({ error: "Invalid cart" }, 400);
  const total = order.items.reduce((sum, item) => {
    if (!CATALOG[item.id] || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return NaN;
    return sum + CATALOG[item.id] * item.quantity;
  }, 0);
  if (!Number.isSafeInteger(total) || total < 1) return json({ error: "Invalid cart" }, 400);
  const id = crypto.randomUUID();
  const proofType = receiptType(proof);
  const proofExtension = proof.name.includes(".") ? proof.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : proofType.split("/")[1];
  const proofKey = `receipts/${id}.${proofExtension || "img"}`;
  await storage(env).send(new PutObjectCommand({
    Bucket: env.OBJECT_STORAGE_BUCKET || "assets",
    Key: proofKey,
    Body: await proof.arrayBuffer(),
    ContentType: proofType
  }));
  await sql`INSERT INTO orders (id, created_at, customer_name, customer_phone, pickup_details, pickup_time, items_json, total, payment_proof_key) VALUES (${id}, ${new Date().toISOString()}, ${order.customer.name.trim()}, ${order.customer.phone}, ${order.customer.pickupDetails.trim()}, ${order.customer.time}, ${JSON.stringify(order.items)}, ${total}, ${proofKey})`;
  return json({ id, status: "pending" }, 201);
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${env.OWNER_API_TOKEN}`) return json({ error: "Unauthorized" }, 401);
  try {
    const receiptId = new URL(request.url).searchParams.get("receipt");
    if (receiptId) {
      if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return json({ error: "Invalid receipt id" }, 400);
      const sql = neon(env.DATABASE_URL);
      const rows = await sql`SELECT payment_proof_key FROM orders WHERE id = ${receiptId} LIMIT 1`;
      if (!rows.length) return json({ error: "Receipt not found" }, 404);
      const object = await storage(env).send(new GetObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET || "assets", Key: rows[0].payment_proof_key }));
      const body = object.Body;
      if (!body) return json({ error: "Receipt data is unavailable" }, 502);
      const bytes = typeof body.transformToByteArray === "function"
        ? await body.transformToByteArray()
        : await new Response(body).arrayBuffer();
      const contentType = object.ContentType?.startsWith("image/") ? object.ContentType : receiptType(rows[0].payment_proof_key);
      return new Response(bytes, { headers: { "content-type": contentType, "cache-control": "private, no-store" } });
    }
    const sql = neon(env.DATABASE_URL);
    const orders = await sql`SELECT id, created_at, status, customer_name, customer_phone, pickup_details, pickup_time, items_json, total FROM orders ORDER BY created_at DESC LIMIT 200`;
    return json({ orders });
  } catch (error) {
    console.error("Owner orders query failed", error);
    return serverError();
  }
}
