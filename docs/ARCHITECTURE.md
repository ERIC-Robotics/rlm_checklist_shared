# RailwayMitra Trial Checklist — Developer Architecture Document

**Version:** 1.0  
**Stack:** Next.js 16 · React 19 · Neon PostgreSQL · Cloudflare Workers · Cloudflare Email Service  

---

## 1. System Overview

RailwayMitra is a field trial management platform for ERIC Robotics. It allows field engineers to fill trial checklists, PMO to manage agendas, and leads to receive automated email summaries on trial submission.

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                      │
│                                                             │
│   Login → Select Version → Fill Checklist → Submit Trial   │
│                        ↕ fetch / REST                       │
├─────────────────────────────────────────────────────────────┤
│                  Next.js App (Cloudflare Worker)             │
│                                                             │
│   App Router  │  API Routes  │  Middleware / Session        │
├─────────────────────────────────────────────────────────────┤
│                        Data Layer                            │
│                                                             │
│   Neon PostgreSQL (employees, trials, tickets)              │
│   localStorage  (client-side trial cache)                   │
│   Cloudflare Email Service (EMAIL binding)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Folder Structure

```
app/
├── components/
│   ├── AuthProvider.jsx        ← Global auth context (login state)
│   └── ChecklistApp.jsx        ← Main checklist UI (all sections)
├── form/                       ← Protected checklist form page
├── history/                    ← Trial list / history page
├── login/                      ← Login page
├── register/approve/           ← Employee approval page
├── select/                     ← Version selector page
├── tickets/                    ← Support tickets page
├── admin/                      ← Admin panel
├── api/
│   ├── session/                ← GET current session employee
│   ├── submit-trial/           ← POST trial → send email summary
│   ├── trials/                 ← GET/PUT/DELETE trials (Neon DB)
│   ├── tickets/                ← GET/POST support tickets
│   ├── agenda-employees/       ← GET employee roster
│   ├── register/               ← POST employee self-registration
│   └── verify-employee/        ← GET verify employee code
lib/
├── checklistData.js            ← All sections, questions, defaults
├── checklistStorage.js         ← localStorage + server sync
├── db.js                       ← Neon PostgreSQL client + schema init
├── session.js                  ← HMAC session token (cookie-based)
├── mailer.js                   ← Cloudflare Email Service
├── agendaAccess.js             ← PMO role check
├── supportTickets.js           ← Ticket row mapper
├── serializeAnswer.js          ← Answer → readable string
├── generateTrialPdf.js         ← PDF generation (pdfkit)
└── aadhaarCrypto.mjs           ← AES-256 Aadhaar encryption
```

---

## 3. Core Architecture Flowcharts

### 3.1 Authentication Flow

```
User visits /form
      │
      ▼
AuthProvider checks localStorage (rm:employee:v1)
      │
      ├── Found & valid ──────────────────────► Show checklist
      │
      └── Not found
            │
            ▼
      Redirect → /login
            │
            ▼
      Enter Employee Code
            │
            ▼
      POST /api/verify-employee
            │
            ├── Valid + Active ──► Set session cookie (rm_session)
            │                      Save employee to localStorage
            │                      Redirect → /select
            │
            └── Invalid ────────► Show error
```

### 3.2 Trial Submission Flow

```
User fills checklist (Section 1 → 4)
      │
      ▼
Auto-save on every answer change
  saveTrial() → localStorage + queueRemoteTrialSave()
                              │
                              ▼ (debounced 500ms)
                    PUT /api/trials/:trialId (Neon DB)
      │
      ▼
Click "Submit Post-Trial"
      │
      ▼
submitPostTrial() in ChecklistApp.jsx
      │
      ├── 1. saveTrial() locally (submitted: true)
      │
      ├── 2. PUT /api/trials/:trialId  ← mark submitted in DB
      │         │
      │         └── Fail → show toast, STOP (don't email)
      │
      ├── 3. POST /api/submit-trial
      │         │
      │         ├── getSessionEmployee() ← verify cookie
      │         ├── formatTrialSummary() ← build email text
      │         └── sendTrialPdfEmail()  ← send via SMTP/Cloudflare
      │                   │
      │                   └── Email → TRIAL_REPORT_EMAIL
      │
      └── 4. router.push("/history")
```

### 3.3 Email Routing

