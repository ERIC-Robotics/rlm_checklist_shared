# Trial SOP Checklist

Sectioned Trial SOP checklist web app with **local-first autosave**, **multi-trial resume**, and **exports (JSON + CSV)**.

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
- **Autosave** (local-first) so work isn’t lost if the tab is closed
- **Multiple trials** per device/browser (each trial has its own `trialId`)
- Resume via URL: `/form?trialId=...`
- **Exports**: JSON + Excel-friendly CSV
- **Login** via employee code (verified against a local SQLite database)
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
- SQLite (`better-sqlite3`) — employee verification

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- SQLite (`better-sqlite3` is included as a dependency)

### Install

```bash
npm ci
```

### Set up Employee Database

The app verifies employee codes against a local SQLite database. Seed it with sample employees:

```bash
node scripts/seed-employees.js
```

This creates `data/employees.db` with a set of test employee codes.

### Run (dev)

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/login` — enter a valid employee code to access the form.

## Usage

### Login

Open `/login` and enter your employee code. The code is verified server-side against the SQLite database. Successful login stores your employee info locally for the session.

### Start / Resume a Trial

Open the form at `/form`.

- Click **Trials** to create a new trial, open a saved trial, rename a trial, copy a resume link, or delete a trial (device-local).
- Set a **version / robot name** and **custom Trial ID** via the header inputs.
- Click the trial title to rename it inline.

### Trial History

Open `/history` to browse all local trials with search/filter.

### Reset / Export

- **Reset** clears the current trial's answers (keeps the same `trialId`).
- **Export Excel** downloads a CSV (UTF-8 BOM).
- **Export JSON (draft)** — snapshot without validation.
- **Export JSON (submission)** — validates required questions, "No" notes, and edited time reasons before exporting.

### Blocking Issues

Before submission, the app validates:
- All required questions are answered.
- "No" responses include a required note.
- Edited time entries include a required change reason.
Blocking issues are shown in a toast; submission is prevented until resolved.

## Data Persistence Model

- Trial data is stored locally in the browser (LocalStorage).
- LocalStorage is **per device + per browser profile**.
- Clearing site data removes saved trials.
- Employee codes are verified server-side via a local SQLite database (`data/employees.db`).

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build (`NEXT_USE_WEBPACK=1`)
- `npm start` — run production server
- `npm run lint` — run ESLint
- `node scripts/seed-employees.js` — seed employee database

## Project Structure

- `app/page.js` — root route (redirects to `/login`)
- `app/layout.js` — root layout (AuthProvider wrapper, font loading)
- `app/globals.css` — global stylesheet
- `app/login/page.js` / `LoginClient.jsx` — login route (employee code entry)
- `app/form/page.js` / `FormClient.jsx` / `ProtectedForm.jsx` — checklist form route (auth-protected)
- `app/history/page.js` / `HistoryClient.jsx` — trial history route with search/filter
- `app/select/page.js` — legacy redirect to `/form`
- `app/api/verify-employee/route.js` — employee code verification API (SQLite)
- `app/components/ChecklistApp.jsx` — checklist UI + autosave + exports + trial switcher
- `app/components/AuthProvider.jsx` — auth context (employee code login via API)
- `lib/checklistData.js` — 105 questions across 5 sections, all question type definitions
- `lib/checklistStorage.js` — trial persistence helpers
- `lib/db.js` — SQLite database connection module
- `scripts/seed-employees.js` — employee database seeder
- `data/employees.db` — SQLite employee database (generated)
- `public/demo1.png` … `public/demo7.png` — README screenshots

## Deployment

```bash
npm ci
npm run build
npm start
```

## License

Private / internal project (update if you intend to open source).
