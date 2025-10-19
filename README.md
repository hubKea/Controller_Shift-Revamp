# Controller Shift Report Revamp

## Overview

The Controller Shift Report Revamp is a modern web application that replaces the legacy, spreadsheet-driven workflow used by control room staff at Thinkers Afrika. The product focuses on two primary personas:

- **Controllers** capture operational data for each shift, submit reports for managerial review, and receive decisions in real time.
- **Managers** oversee every report coming out of the field, assign reviewers, and approve or reject submissions with full audit trails.

The system is intentionally lightweight—built from HTML, modern JavaScript, and Tailwind-styled components—but backed by Firebase services that provide authentication, role-aware authorization, real-time persistence, and server-driven automation.

### Role-based workflow in a nutshell

1. A controller signs in, fills a shift report, and either saves a draft or submits it for review. Submission triggers Cloud Functions that:
   - Stamp authoritative timestamps (client ISO + Firestore `serverTimestamp()`).
   - Generate reviewer notifications via in-app inboxes.
2. Managers (or other users with `canApprove`) receive a review request in their inbox, open the approval UI, and approve or reject the report.
3. Controllers are immediately notified of the decision. Rejection requires a comment and keeps reviewers in sync with clear audit fields.
4. All activity is recorded in Firestore collections (`shiftReports`, `approvals`, `inboxes`), with Cloud Functions enforcing the same workflow rules the UI expects.

> **Audit improvements:** Controller dropdowns now read from the Firestore `users` collection—update the roster there instead of editing code. Submitted reports must list two different on-duty controllers and can only be approved or rejected by someone other than the author; both the UI and service layer enforce this automatically. Dropdown menus on the report form and dashboards fetch active users via the `users-listForAssign` callable function, keeping rosters in sync without widening Firestore client permissions.

The application is designed for contributors who prefer declarative HTML and direct Firebase SDK usage, complemented by automated security rules, schema documentation, and emulator-backed tests.

## Architecture and Technology Stack

| Layer            | Technology / Notes                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Front-end UI     | Vanilla HTML pages (`index.html`, `dashboard-[role].html`, `report-form.html`) + TailwindCSS via CDN.  |
| Client logic     | ES modules served directly in the browser (`js/` directory). Key modules: `enhanced-report-service.js`, `user-service.js`, `data-model.js`. |
| Styling          | Tailwind CSS compiled locally (`pnpm run build:css`) and served from `styles/tailwind.css`.            |
| Authentication   | Firebase Authentication (Email/Password in production, emulators for tests).                            |
| Database         | Cloud Firestore (`shiftReports`, `users`, `approvals`, `inboxes`).                                      |
| Cloud Functions  | Node.js (Firebase Functions) for lifecycle automation, notification fan-out, secured data fan-out.      |
| Security         | Firestore rules guard reads/writes by role and ownership. Cloud Functions further enforce workflows.    |
| Tooling          | Node.js + pnpm for scripting, Firebase CLI for deployment, Jest + Firestore Emulator for tests.         |

### Key modules

- **`js/enhanced-report-service.js`** – the controller-facing abstraction for creating, updating, submitting, approving, and rejecting reports. It wraps Firestore calls, validates data against the schema, and makes sure authoritative timestamps are written.
- **`functions/index.js`** – back-end logic that:
  - Normalises reviewer tokens, handles approval/ rejection flows coming from Cloud Functions.
  - Manages inbox notifications for review requests (`review_request`) and decisions (`review_decision`).
  - Exposes callable utilities (e.g., `users-listForAssign`) so the client can safely populate dropdowns without broad Firestore reads.
- **`report-form.html`** – the controller-focused UI for editing reports. It connects to authentication guards, calls callable functions to populate controllers/reviewers, and posts back to Firestore via the service layer.
- **`SCHEMA.md`** – the canonical description of structured documents (`inboxes/{uid}/items/{notificationId}`) and their fields.
- **`USER_SETUP_GUIDE.md`** – step-by-step instructions for seeding user accounts in Firebase Authentication/Firestore.

## Repository Structure

```
Controller_Shift-Revamp/
+-- dashboard-controller.html
+-- dashboard-manager.html
+-- report-form.html
+-- index.html
+-- js/
¦   +-- enhanced-report-service.js
¦   +-- user-service.js
¦   +-- data-model.js
¦   +-- utils.js
¦   +-- app.js
+-- functions/
¦   +-- index.js
¦   +-- package.json
+-- firestore.rules
+-- firestore.indexes.json
+-- README.md                 ? you are here
+-- USER_SETUP_GUIDE.md
+-- SCHEMA.md
+-- firebase.json
+-- .firebaserc
+-- package.json
```

## Prerequisites

- **Node.js 18+** (Firebase Functions v6 requires modern Node runtimes).
- **pnpm 8+** for dependency management. (You can substitute npm/yarn, but all docs assume pnpm.)
- **Firebase CLI** (`npm install -g firebase-tools`) with access to the `thinkers-afrika-shift-reports` project or your sandbox project.
- **Java 11+** (for the Firestore emulator, if running tests locally).
- **Optional**: Local HTTPS tools if you plan to serve HTML pages with SSO in a production-like environment.

