import { readFile, unlink } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function loadEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
}

const env = loadEnv(await readFile(".env.local", "utf8"));
const sql = neon(env.DATABASE_URL);
const statements = (await readFile("schema.sql", "utf8")).split(";").map(value => value.trim()).filter(Boolean);
for (const statement of statements) await sql.query(statement);
const id = `verify-${crypto.randomUUID()}`;
const key = `verification/${id}.txt`;
const client = new S3Client({ region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT_URL_S3, forcePathStyle: true, credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } });
try {
  await sql`INSERT INTO orders (id, customer_name, customer_phone, pickup_details, pickup_time, items_json, total, payment_proof_key) VALUES (${id}, 'Neon verification', '+639984374171', 'Automated verification', 'Test slot', ${JSON.stringify([{ id: "classic", quantity: 1 }])}, 90, ${key})`;
  const result = await sql`SELECT id, total FROM orders WHERE id = ${id}`;
  if (result.length !== 1 || result[0].total !== 90) throw new Error("Postgres verification failed");
  await client.send(new PutObjectCommand({ Bucket: "assets", Key: key, Body: "Neon object-storage verification", ContentType: "text/plain" }));
  const object = await client.send(new GetObjectCommand({ Bucket: "assets", Key: key }));
  if (!object.Body) throw new Error("Object Storage verification failed");
  console.log("Neon Postgres: connected, migrated, inserted, and read a verification order.");
  console.log("Neon Object Storage: uploaded and read a verification object.");
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: "assets", Key: key }));
  await sql`DELETE FROM orders WHERE id = ${id}`;
  console.log("Verification data cleaned up.");
}