```
sendTrialPdfEmail()          sendTicketEmail()
        │                           │
        ▼                           ▼
  TRIAL_REPORT_EMAIL        issueType === "hardware"?
  (vaishnavi@...)              │           │
                              Yes          No
                               │           │
                               ▼           ▼
                     HARDWARE_LEAD_EMAIL  SOFTWARE_LEAD_EMAIL
                     (sarthak, shreyas)  (kunal, pratik)
        │
        ▼
sendConfiguredEmail()
        │
        ├── Cloudflare env.EMAIL binding? ──► Cloudflare Email Service
        │
        └── Cloudflare EMAIL binding ───────► Cloudflare Email Service
```

### 3.4 Data Sync Architecture

```
Browser (localStorage)              Server (Neon PostgreSQL)
        │                                     │
        │  saveTrial()                        │
        ├──────────────────────────────────►  │
        │  queueRemoteTrialSave() 500ms        │
        │                                     │
        │  syncTrialsWithServer()             │
        │◄──────────────────────────────────  │
        │  GET /api/trials                    │
        │                                     │
        │  loadSharedTrial()                  │
        │◄──────────────────────────────────  │
        │  GET /api/trials/:trialId           │
        │                                     │
        │  deleteTrial()                      │
        ├──────────────────────────────────►  │
           DELETE /api/trials/:trialId        │
```

---

## 4. Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│  employees                                                   │
│  ─────────────────────────────────────────────────────────  │
│  id               BIGINT (PK, auto)                         │
│  employee_code    TEXT (UNIQUE)                             │
│  name             TEXT                                      │
│  designation      TEXT                                      │
│  aadhaar_ciphertext TEXT (AES-256 encrypted)               │
│  is_active        SMALLINT (1=active, 0=inactive)          │
│  created_at       TIMESTAMPTZ                               │
└─────────────────────────────────────────────────────────────┘
         │ (FK: owner_code)              │ (FK: employee_code)
         ▼                               ▼
┌──────────────────────┐    ┌──────────────────────────────────┐
│  trials              │    │  support_tickets                  │
│  ────────────────    │    │  ──────────────────────────────   │
│  trial_id  TEXT (PK) │    │  id           BIGINT (PK)        │
│  title     TEXT      │    │  ticket_id    TEXT (UNIQUE)      │
│  state     JSONB     │    │  status       TEXT               │
│  version   TEXT      │    │  raised_by    TEXT               │
│  custom_trial_id TEXT│    │  employee     TEXT               │
│  submitted BOOLEAN   │    │  employee_code TEXT (FK)         │
│  agenda_submitted    │    │  issue_type   TEXT               │
│  pre_trial_submitted │    │  date_location TEXT              │
│  owner_code TEXT(FK) │    │  description  TEXT               │
│  created_at          │    │  trial_id     TEXT               │
│  updated_at          │    │  created_at   TIMESTAMPTZ        │
└──────────────────────┘    └──────────────────────────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────────────┐
                            │  support_ticket_attachments       │
                            │  ──────────────────────────────   │
                            │  id           BIGINT (PK)        │
                            │  ticket_id    TEXT (FK)          │
                            │  filename     TEXT               │
                            │  content_type TEXT               │
                            │  content_base64 TEXT             │
                            │  size_bytes   INTEGER            │
                            └──────────────────────────────────┘
