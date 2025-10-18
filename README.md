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

The application is designed for contributors who prefer declarative HTML and direct Firebase SDK usage, complemented by automated security rules, schema documentation, and emulator-backed tests.

## Architecture and Technology Stack

| Layer            | Technology / Notes                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Front-end UI     | Vanilla HTML pages (`index.html`, `dashboard-[role].html`, `report-form.html`) + TailwindCSS via CDN.  |
| Client logic     | ES modules served directly in the browser (`js/` directory). Key modules: `enhanced-report-service.js`, `user-service.js`, `data-model.js`. |
| Styling          | TailwindCSS (CDN for local development). Consider migrating to PostCSS or CLI build for production.     |
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
├── dashboard-controller.html
├── dashboard-manager.html
├── report-form.html
├── index.html
├── js/
│   ├── enhanced-report-service.js
│   ├── user-service.js
│   ├── data-model.js
│   ├── utils.js
│   └── app.js
├── functions/
│   ├── index.js
│   └── package.json
├── firestore.rules
├── firestore.indexes.json
├── README.md                 ← you are here
├── USER_SETUP_GUIDE.md
├── SCHEMA.md
├── firebase.json
├── .firebaserc
└── package.json
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

   This installs top-level dependencies (Firebase Admin SDK, Firebase Functions) and will hoist client-side test/dev tooling.

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
     | `FIREBASE_STORAGE_BUCKET` | Storage bucket (optional for this app). |
     | `FIREBASE_MESSAGING_SENDER_ID` | Sender ID (used for messaging/analytics if enabled). |
     | `FIREBASE_APP_ID` | Web app ID. |
     | `FIREBASE_MEASUREMENT_ID` | Optional analytics measurement ID. |

   - When serving pages as static HTML (without a bundler), expose the same values before loading `firebase-config.js` by providing a small script that sets `window.__FIREBASE_CONFIG__`. For example:

     ```html
     <script>
       window.__FIREBASE_CONFIG__ = {
         apiKey: '…',
         authDomain: '…',
         projectId: '…',
         storageBucket: '…',
         messagingSenderId: '…',
         appId: '…',
         measurementId: '…'
       };
     </script>
     <script type="module" src="./firebase-config.js"></script>
     ```

   - Update `.firebaserc` to point to your Firebase project ID.
   - See [USER_SETUP_GUIDE.md](./USER_SETUP_GUIDE.md) to seed initial users with the correct roles (`controller`, `manager`) and permissions (`canApprove`, `canViewAll`, etc.).

4. **Run the application locally**

   The application is static HTML + ES modules. During development you can serve the root directory with any HTTP server:

   ```bash
   pnpm dev
   ```

   > If `pnpm dev` is not yet defined, use a simple server such as `npx serve` or your editor’s Live Preview. Ensure `firebase-config.js` points to your Firebase project/emulators.

5. **Sign in and explore the workflow**

   - Controllers navigate to `report-form.html` to create reports.
   - Managers open `dashboard-manager.html` to monitor submissions.
   - Review tokens and notifications are orchestrated by Cloud Functions (`functions/index.js`).

## Running Tests

The project provides both unit tests and integration tests. Unit tests mock Firebase services and can run without any external dependencies, while integration tests use the Firebase emulator suite.

### Unit Tests

Run unit tests without needing Java or Firebase emulators:

```bash
pnpm test
# or explicitly:
pnpm test:unit
```

Unit tests include:
- `messages-service.test.js` - Tests message service functions with mocked Firestore
- `utils.test.cjs` - Utility function tests
- `pdf-service.test.mjs` - PDF generation tests

### Integration Tests

Integration tests require **Java 11 or higher** for the Firebase emulator. These tests validate Cloud Functions triggers, security rules, and real Firestore operations.

```bash
# Ensure Java 11+ is installed
java -version

# Run integration tests
pnpm test:integration
```

Integration tests include:
- `messages-triggers.test.js` - Tests for conversation creation, message triggers, and security rules

### Running All Tests

To run both unit and integration tests:

```bash
pnpm test:all
```

### Type Checking

Run the lightweight typecheck placeholder to ensure the repository's TypeScript gate passes CI hooks:

```bash
pnpm typecheck
```

### Emulator utilities

- Firestore emulator rules are automatically loaded from `firestore.rules`.
- Tests seed mock users via `@firebase/rules-unit-testing`.
- To explore emulator data manually, use the Firebase Emulator UI:

  ```bash
  firebase emulators:start --only firestore
  ```

### CI/CD Integration

The GitHub Actions workflow runs unit tests automatically on every push and pull request. Integration tests are:
- Run automatically on pushes to the `main` branch
- Available as a manual workflow dispatch option
- Skipped on pull requests to speed up CI (unless manually triggered)

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
- **Tailwind CDN warning** – highlighted in console when using `cdn.tailwindcss.com`. For production, migrate Tailwind to CLI or PostCSS builds.
- **Deployment permission errors** – ensure your Firebase account has the `Service Account User` role on the project’s App Engine service account.
- **Undefined `nowIso`** – the helper is exported from `js/utils.js`. Tests ensure it’s loaded; if you see this error, confirm all modules import `nowIso` directly rather than relying on globals.

## Additional Resources

- [USER_SETUP_GUIDE.md](./USER_SETUP_GUIDE.md) – create and configure controller/manager accounts.
- [SCHEMA.md](./SCHEMA.md) – reference for Firestore structures and notification payloads.
- [Firebase Security Rules](./firestore.rules) – keep these in sync with application logic.
- [Firebase Indexes](./firestore.indexes.json) – required composite indexes.

---

By consolidating documentation here, the project aims to help new contributors ship features safely, maintain strict security controls, and retain a clear understanding of the controller/manager workflow. If you run into gaps or outdated guidance, open an issue or update the README to keep the team aligned.
