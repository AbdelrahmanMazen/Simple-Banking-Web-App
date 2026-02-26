## SimpleBank

Lightweight demo banking dashboard with accounts, deposits, withdrawals, and recent transactions. Built with Next.js App Router, Tailwind CSS, Prisma, and SQLite (ideal for small user counts). Includes email/password sign-up/sign-in and session cookies.

### Features
- Accounts with running balance and transaction history
- Deposit and withdrawal flows with validation (no overdrafts) and deposit source selection (Mobile Wallet or Credit/Debit Card)
- Send money to any account by typing its name (records transfer in both accounts)
- Email/password signup & signin with cookie-based sessions (landing page is `/signin` with a link to `/signup`)
- Email verification with 6-digit codes (SMTP via Nodemailer; logs to console if not configured)
- Admin overview at `/admin` (first registered user becomes admin) with user/account/transaction counts and recent activity
- Domain admin tools (optional `DOMAIN_ADMIN_EMAIL`) to edit balances, names, ownership, and dates
- SQLite persistence via Prisma
- Modern glassmorphic UI with subtle animation accents

### Stack
- Next.js (App Router, TypeScript)
- Tailwind CSS v4
- Prisma + SQLite
- Lucide icons

### Setup
1) Install dependencies
```bash
npm install
```
2) Apply database migrations
```bash
npx prisma migrate dev
```
3) Run the app
```bash
npm run dev
```
4) Open http://localhost:3000 (redirects to `/signin` when logged out)

### Notes
- Data is stored in `prisma/dev.db` (SQLite) and is fine for local/small demos.
- Server actions handle deposit/withdraw and automatically revalidate the dashboard.
- The first user to sign up is granted admin rights; admins can access `/admin` for an overview.
- Set `DOMAIN_ADMIN_EMAIL` to restrict management actions to a single email; otherwise any admin may run them.
- New users get a default "Primary" account automatically so they can transact right away.
- Email verification uses SMTP if `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM` are set; otherwise the code is logged to the console. Example: Gmail SMTP with an app password.
