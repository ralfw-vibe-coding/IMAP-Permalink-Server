# IMAP Permalink Server

Node.js application with React, TypeScript, OTP auth, Neon Postgres and live IMAP access.

Users can:

- log in with an email OTP
- register IMAP mailboxes
- browse inbox threads
- create public permalinks for emails
- protect permalinks with an optional 4-digit PIN
- set an optional expiration date

Permalinks store a snapshot of the mail body when they are created. Public permalink views are rendered from that stored snapshot and do not depend on the mail still existing in IMAP.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify
- Auth: custom email OTP with Resend
- Database: Neon Postgres
- Mail access: IMAP via `imapflow`

## Local `.env`

Use a local `.env` like this:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
APP_CRYPTO_SECRET=replace-with-a-long-random-secret
AUTH_SESSION_SECRET=replace-with-another-long-random-secret
AUTH_SECRET_OTP=optional-alphanumeric-master-code
RESEND_API_KEY=re_your_api_key
AUTH_FROM_EMAIL=Mail Thread Vault <login@example.com>
```

Notes:

- `DATABASE_URL` is used by the Node.js server for direct Postgres access.
- `APP_CRYPTO_SECRET` is used to encrypt stored IMAP passwords.
- `AUTH_SESSION_SECRET` is used to HMAC-hash OTPs and session tokens before storing them.
- `AUTH_SECRET_OTP` is an optional alphanumeric master OTP that is always accepted.
- `RESEND_API_KEY` is used to send login OTP emails.
- `AUTH_FROM_EMAIL` is the verified Resend sender address.

## What To Get From Neon

From Neon you need:

1. `Postgres connection string`
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

- `public.auth_users`
- `public.auth_otps`
- `public.auth_sessions`
- `public.profiles`
- `public.mailboxes`
- `public.permalinks`
- `public.imap_jobs`

The important columns for permalink snapshots are:

- `from_label`
- `to_label`
- `snippet`
- `body`

## Auth flow

Login uses a passwordless OTP flow. There is no separate signup; the first successful login creates the user profile:

1. the user enters an email address
2. the server stores a hashed 6-digit OTP that expires after 10 minutes
3. the server sends the OTP through Resend
4. after successful verification, the server creates an opaque bearer token
5. the token is valid for 4 weeks and is stored hashed in `public.auth_sessions`

If `AUTH_SECRET_OTP` is set, that alphanumeric code is accepted as a permanent OTP for any email address. Keep it secret and rotate it like an admin credential.

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
The backend runs locally on `http://localhost:8787` and Vite proxies relative `/api/...` requests to it. Do not set `VITE_API_BASE_URL` for local development.

Local development does not use Netlify Functions. Run `npm run dev` to start both the Vite frontend and the local Fastify backend.

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
DATABASE_URL=...
APP_CRYPTO_SECRET=...
AUTH_SESSION_SECRET=...
AUTH_SECRET_OTP=...
RESEND_API_KEY=...
AUTH_FROM_EMAIL=...
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

## Netlify direction

The frontend and backend can be deployed to Netlify. `netlify.toml` contains the Vite SPA and Functions configuration. API routes under `/api/*` are handled by `netlify/functions/api.ts`.

For Netlify deployment, keep `VITE_API_BASE_URL` unset so the browser calls `/api/...` on the same Netlify site. Neon remains the database in every environment.

IMAP access is modeled as asynchronous jobs because mailbox access can be slow. The UI starts an IMAP job, polls `/api/imap-jobs/:jobId`, and updates itself when the job is completed or failed. The database table `public.imap_jobs` stores the job status, payload, result and error message.

The shared job runner lives in `server/imap-jobs.ts`. Locally, Fastify starts the runner in-process after creating a job. On Netlify, `netlify/functions/api.ts` creates jobs and invokes `netlify/functions/process-imap-job-background.ts`, so long-running IMAP work runs in a Netlify Background Function instead of a synchronous request.
