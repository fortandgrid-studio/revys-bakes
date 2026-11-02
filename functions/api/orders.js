import { neon } from "@neondatabase/serverless";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

function storage(env) {
  return new S3Client({
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT_URL_S3,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
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
  if (!(proof instanceof File) || !ALLOWED_TYPES.has(proof.type) || proof.size === 0 || proof.size > MAX_PROOF_BYTES) return json({ error: "A valid receipt image up to 5MB is required" }, 400);
  if (!Array.isArray(order.items) || !order.items.length) return json({ error: "Invalid cart" }, 400);
  const total = order.items.reduce((sum, item) => {
    if (!CATALOG[item.id] || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return NaN;
    return sum + CATALOG[item.id] * item.quantity;
  }, 0);
  if (!Number.isSafeInteger(total) || total < 1) return json({ error: "Invalid cart" }, 400);
  const id = crypto.randomUUID();
  const proofKey = `receipts/${id}.${proof.type.split("/")[1]}`;
  await storage(env).send(new PutObjectCommand({
    Bucket: env.OBJECT_STORAGE_BUCKET || "assets",
    Key: proofKey,
    Body: await proof.arrayBuffer(),
    ContentType: proof.type
  }));
  await sql`INSERT INTO orders (id, created_at, customer_name, customer_phone, pickup_details, pickup_time, items_json, total, payment_proof_key) VALUES (${id}, ${new Date().toISOString()}, ${order.customer.name.trim()}, ${order.customer.phone}, ${order.customer.pickupDetails.trim()}, ${order.customer.time}, ${JSON.stringify(order.items)}, ${total}, ${proofKey})`;
  return json({ id, status: "pending" }, 201);
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${env.OWNER_API_TOKEN}`) return json({ error: "Unauthorized" }, 401);
  const sql = neon(env.DATABASE_URL);
  const orders = await sql`SELECT id, created_at, status, customer_name, customer_phone, pickup_details, pickup_time, items_json, total FROM orders ORDER BY created_at DESC LIMIT 200`;
  return json({ orders });
}