## Installation and Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/hubKea/-Controller_Shift-Revamp.git
   cd Controller_Shift-Revamp
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

   This pulls the Firebase Admin SDK, Cloud Functions runtime, and all front-end dependencies needed for development.

3. **Configure Firebase environment**

   - Copy the sample environment file and fill in the values for your Firebase project:

     ```bash
     cp .env.sample .env
     ```

     | Variable | Description |
     | -------- | ----------- |
     | `FIREBASE_API_KEY` | Web API key from the Firebase console. |
     | `FIREBASE_AUTH_DOMAIN` | Auth domain (usually `<project-id>.firebaseapp.com`). |
     | `FIREBASE_PROJECT_ID` | Firebase project ID. |
     | `FIREBASE_STORAGE_BUCKET` | Optional storage bucket used for future attachments. |
     | `FIREBASE_MESSAGING_SENDER_ID` | Sender ID (only needed if Cloud Messaging is enabled). |
     | `FIREBASE_APP_ID` | Web app ID. |
     | `FIREBASE_MEASUREMENT_ID` | Optional analytics measurement ID. |

   - When serving pages as static HTML (without a bundler), expose the same values before loading `firebase-config.js` by defining `window.__FIREBASE_CONFIG__`. A sample snippet lives at the bottom of `firebase-config.js`.
   - Update `.firebaserc` to point to your Firebase project ID.
   - See [USER_SETUP_GUIDE.md](./USER_SETUP_GUIDE.md) to seed initial users with the correct roles (`controller`, `manager`) and permissions (`canApprove`, `canViewAll`, etc.).

4. **Run the Firebase emulators (recommended)**

   The UI talks directly to Firestore. Running the Firestore emulator locally keeps test data isolated:

   ```bash
   pnpm emulator:start
   ```

   > Requires Java 11+. The script starts the Firestore emulator and exposes the Emulator UI.

5. **Serve the front-end**

   The project is pure HTML + ES modules. Use any static file server:

   ```bash
   npx serve .
   ```

   Visit `report-form.html`, `dashboard-controller.html`, or `dashboard-manager.html` after signing in with a seeded account.

6. **Build or watch Tailwind CSS**

   The CDN build has been replaced with a local pipeline. For one-off builds run:

   ```bash
   pnpm run build:css
   ```

   During active development, start a watcher so changes to HTML/JS regenerate `styles/tailwind.css` automatically:

   ```bash
   pnpm run dev:css
   ```

   Leave the watcher running in a separate terminal while you work.

7. **Sign in and explore the workflow**

   - Controllers use `report-form.html` to capture shifts, submit for review, and access the accompanying chat via the navbar badge.
   - Managers monitor `dashboard-manager.html`, approve/reject submissions, and open the linked conversation for each report.
   - Real-time conversations, unread badges, and notifications are orchestrated by Cloud Functions (`functions/index.js`).

## Running Tests

Unit tests exercise the pure JavaScript modules (PDF generation, utilities, messaging helpers) and run without any external services:

```bash
pnpm test
```

Integration-style tests that depend on the Firestore emulator can be run with:

```bash
pnpm test:emu
```

> `pnpm test:emu` automatically spins up the Firestore emulator via `firebase emulators:exec`. Ensure Java 11+ is available.

Other helpful commands:

- `pnpm typecheck` – lightweight static analysis gate used by CI.
- `pnpm emulator:start` – manually launch the Firestore emulator and UI for exploratory testing.

The GitHub Actions workflow runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every push and pull request to keep the main branch healthy.

## Linting and Formatting

ESLint + Prettier enforce consistent HTML/JS style. Run the checks before committing:

```bash
pnpm lint
```

Automatically apply safe fixes with:

```bash
pnpm lint:fix
```

The `.eslintrc.cjs` config extends `eslint:recommended` and enables Prettier via `plugin:prettier/recommended`, while `.prettierrc` sets defaults such as `singleQuote`, `trailingComma: "es5"`, and `printWidth: 100`. Editors wired to ESLint/Prettier will now format files consistently with the CI pipeline.

## Messaging & Conversations

- Each submitted shift report automatically spawns a conversation (`conversations/{reportId}`) that includes the on-duty controllers and managers with `canApprove` permissions.
- Real-time updates power the navbar badge on dashboards and the report form. The badge aggregates `unreadCount[uid]` across all conversations and links to `messages.html`.
- `messages.html` provides a two-pane experience: the left sidebar lists conversations ordered by `lastMessageAt`, while the right pane streams the selected chat, highlights system messages, and zeroes the current user’s unread counter via `markConversationRead`.
- Cloud Functions write the first system message on submission/decision and increment unread counters for non-senders. No outbound email is sent – in-app chat is now the source of truth for review coordination.
- Security rules restrict both conversations and messages to the participant list. Clients may only zero their own unread counter; all other updates are rejected.