```

---

## 5. Reusable Components

### 5.1 `AuthProvider` (`app/components/AuthProvider.jsx`)

Global React context that manages employee login state.

| Export | Type | Description |
|--------|------|-------------|
| `useAuth()` | Hook | Returns `{ employee, login, logout }` |
| `AuthProvider` | Component | Wraps the entire app in `layout.js` |

**Usage:**
```jsx
const { employee, logout } = useAuth();
```

---

### 5.2 `ChecklistApp` (`app/components/ChecklistApp.jsx`)

The main checklist UI. Contains all sections, question cards, trial switcher, and submit logic.

**Key internal components:**

| Component | Description |
|-----------|-------------|
| `QuestionCard` | Renders a single question based on its `type` |
| `TimeField` | Time input with "Now" button |
| `TrialAgendaTables` | Internal + External agenda table editor |
| `EmployeeRoster` | Team member selector with Aadhaar support |
| `EmployeeSearch` | Type-ahead search for employees |
| `Section` | Renders a full checklist section with submit buttons |
| `PostTrialAgendaSummary` | Read-only agenda summary in post-trial view |
| `AcknowledgementPrintDocument` | Print-only acknowledgment letter (portal) |
| `SkeletonView` | Loading skeleton while data initializes |

**Question Types supported by `QuestionCard`:**

| Type | UI |
|------|----|
| `text` | Single line input |
| `textarea` | Multi-line input |
| `time` | Time input + Now button |
| `timeRange` | Start + End time fields |
| `date` | Date picker |
| `number` | Numeric input |
| `select` | Dropdown |
| `yesNoOther` | Yes / No / Other radio |
| `yesOther` | Yes / Other radio |
| `checklist` | Multi-checkbox group |
| `socPair` | Battery 1 + Battery 2 % inputs |
| `locationPair` | From + To location inputs |
| `agendaTable` | Full agenda table editor |
| `employeeRoster` | Team member roster |

---

### 5.3 `checklistData.js` (`lib/checklistData.js`)

Single source of truth for all checklist sections and questions.

| Export | Description |
|--------|-------------|
| `SECTIONS` | Array of all 4 sections with questions |
| `TOTAL_QUESTIONS` | Total question count (30) |
| `DEFAULT_TRIAL_AGENDA` | Default agenda activities and deliverables |
| `getChecklistSectionsForVersion(version)` | Returns sections for `"Trolly"` or `"V2.2"` |
| `getAllQuestions()` | Flat sorted array of all questions |

**Section Map:**

```
SECTIONS
├── agenda      (PMO only)   Q1–Q5   Block Date, Location, Type, Agenda, Team
├── sec2                     Q6–Q8, Q27   Pre-Trial Checklist
├── sec3                     Q9–Q25   Trial Log (times, checks)
└── sec4                     Q28, Q34, Q40, Q41   Post-Trial Checklist
```

---

### 5.4 `checklistStorage.js` (`lib/checklistStorage.js`)

Client-side storage layer. Handles localStorage + server sync.

| Export | Description |
|--------|-------------|
| `saveTrial(id, state, meta)` | Save trial locally + queue remote sync |
| `loadTrial(id)` | Load trial from localStorage |
| `listTrials()` | List all trial metadata from localStorage |
| `deleteTrial(id)` | Delete locally + DELETE from server |
| `syncTrialsWithServer()` | Merge local + remote trials |
| `loadSharedTrial(id)` | Fetch trial from server, cache locally |
| `getActiveTrialId()` | Get current active trial ID |
| `setActiveTrialId(id)` | Set current active trial ID |
| `ensureActiveTrialId()` | Get or create active trial ID |
| `upsertTrialMeta(meta)` | Update trial metadata in index |

---

### 5.5 `session.js` (`lib/session.js`)

Cookie-based HMAC session management. No JWT library dependency.

| Export | Description |
|--------|-------------|
| `createSessionToken(employee)` | Create signed session token |
| `getSessionEmployee(request)` | Verify cookie → return employee from DB |
| `sessionCookieOptions()` | Cookie config (httpOnly, sameSite, etc.) |
| `findActiveEmployee(code)` | DB lookup with 30s in-memory cache |
| `clearEmployeeCache(code)` | Invalidate employee cache entry |

---

### 5.6 `mailer.js` (`lib/mailer.js`)

Cloudflare Email sender using the Worker's `EMAIL` binding.

| Export | Description |
|--------|-------------|
| `sendTrialPdfEmail({...})` | Send trial summary email (to TRIAL_REPORT_EMAIL) |
| `sendTicketEmail({ticket})` | Send ticket notification (routed by issue type) |
| `sendEmployeeRegistrationEmail({...})` | Send approval link email |

Email sends fail explicitly if the Cloudflare binding is missing or rejects a
message; there is no Microsoft Graph or SMTP fallback.

---

### 5.7 `db.js` (`lib/db.js`)

Neon PostgreSQL client with lazy schema initialization.

| Export | Description |
|--------|-------------|
| `getDb(scope)` | Returns initialized SQL client |

**Scopes:** `"auth"` · `"trials"` · `"tickets"` · `"all"`

---

## 6. API Routes Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/session` | — | Get current logged-in employee |
| POST | `/api/verify-employee` | — | Login with employee code |
| POST | `/api/register` | — | Self-register employee |
| GET | `/api/register/approve` | — | Approve employee via token |
| GET | `/api/trials` | ✅ | List all trials |
| PUT | `/api/trials/:id` | ✅ | Save/update trial |
| GET | `/api/trials/:id` | ✅ | Get single trial |
| DELETE | `/api/trials/:id` | ✅ | Delete trial |
| POST | `/api/trials/serial` | ✅ | Allocate next trial serial number |
| POST | `/api/submit-trial` | ✅ | Submit trial + send email summary |
| GET | `/api/tickets` | ✅ | List support tickets |
| POST | `/api/tickets` | ✅ | Raise new support ticket |
| GET | `/api/tickets/:id` | ✅ | Get single ticket |
| PATCH | `/api/tickets/:id` | ✅ | Update ticket status |
| GET | `/api/agenda-employees` | ✅ | List employees for roster |
| POST | `/api/agenda-employees/print` | ✅ (PMO) | Get full Aadhaar for printing |

