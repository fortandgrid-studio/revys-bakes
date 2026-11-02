# Revy's Bakes: launch guide

This guide takes you from the current GitHub repository to a live Cloudflare Pages site with:

- Cloudflare Pages for the website
- Neon Postgres for orders
- Neon Object Storage for private payment receipts
- A token-protected owner order dashboard

Use the steps in order. Do not configure Cloudflare R2 or D1; this project uses Neon instead.

## What is already done

The Neon project is already linked and deployed:

```text
Project: round-shape-60053607
Branch: production
Services: Postgres, Object Storage
```

The GitHub repository is:

```text
https://github.com/fortandgrid-studio/revys-bakes
```

## Step 1: Create the Cloudflare Pages project

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **Workers & Pages**.
3. Click **Create application**.
4. Choose **Pages**.
5. Choose **Connect to Git**.
6. Connect GitHub and select:

   ```text
   fortandgrid-studio/revys-bakes
   ```

7. Configure the build settings exactly as follows:

   ```text
   Framework preset: None
   Build command: npm run build
   Build output directory: /
   Root directory: /
   Deploy command: leave empty
   ```

8. Click **Save and Deploy**.

### Important: do not use the Workers deploy command

Do **not** enter this:

```text
npx wrangler deploy
```

That command is for Cloudflare Workers. This repository is a Cloudflare Pages project with a `functions/` directory. Pages will deploy the function automatically from:

```text
functions/api/orders.js
```

The build should end with:

```text
Static build validation passed for 6 files.
```

Copy the Pages URL after deployment. It will look similar to:

```text
https://revys-bakes.pages.dev
```

## Step 2: Get the Neon variables

The Neon CLI created a local file named:

```text
.env.local
```

It contains these values:

```text
DATABASE_URL
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ENDPOINT_URL_S3
AWS_REGION
```

Never commit `.env.local`, paste it into a public issue, or send it to customers.

## Step 3: Add Neon variables to Cloudflare

1. In Cloudflare, open the `revys-bakes` Pages project.
2. Open **Settings**.
3. Open **Environment variables**.
4. Under **Production**, click **Add variable**.
5. Add each variable below.
6. Mark credential values as **Encrypted** or **Secret** when Cloudflare offers that option.

Add these values from `.env.local`:

| Variable name | Value |
|---|---|
| `DATABASE_URL` | Copy the exact `DATABASE_URL` value |
| `AWS_ACCESS_KEY_ID` | Copy the exact `AWS_ACCESS_KEY_ID` value |
| `AWS_SECRET_ACCESS_KEY` | Copy the exact `AWS_SECRET_ACCESS_KEY` value |
| `AWS_ENDPOINT_URL_S3` | Copy the exact `AWS_ENDPOINT_URL_S3` value |
| `AWS_REGION` | Copy the exact `AWS_REGION` value |

Add these values manually:

| Variable name | Value |
|---|---|
| `OBJECT_STORAGE_BUCKET` | `assets` |
| `PUBLIC_SITE_ORIGIN` | Your exact Pages URL, for example `https://revys-bakes.pages.dev` |
| `OWNER_API_TOKEN` | A new long random secret; see below |

Generate an owner token in PowerShell with:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Copy the generated result into the `OWNER_API_TOKEN` secret. Do not put this token in `owner.js`, HTML, or any public environment variable.

## Step 4: Create the production database table

1. Open the Neon Console.
2. Select project `round-shape-60053607`.
3. Select branch `production`.
4. Open **SQL Editor**.
5. Open [`schema.sql`](./schema.sql) from this repository.
6. Copy the full SQL file.
7. Paste it into the SQL Editor.
8. Run it.
9. Confirm that the `orders` table exists.

The table stores customer details, order items, totals, status, and the private receipt object key.

## Step 5: Redeploy after adding variables

After adding the Cloudflare variables:

1. Open **Deployments** in the Pages project.
2. Find the latest deployment.
3. Click **Retry deployment**.