### Required indexes

Add the following composite index (already committed in `firestore.indexes.json`) if you are bootstrapping a new project:

```
collectionGroup: conversations
 fields:
   - participants arrayContains
   - lastMessageAt desc
```

Re-run `firebase deploy --only firestore:indexes` after pulling the latest repo to ensure the new index is created.
Legacy HTML screens and the current manager dashboard controller are temporarily excluded via `.eslintignore` until they are refactored to valid module-friendly markup.

## PDF Generation

- Controllers can generate a PDF from the read-only report view, and managers/controllers can download the same document from their dashboards.
- PDF creation happens entirely in the browser via jsPDF and autoTable; generated files download immediately using a descriptive filename (`ShiftReport_<date>_<site>.pdf`).
- The document metadata (`pdfGenerated`/`pdfUrl`) is updated in Firestore after a successful export. Uploading the blob to Firebase Storage is not yet automated—future work can wire this into a callable function once the storage flow is approved.

## Deployment

The workflow typically involves three deployment targets: Firestore rules, Firestore indexes, and Cloud Functions. After validating changes locally:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

> **Migration note:** In-app messaging replaces legacy email notifications. Deploying the latest `functions` bundle and Firestore rules is required to enable conversations and unread badges in production.

### Firestore rules and indexes

- `firestore.rules` enforces role-based access (controllers read their own data; managers have extended privileges; inbox writes require Cloud Functions).
- `firestore.indexes.json` includes composite indexes for `shiftReports` and inbox items. Ensure the file is kept in sync with console prompts.

### Cloud Functions

- The `functions` directory uses Firebase Functions v2 style (imported via `firebase-functions/v1`). Key exported functions:
  - `sendReviewRequestEmail` – handles review notifications on status transitions.
  - `onReportUnderReview`, `onReportDecision` – orchestrate inbox updates as reports move through the workflow.
  - `users-listForAssign` – callable endpoint exposing minimal user data for dropdowns.
  - `reviewerApproveReport`, `reviewerRejectReport` – callable endpoints allowing signed reviewers to submit decisions.

- Sensitive values should be stored via `firebase functions:config:set` or function environment variables, not checked into source control.

Deploying functions requires `iam.serviceAccounts.ActAs` permission on the default App Engine service account.

## Data Model and User Provisioning

- **SCHEMA.md** documents the inbox collection (`inboxes/{uid}/items/{notificationId}`) and the structure of notification payloads. Consult this when adding new notification types.
- **USER_SETUP_GUIDE.md** explains how to create initial Firebase Auth users, assign roles, and set permissions.
- **js/data-model.js** contains the aggregate shift report schema mapping so both client and server understand expected fields.

When adding new collection fields or business rules:

1. Update `SCHEMA.md` to keep documentation current.
2. Audit Firestore security rules to ensure permissions stay tight.
3. Extend client validators (`DataValidator.validateShiftReport`) and tests to cover the new behaviour.

## Continuous Integration

- GitHub Actions runs the `CI` workflow on every push and pull request targeting `main`.
- The workflow installs dependencies with `pnpm`, restores the pnpm store cache, and executes `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm run build`.
- Emulator environment variables (`FIREBASE_*_EMULATOR_HOST`) are exported during tests so suites can talk to local Firebase emulators when needed.
- Pipeline failures block merges, ensuring code quality checks stay green before landing changes.

## Contributing Guidelines

1. **Fork or branch** from `main` before implementing features.
2. **Run tests** (`pnpm test`) and lint before committing.
3. **Document changes** in code comments or README/SCHEMA when introducing notable behaviour.
4. Submit pull requests with a clear summary and note any manual steps or migrations required.

## Troubleshooting

- **Missing or insufficient permissions** – occurs when client code attempts to read `users` directly. Instead, use `users-listForAssign`.
- **CSS not updating** – remember to run `pnpm run dev:css` (or `pnpm run build:css`) so the local Tailwind pipeline rebuilds `styles/tailwind.css` after changes.
- **Deployment permission errors** – ensure your Firebase account has the `Service Account User` role on the project’s App Engine service account.
- **Undefined `nowIso`** – the helper is exported from `js/utils.js`. Tests ensure it’s loaded; if you see this error, confirm all modules import `nowIso` directly rather than relying on globals.

## Additional Resources

- [USER_SETUP_GUIDE.md](./USER_SETUP_GUIDE.md) – create and configure controller/manager accounts.
- [SCHEMA.md](./SCHEMA.md) – reference for Firestore structures and notification payloads.
- [Firebase Security Rules](./firestore.rules) – keep these in sync with application logic.
- [Firebase Indexes](./firestore.indexes.json) – required composite indexes.

---

By consolidating documentation here, the project aims to help new contributors ship features safely, maintain strict security controls, and retain a clear understanding of the controller/manager workflow. If you run into gaps or outdated guidance, open an issue or update the README to keep the team aligned.

