# The Project Analyst Co. — Website

A working website with real client accounts and a SadaPay manual-payment flow.

## What's inside
- `index.html` — the public site (hero, services, process, embedded audit form, pricing wall, login)
- `server.js` — the backend: real signup/login (hashed passwords, real sessions via secure cookies), and payment-claim handling. No external packages needed — pure Node.js.
- `admin.html` — a private page (`/admin`) where you review and verify SadaPay payments
- `data/` — created automatically on first run; stores users, sessions, and payments as JSON files

## 1. Add your real IBAN
Open `server.js` and find this block near the top:

```js
const SADAPAY_ACCOUNT_TITLE = process.env.SADAPAY_ACCOUNT_TITLE || 'The Project Analyst Co.';
const SADAPAY_IBAN = process.env.SADAPAY_IBAN || 'PASTE-YOUR-IBAN-HERE';
```

Replace `'PASTE-YOUR-IBAN-HERE'` with your real SadaPay IBAN. (Better: set it as an environment variable on your host instead of editing the file — see step 3.)

Also change the admin key from the default:
```js
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';
```
Pick a long, private password only you know — this protects `/admin`.

## 2. Run it locally to test
Requires [Node.js](https://nodejs.org) (v18+). No `npm install` needed.

```bash
node server.js
```

Visit `http://localhost:3000` — sign up, sign in, request the pricing unlock, and try "Pay via SadaPay". Visit `http://localhost:3000/admin` to see and verify payment claims.

## 3. Deploy it for real
Any Node.js host works. Easiest free/cheap options: **Render** or **Railway**.

On Render:
1. Push these files to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: (leave blank) · Start command: `node server.js`
4. Add environment variables under "Environment": `ADMIN_KEY`, `SADAPAY_ACCOUNT_TITLE`, `SADAPAY_IBAN`.
5. Deploy — you'll get a live URL like `https://yourproject.onrender.com`.

Point your domain (e.g. `theprojectanalystco.com`) at that URL via a CNAME record, and you're live.

## Notes
- **Data storage**: the free tiers of Render/Railway reset the filesystem on redeploy. If you expect real signup volume, migrate `data/*.json` reads/writes to a real database (Postgres via Render's free tier, or SQLite on a persistent disk) — the API routes won't need to change, just the storage functions at the top of `server.js`.
- **Payments**: SadaPay doesn't offer a public API for individual accounts, so this is a manual-verification flow by design: clients log what they sent, you confirm it landed in your SadaPay account, then click "Mark verified" on `/admin`. If you ever want automatic verification, that requires a business/merchant account with a payment gateway (SadaPay for Business, or an aggregator like PayFast/JazzCash that supports webhooks).
- **Email notifications**: right now, verifying a payment or a new signup doesn't email anyone. If you want an alert (e.g. to your Gmail) when a new audit request, signup, or payment claim comes in, that's a small addition — just say the word.
