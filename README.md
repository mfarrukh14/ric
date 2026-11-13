# RIC e-Tender

E-procurement for the Rawalpindi Institute of Cardiology: departments raise demands,
HODs and the store review them, the purchase department turns them into tenders,
committees vet and evaluate, suppliers bid, and awards and purchase orders follow.

| Folder | What it is |
| --- | --- |
| `ricb/` | API: Node 22.13+, Express 5, SQL Server (schema `Eproc`) with a local SQLite fallback |
| `ricf/` | Web app: React 19, Vite, Tailwind CSS 4 |
| `ricf/eprocf/` | Committed production build of the web app |

## Run it

```powershell
# API (http://localhost:5000)
cd ricb
copy .env.example .env      # then fill in the database, JWT secret, email and finance token
npm install
npm run dev                 # or: npm start

# Web app (http://localhost:5100)
cd ricf
npm install
npm run dev
```

The web app talks to port 5000 on whichever host served it. Point it elsewhere with
`VITE_EPROC_API_URL` (and `VITE_FINANCE_API_URL` / `VITE_FINANCE_FRONTEND_URL` for the
Finance hand-off). `npm run build` writes `ricf/dist`; `npx vite build --outDir eprocf`
refreshes the committed build.

### Database

`DB_CLIENT=auto` (the default) uses SQL Server when it is configured and reachable at
startup, and otherwise the local SQLite file `ricb/database.sqlite` (Node's built-in
`node:sqlite`, no extra install). The choice holds until the next restart, so writes never
split between the two. `DB_CLIENT=mssql` or `sqlite` forces one. `GET /api/health` reports
which one is in use.

The schema lives in `ricb/src/db/schema.js`, written once in SQLite syntax and translated
for SQL Server. Every start creates missing tables, adds missing columns and seeds
reference data, so an older database (either kind) catches up on its own. Set
`EMAIL_DISABLED=true` when testing against a local copy so suppliers are not emailed.

### Configuration (`ricb/.env`)

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs sessions. Required; the server refuses to start without it. |
| `DB_CLIENT`, `SQLITE_FILE` | Which database to use (see above) and where the SQLite file is. |
| `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD` | SQL Server. Required when `DB_CLIENT=mssql`. |
| `HMS_STOCK_DB_*` | Read-only HMS inventory lookups during store fulfilment. |
| `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM_NAME`, `EMAIL_FROM_EMAIL` | Outgoing mail (Gmail app password). |
| `EMAIL_DISABLED` | `true` logs emails instead of sending them. |
| `FINANCE_CALLBACK_TOKEN` | Shared secret the Finance module sends as `X-Finance-Token`, both for the award callback and for `GET /api/purchase-orders/public`. |
| `CORS_ORIGINS` | Optional comma-separated list of allowed browser origins. |
| `SUPERADMIN_PASSWORD` | Optional password for the superadmin created on first start (default `superadmin123`; change it). |

## How access works

- **Staff** sign in with a username from the administrator; **suppliers** register
  themselves and are approved by the Supplier Evaluation Committee.
- Every API route states who may call it: a staff role (purchase, store, an HOD, a
  committee; `ricb/src/middleware/roles.js`), an approved supplier, the superadmin, or the
  Finance module (`ricb/src/middleware/auth.js`). Suppliers can sign in before approval,
  but only to finish their application.
- Two-factor sign-in is a two-step exchange: the password step returns a five-minute
  challenge, and only that challenge plus a valid code yields a session. Sign-in, OTP and
  2FA endpoints are rate limited.
- What a staff member sees in the sidebar follows from their department, committee and
  HOD flag (`ricf/src/app/navigation.js`).

## Design system

The interface follows one set of tokens (`ricf/src/styles/tokens.css`): neutral greys,
one crimson accent from the RIC emblem, Atkinson Hyperlegible, flat hairline panels, and
light and dark themes. Building blocks live in `ricf/src/ui`. Older screens that still use
raw Tailwind classes pick up the same palette and dark mode through
`ricf/src/styles/palette.css` and `legacy.css`, so new work should prefer the `ui`
components.

Interface sounds are synthesised in the browser (`ricf/src/lib/sound.js`) and can be
muted from the sidebar.
