# PestGuard: Service Management System (pest control)

## Quick start (Windows): 3 double-clicks

**Install first (one time):** [Node.js LTS](https://nodejs.org) and [PostgreSQL](https://www.postgresql.org/download/windows/). Remember the PostgreSQL password you set. Restart the PC.

1. **`SETUP.bat`**: run once. Asks for your PostgreSQL password, then creates the database, settings, sample data and admin portal, and opens the firewall for phones (click **Yes** when Windows asks).
2. **`START.bat`**: run whenever you use the app. Opens the admin portal at http://localhost:4000 and shows the **server address for phones**. Keep the window open.
3. **`BUILD-APK.bat`**: run once to make **`PestGuard.apk`** (uses Android Studio's tools; first build takes 10-20 minutes). Send the APK to your phone, install it, and sign in. Your PC's address is already filled in.

Sign-ins (password `demo1234`): `admin@pestguard.local`, `neha@pestguard.local` (call center), `rakesh@pestguard.local` (technician).
The phone must be on the same Wi-Fi as the PC, and START.bat must be running.

The detailed manual steps below are only needed if something goes wrong.

---

Three parts in one folder:

| Folder | What it is | Who uses it |
|---|---|---|
| `server/` | API: Node.js + Express + PostgreSQL, live updates with Socket.IO | Runs on a PC/server |
| `admin-web/` | Admin portal (React) in the browser | Admin |
| `mobile/` | Android app (Expo / React Native) | Technicians, call center staff and admins |

## Deploy online (no PC needed): Google Cloud Run + Neon

Cloud Run runs the server (API, live updates and admin website) from the `Dockerfile` and redeploys on every push to GitHub. Neon hosts the PostgreSQL database. Both have free allowances that cover testing.

1. **Neon database:** https://neon.tech → sign up with GitHub → new project `pestguard`, region **AWS Asia Pacific (Singapore)** → **Connect** → turn **Connection pooling OFF** → copy the connection string.
2. **Google Cloud:** https://console.cloud.google.com → start the free trial → create a project `pestguard`.
3. **Cloud Run → Deploy container → Connect repository** (continuous deployment with Cloud Build). Enable any APIs it asks for, sign in to GitHub, pick `PawanJadhav2005/pestguard`, branch `^main$`, build type **Dockerfile** (`/Dockerfile`).
4. Service settings: name `pestguard`, region **asia-southeast1 (Singapore)**, **Allow public access**, billing **Request-based**, min instances **0**, max instances **2**, request timeout **3600** seconds.
5. Variables (Containers → Variables & Secrets): `DATABASE_URL` (Neon string), `JWT_SECRET` (long random text), `SEED_PASSWORD` (password for the test accounts), `APP_TIMEZONE` = `Asia/Kolkata`.
6. **Create.** After about 5 minutes you get `https://pestguard-….run.app`. That is the admin website and the address for the app.
7. **Billing → Budgets & alerts:** add a small budget (e.g. ₹100) with email alerts, so you are warned before anything is charged.
8. Build the app: GitHub → **Actions → Build Android APK → Run workflow** with the Cloud Run address.

(The repo also contains `render.yaml` if you ever prefer Render instead.)

## What is built (stage 1)

**Admin portal**
- Dashboard: overdue and unassigned jobs, reports to approve, revenue by service, low stock.
- Jobs: create, assign / reassign (suggests the best technician by skill, area and workload), cancel.
- Approvals: technician treatment reports arrive **instantly** (live connection, no refresh). Approve, or return with a comment.
- **Inventory**: add items, add stock, remove stock, correct a count, full history of every change. The list **updates by itself** when anyone changes stock or when a technician's report uses chemicals. Low-stock alerts.
- Customers (with mobile numbers, admin only), Team (staff accounts, leave / active toggles), Calls & follow-ups, Service prices.

**Technician app**: today's jobs, next job card, Accept → On the way → Start treatment, treatment report (safety checklist, areas, chemicals picked from inventory with quantities, before/after photos, customer signature). Submitting the report **sends it straight to the Admin portal and deducts the chemicals from the central store** in one database transaction.

**Admin in the app**: sign in with an admin account to get Home (overdue, unassigned, reports to approve, low stock, revenue), Jobs (assign / reassign with best-match suggestion, cancel, book), Approvals (photos, signature, chemicals, approve or return), Inventory (live updates, add / remove / count stock, low-stock alert level, add items, history) and More (alerts, customers with mobile numbers, team leave toggles, calls & follow-ups, service prices). Adding staff accounts stays in the web portal.

**Call center app**: calls due, customer search (server-side, paged), customer history and AMC status, booking (price worked out from service and property type), masked calls with outcome logging and callbacks.

**Rules the server enforces (not just the screens)**
- Call center and technicians **never receive customer mobile numbers**: not in lists, search, details, jobs or call logs. Tested.
- Technicians only see and change their own jobs, and only through allowed status steps.
- One open job per customer and service (no duplicate bookings).
- A report can't use more stock than the store has. Nothing is deducted if any line fails.
- A returned report puts its stock back before the corrected report deducts again.
- Prices are saved on each job, so changing prices later doesn't rewrite history.
- Passwords hashed (bcrypt), sign-in rate limited, inputs validated, SQL parameterised, uploads checked by real file content (JPG/PNG, max 5 MB), audit log of sensitive actions.

## 1. Install once (Windows)

1. **Node.js 20 or newer**: https://nodejs.org (LTS).
2. **PostgreSQL 16**: https://www.postgresql.org/download/windows/ (remember the password you set for the `postgres` user).
3. Android: either install **Expo Go** from the Play Store on your phone, or use Android Studio (already on your PC) for an emulator / development build.

## 2. Database

Open **SQL Shell (psql)** from the Start menu, sign in as `postgres`, and run:

```sql
CREATE DATABASE pestguard;
CREATE USER pestguard_app WITH PASSWORD 'choose-a-strong-password';
GRANT CONNECT ON DATABASE pestguard TO pestguard_app;
\c pestguard
GRANT USAGE, CREATE ON SCHEMA public TO pestguard_app;
-- for automated tests only (never point tests at the real database):
CREATE DATABASE pestguard_test OWNER pestguard_app;
```

The app connects as `pestguard_app`, not as `postgres` (least privilege).

## 3. Server

```powershell
cd Documents\pestguard\server
copy .env.example .env      # then open .env and fill in DATABASE_URL and JWT_SECRET
npm install
npm run migrate             # creates the tables
npm run seed                # services, demo staff, and SAMPLE data
npm run dev                 # API on http://localhost:4000
```

- `JWT_SECRET`: any long random text (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- Demo accounts (password `demo1234`): `admin@pestguard.local`, `neha@pestguard.local` (call center), `rakesh@pestguard.local` (technician). **Change these passwords before real use** (Admin → Team, or delete the demo staff).
- Use `npm run seed -- --no-sample` instead when you're ready to load your real data.
- Run the tests: set `DATABASE_URL` to the **test** database and run `npm test`. The tests wipe that database. All 19 pass.

## 4. Admin portal

```powershell
cd Documents\pestguard\admin-web
npm install
npm run dev                 # open http://localhost:5173
```

Sign in with `admin@pestguard.local` / `demo1234`. The green **Live** dot in the top bar means instant updates are on.

## 5. Android app

1. Find your PC's Wi-Fi address: run `ipconfig` and note the **IPv4 Address** (e.g. `192.168.1.5`).
2. Allow the API through Windows Firewall (PowerShell as administrator):
   `New-NetFirewallRule -DisplayName "PestGuard API" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow`
3. Start the app:
   ```powershell
   cd Documents\pestguard\mobile
   npm install
   npx expo start
   ```
4. On your phone (same Wi-Fi), open **Expo Go** and scan the QR code. If Expo Go says the SDK version isn't supported, use `npx expo run:android` with your phone plugged in (USB debugging on) or an Android Studio emulator.
5. On the sign-in screen tap **Change** next to the server address and enter `http://<your-PC-IP>:4000`.
6. Sign in as `rakesh@pestguard.local` (technician), `neha@pestguard.local` (call center) or `admin@pestguard.local` (admin).

**Try the full flow:** technician opens the next job → Start travel → Start treatment → Fill treatment report → Submit. Watch Admin → Approvals and Admin → Inventory update on their own, on the web portal or on a second phone signed in as admin.

To make an installable APK later: `npx eas-cli@latest build -p android --profile preview` (free Expo account; cloud build).

## Importing your data later

Send me your customer and inventory files (Excel/CSV or a database export). I'll map your actual columns and write an import script that keeps your existing customer IDs (they go in `customers.ref`) and past service records (`service_history`). Nothing existing is deleted. Until then, sample rows are marked `SAMPLE-…`.

Where things go:
- Customers → `customers` (ref, name, mobile, address, area, property_type)
- Past services → `service_history` (customer, service, date, price, technician name)
- Annual contracts → `amc_contracts`
- Inventory → `inventory_items` (sku, name, category, unit, quantity, reorder level, cost)

## Masked calling (Exotel)

Calling is built but **switched off until you add an account**. While off, pressing Call shows "Calling is not set up yet… No call was placed." It never pretends a call happened.

To turn it on: sign up at exotel.com, buy a virtual number (ExoPhone), then fill `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN` and `EXOTEL_CALLER_ID` in `server/.env`, and add each staff member's phone number in Admin → Team. The staff phone rings first, then the customer. Each side sees only the company number. Charges: a monthly fee for the virtual number plus a per-minute rate. Check Exotel's current plans before choosing. Indian telecom rules (DLT/KYC) apply.

## Not done yet (next stages)

- Push notifications when the app is **closed** (Firebase). In-app alerts and live updates work now.
- SMS / WhatsApp to customers (needs a provider + DLT registration).
- Report export to Excel, password reset by email, audit log viewer.
- Deployment to the internet with HTTPS, backups and error monitoring. We'll pick the cheapest host that runs Node + PostgreSQL + WebSockets.
- Before going live, remove `"usesCleartextTraffic": true` from `mobile/app.json` (it allows plain `http://` for local testing only) and use an `https://` server address.

## Backups (do this as soon as real data is in)

```powershell
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -Fc pestguard > pestguard-backup.dump
# restore: pg_restore -U postgres -d pestguard --clean pestguard-backup.dump
```
Copy the backup file and `server\uploads\` (photos and signatures) to another drive or cloud storage.
