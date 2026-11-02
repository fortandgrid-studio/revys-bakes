# Revy's Bakes Cloudflare Pages setup

The static storefront is paired with a Pages Function at `/api/orders`. The function validates the order again on the server, stores order records in D1, and stores receipt images in a private R2 bucket.

## Required Cloudflare resources

1. Create a D1 database and run [`schema.sql`](./schema.sql).
2. Create a private R2 bucket for receipt images.
3. Bind them to the Pages project as:
   - `DB` — D1 database binding
   - `RECEIPTS` — R2 bucket binding
4. Add encrypted Pages secrets:
   - `OWNER_API_TOKEN` — a long random token used only by the owner console
   - `PUBLIC_SITE_ORIGIN` — the exact deployed origin, for example `https://revysbakes.pages.dev`

The owner console is [`owner.html`](./owner.html). It keeps the token in memory only and sends it over HTTPS as a bearer token. Do not put `OWNER_API_TOKEN` in `app.js`, HTML, public environment variables, or source control.

## Deployment

Deploy the folder as a Cloudflare Pages project with Pages Functions enabled. The customer form posts `multipart/form-data` to `/api/orders`; no receipt image is sent to a third-party service. The API rejects invalid `+63##########` numbers, unavailable client-side totals are not trusted as authorization, and receipt files are limited to JPG, PNG, or WebP up to 5 MB.

For stronger owner authentication than a shared token, put `/owner.html` behind Cloudflare Access and replace the bearer check with an Access service-token or JWT check. The current API token is a secure baseline only when it is long, rotated, stored as a Pages secret, and never shared with customers.