Or push a new commit to `main`. Cloudflare will automatically rebuild and deploy.

## Step 6: Test the customer storefront

Open your Pages URL and test the following:

1. Add a cookie to the cart.
2. Open the cart.
3. Continue to checkout.
4. Enter a phone number in this exact format:

   ```text
   +639984374171
   ```

5. Try submitting without a receipt. It must be rejected.
6. Upload a JPG, PNG, or WebP receipt under 5 MB.
7. Submit the order.

A successful order should:

- Return a success message in the storefront
- Create a row in Neon Postgres
- Store the receipt in the private Neon `assets` bucket

## Step 7: Open the owner dashboard

Open this URL:

```text
https://YOUR-PAGES-DOMAIN/owner.html
```

Replace `YOUR-PAGES-DOMAIN` with your actual Pages domain.

1. Enter the exact `OWNER_API_TOKEN` from Cloudflare. (DVrhLhrcteGHE78fPTZ0Dkh9+sd+YaSVUq0Lq/a6OJ3p5gbyg9cBfW1GHJeNIe2G)
2. Click **Open orders**.
3. Confirm that your test order appears.
4. Confirm the customer, phone, pickup details, items, total, and status are formatted correctly.

The dashboard refreshes orders every 30 seconds. It keeps the token in memory and does not save it to local storage.

### If the dashboard does not show orders

Open the browser developer tools and select **Network**. Reload the owner page and inspect:

```text
GET /api/orders
```

Use the status code to identify the problem:

| Status | Meaning | Fix |
|---|---|---|
| `401` | The token does not match `OWNER_API_TOKEN` | Copy the exact Cloudflare secret and try again |
| `404` | The Pages Function was not deployed | Confirm the project is Pages Git deployment and that `functions/api/orders.js` is in the repository |
| `500` | A production variable or Neon query failed | Check all variables in Step 3 and view **Pages → Functions → Logs** |
| Network error | Wrong site URL or deployment unavailable | Use the exact deployed Pages URL |

The owner page now displays the API status and error message instead of silently showing an empty list.

## Step 8: Protect the owner page

The API token protects the order data. Add Cloudflare Access to protect the dashboard page too:

1. Open **Zero Trust** in Cloudflare.
2. Go to **Access → Applications**.
3. Click **Add an application**.
4. Choose **Self-hosted**.
5. Add your Pages domain.
6. Protect the path:

   ```text
   /owner.html
   ```

7. Create an **Allow** policy for your own email address only.
8. Do not create an “allow everyone” policy.

Customers should use `/`. Only the owner should access `/owner.html`.

## Step 9: Optional custom domain

When ready:

1. Open the Pages project.
2. Open **Custom domains**.
3. Add your domain.
4. Update the Cloudflare variable:

   ```text
   PUBLIC_SITE_ORIGIN=https://your-real-domain.com
   ```

5. Redeploy.

## Step 10: Add basic abuse protection

Create a Cloudflare WAF/rate-limit rule for:

```text
POST /api/orders
```

A reasonable starting point is 10 requests per IP per minute. Adjust it if legitimate customers are blocked.

## Final checklist

- [ ] Pages project is connected to `fortandgrid-studio/revys-bakes`
- [ ] Build command is `npm run build`
- [ ] Deploy command is blank
- [ ] No `npx wrangler deploy` setting exists
- [ ] Neon variables are configured for Production
- [ ] `OBJECT_STORAGE_BUCKET` is `assets`
- [ ] `PUBLIC_SITE_ORIGIN` matches the live URL
- [ ] `OWNER_API_TOKEN` is configured as a secret
- [ ] `orders` table exists in Neon production
- [ ] Test order appears in the owner dashboard
- [ ] Receipt is stored in private Neon Object Storage
- [ ] `/owner.html` is protected with Cloudflare Access
- [ ] `.env.local` is not in GitHub
