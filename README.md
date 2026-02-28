## SimpleBank

Demo-friendly banking dashboard with accounts, deposits, withdrawals, transfers, and admin tools. Built on Next.js (App Router), Tailwind CSS, and Prisma with SQLite for quick local use. English and Arabic UI with a built-in demo warning and seasonal Ramadan overlay.

### Highlights

- Auth: email/password sign-up and sign-in with session cookies and 6-digit email verification codes.
- Banking flows: deposits, withdrawals (with overdraft penalties), and transfers recorded on both accounts.
- Accounts & history: running balances, recent activity, and soft-deleted audit trail for admins.
- Requests: create/accept/reject money and loan requests with due-date messaging.
- Admin: dashboard at `/admin`; first registered user becomes admin, optional domain-admin lock via `DOMAIN_ADMIN_EMAIL`.
- Localization: English/Arabic toggle persisted in cookies; Arabic uses RTL typography.
- Safety copy: persistent legal notice banner plus footer credit for Abdelrahman Mazen.
- Visuals: glassy cards, gradient backdrops, and a Ramadan overlay (auto-hides after Mar 20, 2026).

### Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS v4
- Prisma + SQLite (local dev)
- Nodemailer for email codes
- Lucide icons

### Quick Start

1. Install dependencies

```bash
npm install
```

2. Run database migrations (SQLite writes to `prisma/dev.db`)

```bash
npx prisma migrate dev
```

3. Start the dev server

```bash
npm run dev
```

4. Open http://localhost:3000 — you’ll land on `/signin` with a link to `/signup`.

### Environment

Copy `.env.example` if present or set these variables as needed:

```
# Email verification (optional; falls back to logging codes to the console)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Restrict destructive admin tools to one email (optional)
DOMAIN_ADMIN_EMAIL=
```

### Usage Notes

- First signed-up user becomes admin automatically; admins can access `/admin`.
- Domain admin tools allow balance edits, renumbering accounts, and reassignment when `DOMAIN_ADMIN_EMAIL` matches the signed-in admin.
- Money requests: create, accept, or reject requests; overdue items accrue penalties.
- Transfers: typed by account or owner name; sender can overdraft and incur 5% daily penalties until repaid.
- Email codes: if SMTP isn’t configured, verification codes are logged to the server console.
- Localization: toggle language on the auth page; preference is stored in cookies.
- Ramadan overlay: displayed until Mar 20, 2026; demo legal notice banner stays visible with dismiss per session.

### Database Tips

- Inspect data: `npx prisma studio`
- Reset local DB: `npx prisma migrate reset` (clears data; use only in dev)

### Scripts

- `npm run dev` — start Next.js in development
- `npm run build` — production build
- `npm run lint` — lint the project

### Legal / Safety

SimpleBank is a demo. It is **not** connected to any real bank. Do not use real funds or share sensitive information. A legal notice banner is shown in-app to remind users.
