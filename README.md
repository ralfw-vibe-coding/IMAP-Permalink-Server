# IMAP Permalink Server

Node.js application with React, TypeScript, Neon Auth, Neon Postgres and live IMAP access.

Users can:

- sign up and log in
- register IMAP mailboxes
- browse inbox threads
- create public permalinks for emails
- optionally protect permalinks with a 4-digit PIN
- optionally set an expiration date

The app reads email content live from IMAP when a permalink is opened. Email bodies are not archived in the database.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify
- Auth + persistence: Neon Auth + Neon Postgres / Data API
- Mail access: IMAP via `imapflow`

## Environment variables

Create a `.env` file for local development:

```env
VITE_NEON_AUTH_URL=https://your-branch.neonauth.<region>.aws.neon.tech/neondb/auth
VITE_NEON_DATA_API_URL=https://your-branch.apirest.<region>.aws.neon.tech/neondb/rest/v1
APP_CRYPTO_SECRET=replace-with-a-long-random-secret
```

## Local development

Install dependencies:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the local Fastify server.

## Production build

Build frontend and backend:

```bash
npm run build
```

Start the production server:

```bash
node dist-server/index.js
```

The production server serves both:

- the API under `/api/*`
- the built frontend from `dist/`

## Database setup

Run the SQL from:

[src/database/schema.sql](/Users/ralfw/Repositories/08%20Vibe%20Coding/IMAP%20Permalink%20Server/src/database/schema.sql)

After applying schema changes in Neon, refresh the schema cache.

## Neon Auth configuration

In Neon Auth, add your application origins as trusted domains.

Important:

- enter the exact origin
- do not add a trailing slash

Correct:

```text
https://imap-permalink-server.ralfw-deno.deno.net
```

Incorrect:

```text
https://imap-permalink-server.ralfw-deno.deno.net/
```

If the trailing slash is present, Neon Auth may reject login requests with `403 Forbidden`.

For local development, keep `localhost` enabled as well.

## Deno Deploy notes

If you deploy this Node.js app to Deno Deploy:

- install command: `npm install --ignore-scripts`
- build command: `npm run build`
- entrypoint: `dist-server/index.js`

`--ignore-scripts` is currently needed because a transitive Sentry profiling dependency can fail during install in the deploy environment.

## Runtime checklist

After deployment, test these flows on the live URL:

- login
- loading inbox contents
- creating a permalink
- opening a permalink without login
- opening a PIN-protected permalink
- opening an expired permalink
