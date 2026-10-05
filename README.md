# Trial SOP Checklist

Sectioned Trial SOP checklist web app with **local-first autosave**, **multi-trial resume**, and **exports (JSON and Excel)**.

## Demo (Screenshots)

<table>
  <tr>
    <td><img src="public/demo1.png" alt="Demo 1" width="420" /></td>
    <td><img src="public/demo2.png" alt="Demo 2" width="420" /></td>
  </tr>
  <tr>
    <td><img src="public/demo3.png" alt="Demo 3" width="420" /></td>
    <td><img src="public/demo4.png" alt="Demo 4" width="420" /></td>
  </tr>
  <tr>
    <td><img src="public/demo5.png" alt="Demo 5" width="420" /></td>
    <td><img src="public/demo6.png" alt="Demo 6" width="420" /></td>
  </tr>
  <tr>
    <td colspan="2"><img src="public/demo7.png" alt="Demo 7" width="860" /></td>
  </tr>
</table>

## Why This App

Trial data entry is often **irregular**:
- Some sections are filled in the office.
- Later sections are filled on-track at different times.
- Connectivity can be weak or intermittent.

This app is built to **retain trial state safely** so the operator can continue later without losing progress.

## Key Features

- Sectioned checklist flow with **progress** and **required** indicators
- **Autosave** to the shared database with a local browser cache
- **Shared trials and history** available to every signed-in employee
- Resume via URL: `/form?trialId=...`
- **Exports**: JSON and formatted Excel workbooks
- **Login** via employee code (verified against PostgreSQL)
- **Trial management**: create, rename, resume, delete trials
- **Version / Robot name** and **custom Trial ID** fields
- **105 questions** across 5 sections with 7 question types (text, textarea, time, date, select, yes/no with required notes, checklist with free-text)
- Time questions with **"Tap to record"** and **edit tracking** (reason required)
- **Blocking issues validation** before submission
- **Trial history** page with search/filter
- Mobile-friendly UI (collapsible actions on small screens)

## Tech Stack

- Next.js (App Router)
- React
- Neon PostgreSQL — employee verification and shared trial storage

## Getting Started

### Prerequisites

- Node.js 20.9+ (required by Next.js 16)
- A Neon PostgreSQL database (or another compatible Neon HTTP endpoint)

### Install

```bash
npm ci
```

### Configure Employee Database

