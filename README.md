# IMAP Permalink Server

Node.js application with React, TypeScript, Neon Auth, Neon Postgres and live IMAP access.

Users can:

- sign up and log in
- register IMAP mailboxes
- browse inbox threads
- create public permalinks for emails
- protect permalinks with an optional 4-digit PIN
- set an optional expiration date

Permalinks store a snapshot of the mail body when they are created. Public permalink views are rendered from that stored snapshot and do not depend on the mail still existing in IMAP.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify
- Auth: Neon Auth
- Database: Neon Postgres
- Mail access: IMAP via `imapflow`

## Local `.env`

Use a local `.env` like this:

```env
VITE_NEON_AUTH_URL=https://your-branch.neonauth.<region>.aws.neon.tech/neondb/auth
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
APP_CRYPTO_SECRET=replace-with-a-long-random-secret
```

Notes:

- `VITE_NEON_AUTH_URL` is used by the frontend for Neon Auth.
- `DATABASE_URL` is used by the Node.js server for direct Postgres access.
- `APP_CRYPTO_SECRET` is used to encrypt stored IMAP passwords.

## What To Get From Neon

From Neon you need:

1. `Auth URL`
This is the Neon Auth project URL and goes into:

```env
VITE_NEON_AUTH_URL=...
```

2. `Postgres connection string`
Use the normal connection string from Neon and put it into:

```env
DATABASE_URL=...
```

Use the direct Postgres connection string for the server. The app no longer depends on Neon Data API for server-side reads and writes.

## Database setup

Run this SQL once in Neon:

[src/database/schema.sql](/Users/ralfw/Repositories/08%20Vibe%20Coding/IMAP%20Permalink%20Server/src/database/schema.sql)

The SQL file is current.

It creates and updates:

- `public.profiles`
- `public.mailboxes`
- `public.permalinks`

The important columns for permalink snapshots are:

- `from_label`
- `to_label`
- `snippet`
- `body`

## Neon Auth configuration

In Neon Auth, add your app origin as a trusted domain.

Important:

- enter the exact origin
- do not add a trailing slash

Correct:

```text
https://your-app.onrender.com
```

Incorrect:

```text
https://your-app.onrender.com/
```

If the trailing slash is present, Neon Auth login can fail with `403 Forbidden`.

For local development, keep localhost enabled as well.

## Local development

Install dependencies:

```bash
npm install
```

Start frontend and backend together:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.
The backend runs locally and the frontend talks to it via relative `/api/...` requests.

## Production build

Build frontend and backend:

```bash
npm run build
```

Start the production server:

```bash
node dist-server/index.js
```

The server delivers:

- the API under `/api/*`
- the built frontend from `dist/`

## Render deployment

Use a `Web Service`.

Recommended settings:

- Root Directory: leave empty
- Build Command: `npm install --ignore-scripts && npm run build`
- Start Command: `node dist-server/index.js`

Environment variables on Render:

```env
VITE_NEON_AUTH_URL=...
DATABASE_URL=...
APP_CRYPTO_SECRET=...
```

Why `--ignore-scripts`:

- a transitive dependency can try to install a native Sentry profiling binary
- that can fail in hosted build environments
- the app does not need that binary

## Runtime checklist

After deployment, test these flows on the live URL:

- login
- loading inbox contents
- creating a permalink
- deleting a permalink
- opening a permalink without login
- opening a PIN-protected permalink
- opening a permalink after deleting or moving the original email
