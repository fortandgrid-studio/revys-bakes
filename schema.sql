CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  pickup_details TEXT NOT NULL,
  pickup_time TEXT NOT NULL,
  items_json JSONB NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  payment_proof_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