---

## 7. Role-Based Access

```
Employee Roles
      │
      ├── Regular Employee
      │     ├── Fill checklist (sec2, sec3, sec4)
      │     ├── View agenda (read-only)
      │     ├── Submit Pre-Trial
      │     ├── Submit Post-Trial
      │     └── Raise tickets
      │
      └── PMO (employee codes in agendaAccess.js)
            ├── All regular employee permissions
            ├── Edit Trial Agenda (sec1)
            ├── Submit Agenda to Trial List
            └── Print Acknowledgment with full Aadhaar
```

**PMO codes** are defined in `lib/agendaAccess.js`:
```js
export const PMO_EMPLOYEE_CODES = ["2440", "16080"];
```

To add a PMO user, add their employee code to this array.

---

## 8. Environment Variables

| Variable | Used For | Required |
|----------|----------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection | ✅ |
| `AUTH_SECRET` | HMAC session signing (min 32 chars) | ✅ |
| `AADHAAR_ENCRYPTION_KEY` | AES-256 Aadhaar encryption | ✅ |
| `MAIL_FROM` | Onboarded Cloudflare sender address | ✅ |
| `TRIAL_REPORT_EMAIL` | Trial summary recipient(s) | ✅ |
| `SOFTWARE_LEAD_EMAIL` | Software ticket recipients | ✅ |
| `HARDWARE_LEAD_EMAIL` | Hardware ticket recipients | ✅ |
| `TEAM_LEAD_EMAILS` | Fallback ticket recipients | ✅ |
| `NEXT_PUBLIC_PMO_CODES` | PMO codes (public, client-side) | Optional |

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                                                             │
│   opennextjs-cloudflare build                               │
│         │                                                   │
│         ├── worker.js          ← Next.js server handler     │
│         ├── assets/            ← Static files (CDN)         │
│         └── middleware/        ← Edge middleware             │
│                                                             │
│   Bindings:                                                 │
│   ├── ASSETS    ← Static file serving                       │
│   ├── EMAIL     ← Cloudflare Email Service                  │
│   └── Secrets   ← All env vars (encrypted)                  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌──────────────────────┐
│  Neon PostgreSQL│          │  Cloudflare Email     │
│  (Serverless)   │          │  (send_email binding) │
│                 │          │                       │
│  employees      │          │  → TRIAL_REPORT_EMAIL │
│  trials         │          │  → SOFTWARE_LEAD_EMAIL│
│  tickets        │          │  → HARDWARE_LEAD_EMAIL│
└─────────────────┘          └──────────────────────┘
```

---

## 10. Adding a New Question

1. Open `lib/checklistData.js`
2. Add question to the relevant section using a helper:
```js
// In SECTIONS → sec4 → questions array
text(47, "Your new question label", { required: false, placeholder: "..." })
```
3. The question automatically appears in the UI via `QuestionCard`
4. To include it in the email summary, add it to `formatTrialSummary()` in `app/api/submit-trial/route.js`

---

## 11. Adding a New Section

1. Add to `SECTIONS` array in `lib/checklistData.js`:
```js
{
  id: "sec5",
  shortTitle: "Section 5 – Your Title",
  title: "Section 5 – Your Title",
  desc: "Description shown under the section header.",
  questions: [ /* questions here */ ],
}
```
2. Update `TOTAL_QUESTIONS` count
3. Section automatically appears in sidebar nav and main form

---

*Document generated for ERIC Robotics RailwayMitra platform.*  
*Last updated: 2026*
