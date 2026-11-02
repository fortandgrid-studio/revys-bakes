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

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowed = request.env?.PUBLIC_SITE_ORIGIN;
  return origin && allowed && origin === allowed ? { "access-control-allow-origin": origin } : {};
}

export async function onRequestPost({ request, env }) {
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
  await env.RECEIPTS.put(proofKey, await proof.arrayBuffer(), { httpMetadata: { contentType: proof.type } });
  await env.DB.prepare("INSERT INTO orders (id, created_at, customer_name, customer_phone, pickup_details, pickup_time, items_json, total, payment_proof_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, new Date().toISOString(), order.customer.name.trim(), order.customer.phone, order.customer.pickupDetails.trim(), order.customer.time, JSON.stringify(order.items), total, proofKey).run();
  return json({ id, status: "pending" }, 201);
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${env.OWNER_API_TOKEN}`) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare("SELECT id, created_at, status, customer_name, customer_phone, pickup_details, pickup_time, items_json, total FROM orders ORDER BY created_at DESC LIMIT 200").all();
  return json({ orders: results });
}