Create a PostgreSQL database in the [Neon Console](https://console.neon.tech/) and copy its pooled connection string into `.env.local` as `DATABASE_URL`. Keep this connection string private. Copy `.env.example` to `.env.local` and set `AUTH_SECRET` to a new random value of at least 32 characters.

The app creates the `employees` and shared `trials` tables automatically. Add an active employee for local testing with SQL such as:

```sql
INSERT INTO employees (employee_code, name)
VALUES (UPPER('YOUR_EMPLOYEE_CODE'), 'Your Name')
ON CONFLICT (employee_code) DO UPDATE
SET name = EXCLUDED.name, is_active = 1;
```

Do not use the sample employee codes from `npm run seed:employees` in a company deployment.

### Run (dev)

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/login` — enter an active employee code to access the form. Set both `DATABASE_URL` and `AUTH_SECRET` in `.env.local` before using login.

## Usage

### Login

Open `/login` and enter your employee code. The code is verified server-side against PostgreSQL. The server issues a signed, HTTP-only session cookie; the browser's local employee cache is not used to authorize API requests.

### Start / Resume a Trial

Open the form at `/form`.

- Click **Trials** to create a new trial, open a saved trial, rename a trial, copy a resume link, or delete a shared trial.
- Set a **version / robot name** and **custom Trial ID** via the header inputs.
- Click the trial title to rename it inline.

### Trial History

Open `/history` to browse all trials shared by signed-in employees, with search/filter.

### Reset / Export

- **Reset** clears the current trial's answers (keeps the same `trialId`).
- **Export Excel** downloads a formatted `.xlsx` workbook for the filtered history (or for an individual trial). The workbook includes a separate Trial Agenda sheet with internal activity and external report rows.
- Trial History displays the internal and external agenda entries as readable tables.
- **Export JSON (draft)** — snapshot without validation.
- **Export JSON (submission)** — validates required questions, "No" notes, and edited time reasons before exporting.

### Blocking Issues

Before submission, the app validates:
- All required questions are answered.
- "No" responses include a required note.
- Edited time entries include a required change reason.
Blocking issues are shown in a toast; submission is prevented until resolved.

## Emailing the Trial PDF on Submit

Clicking **Submit Trial** now generates a PDF report of the whole trial
(server-side, via `pdfkit`) and emails it as an attachment (via `nodemailer`)
instead of the old "download JSON + hope a PDF shows up later" placeholder.

Setup:

1. Copy `.env.example` to `.env.local`.
2. Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
   and `MAIL_TO`. For Gmail, `SMTP_USER`/`SMTP_PASS` must be a Google
   **App Password** — your normal login password will not work.
3. Restart the dev/production server so the new env vars are picked up.

If email isn't configured (or the SMTP server rejects the send), the app
does **not** lose the submission: it shows the exact reason in the toast
(e.g. "Email is not configured on the server…", "Email login was
rejected…") and automatically downloads the generated PDF locally so it
can be sent manually.

Relevant files: `lib/generateTrialPdf.js` (PDF layout), `lib/mailer.js`
(SMTP + friendly error messages), `app/api/submit-trial/route.js` (API
route wiring the two together).

## Data Persistence Model

- The Neon PostgreSQL database is the source of truth for trials and history shared by all signed-in employees.
- Support tickets are stored in Neon PostgreSQL too, so every signed-in employee sees the same tickets. Ticket numbers are assigned by the database to avoid collisions when tickets are submitted at the same time. Tickets saved in a browser by older app versions are moved to the shared database when that browser next opens Support Tickets.
- The browser keeps a local cache to support resuming and migration of existing local trials; clearing browser data does not delete database trials.
- All signed-in employees can view, edit, and delete shared trials and tickets. Do not use this setup if trials or tickets should be private to their creator.
- Employee records, signed-session validation, trials, and support tickets are stored in Neon PostgreSQL.

## Deploying to Cloudflare Workers

This is a server-rendered Next.js app with API routes, so deploy it to
**Workers** using the OpenNext adapter; a static Pages export will not support
its login, database, and submission routes.

1. Open a terminal in this app directory (the folder containing `package.json`)
   and install the locked dependencies with `npm ci`.
2. Log in to your Cloudflare account from the CLI with `npx wrangler login`.
   This links the CLI to the account shown in the Cloudflare dashboard.
3. Add these **Worker secrets** in the Cloudflare dashboard under
   **Workers & Pages → rlm-checklist → Settings → Variables and Secrets**, or
   set them with `npx wrangler secret put <NAME>`:
   - `DATABASE_URL`: the pooled Neon PostgreSQL connection string.
   - `AUTH_SECRET`: a unique random value of at least 32 characters. Keep it
     stable across deployments or existing login sessions will be invalidated.
   - For email, also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
     `SMTP_PASS`, `MAIL_FROM`, and `MAIL_TO`. Support-ticket routing can also
     use `TEAM_LEAD_EMAILS`, `HARDWARE_LEAD_EMAIL`, and `SOFTWARE_LEAD_EMAIL`.
     Keep these private; do not commit them to source control.
4. Add active employees to the same Neon database (the SQL example in the
   Vercel deployment section below applies).
5. Test in Cloudflare's Workers runtime with `npm run preview:cloudflare`.
   Deploy with `npm run deploy:cloudflare`. The app will be available at its
   `*.workers.dev` URL; share `/form` with employees.

The deployment config is in `wrangler.jsonc` and `open-next.config.ts`.
`nodejs_compat` is enabled for the server-side PDF and email dependencies.
Cloudflare uses Worker secrets rather than `.env.local`; never put production
secrets in `wrangler.jsonc`.

## Deploying to GitHub and Vercel

1. Push this app directory (the folder containing `package.json`) to a private company GitHub repository. Do not commit `.env.local`, database URLs, SMTP passwords, or other secrets.
2. In Vercel, import the repository. If the repository contains the parent folder too, set **Root Directory** to `rlm_checklist_shared-feat-simple_login`; otherwise use the repository root.
3. Create or select a Neon PostgreSQL database. Add the following Vercel Environment Variables for Production (and Preview if needed):
   - `DATABASE_URL`: the Neon pooled connection string.
   - `AUTH_SECRET`: a unique random value of at least 32 characters (generate with `openssl rand -base64 48`). Keep the same value across deployments.
4. Add the company's employee codes to the Neon `employees` table. The app creates its tables on first server use. For each employee, run:

   ```sql
   INSERT INTO employees (employee_code, name)
   VALUES (UPPER('EMPLOYEE_CODE'), 'Employee Name')
   ON CONFLICT (employee_code) DO UPDATE
   SET name = EXCLUDED.name, is_active = 1;
   ```

   Only active employee codes in this database can sign in. Do not seed the sample codes in production.
5. If the PDF and support-ticket email features are wanted, also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`, and (optionally) `TEAM_LEAD_EMAILS`, `HARDWARE_LEAD_EMAIL`, and `SOFTWARE_LEAD_EMAIL`. Leave these out to disable email; submissions still download a PDF if sending is unavailable.
6. Deploy. After deployment, share `https://YOUR-VERCEL-DOMAIN/form` with the team. Employees sign in with the active codes added above. Their trials and Trial History are stored in the shared database.

After changing environment variables, redeploy the Vercel project so the deployment picks them up.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build (`NEXT_USE_WEBPACK=1`)
- `npm start` — run production server
- `npm run lint` — run ESLint
- `npm run seed:employees` — seed sample employees into the configured PostgreSQL database

## Project Structure

- `app/page.js` — root route (redirects to `/login`)
- `app/layout.js` — root layout (AuthProvider wrapper, font loading)
- `app/globals.css` — global stylesheet
- `app/login/page.js` / `LoginClient.jsx` — login route (employee code entry)
- `app/form/page.js` / `FormClient.jsx` / `ProtectedForm.jsx` — checklist form route (auth-protected)
- `app/history/page.js` / `HistoryClient.jsx` — trial history route with search/filter
- `app/select/page.js` — legacy redirect to `/form`
- `app/api/verify-employee/route.js` — employee code verification API (PostgreSQL)
- `app/components/ChecklistApp.jsx` — checklist UI + autosave + exports + trial switcher
- `app/components/AuthProvider.jsx` — auth context (employee code login via API)
- `lib/checklistData.js` — 105 questions across 5 sections, all question type definitions
- `lib/checklistStorage.js` — trial persistence helpers
- `lib/db.js` — Neon PostgreSQL connection and schema initialization
- `scripts/seed-employees.js` — PostgreSQL sample employee seeder
- `public/demo1.png` … `public/demo7.png` — README screenshots

## Deployment

For Vercel, import the GitHub repository with the app directory as the Root Directory if needed. Add `DATABASE_URL` and the SMTP variables from `.env.example` in the Vercel project settings. For Cloudflare Workers, follow the [Cloudflare deployment steps](#deploying-to-cloudflare-workers).

```bash
npm ci
npm run build
npm start
```

## License

Private / internal project (update if you intend to open source).
