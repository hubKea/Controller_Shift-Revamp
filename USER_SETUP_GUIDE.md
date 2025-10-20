# User Setup Guide - Thinkers Afrika

## Overview

- Controller and reviewer dropdowns use the `users-listForAssign` callable Cloud Function. It returns active Firestore user documents, so keeping the `users` collection accurate is the only way to update the roster.
- Each document in `users/{uid}` must include both `displayName` and `email`. The dropdown label comes from `displayName` and the callable falls back to `email` when no friendly name is available.
- Toggle the roster by editing Firestore; no HTML changes are required. Set `isActive: false` to hide someone from all dropdowns without deleting their account.

## Manual Setup (recommended)

1. Open **Firebase Console -> Authentication -> Users** and create the account.
   - Enter the email address and a temporary password. Inform the user to change it at first sign-in.
   - Supply the display name so it propagates to the Auth profile.
2. Copy the new user's **UID** from the Auth record.
3. Open **Firestore Database -> Data**.
   - Create (or select) the `users` collection.
   - Add a document whose ID exactly matches the Firebase Auth UID.
   - Populate the fields listed in [_Required fields_](#required-fields), using the role presets below.
   - Use the console's _Server timestamp_ option for `createdAt` and `updatedAt`; the callable and security rules expect authoritative timestamps.
4. Repeat for each controller, reviewer, and manager.

To deactivate an account later, leave the Auth record in place but set `isActive` to `false`. The callable skips inactive users and the UI hides them.

## Automated seeding (optional)

`create-users.js` can bootstrap the roster inside a development environment:

1. Serve the application locally, sign in as an admin/manager, and open the browser console.
2. Paste the contents of `create-users.js`.
3. Run `createAllUsers()` to create the Auth users and companion Firestore documents.

Update the email list and temporary passwords in the script before running it, and delete or rotate any placeholder passwords afterwards. The script is intended for emulator/testing environments; for production, prefer the manual approach so you can validate each UID and permission.

## Required fields

Every document in `users/{uid}` must include the following keys:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `email` | string | Lowercase email address. Used for login, dropdown fallback, and audit logs. |
| `displayName` | string | Friendly name shown in dropdowns and messages. |
| `role` | string | One of `manager`, `controller`, or `reviewer`. |
| `permissions` | map | Boolean flags listed in the preset table below. |
| `isActive` | boolean | `true` keeps the user selectable; `false` hides them. |
| `assignedSites` | array<string> | Optional list of site IDs. Leave empty (`[]`) if not used. |
| `createdAt` | timestamp | Server timestamp when the profile was added. |
| `updatedAt` | timestamp | Server timestamp of the latest profile change. |

Additional optional fields (phone number, job title, etc.) can be added as needed. Keep them flat or add nested maps as appropriate; the callable only reads `email`, `displayName`, `role`, and `isActive`.

### Permission presets

| Role | `canApprove` | `canViewAll` | `canManageUsers` | `canCreateReports` |
| ---- | ------------ | ------------ | ---------------- | ------------------ |
| `manager` | true | true | true | true |
| `controller` | true | false | false | true |
| `reviewer` (optional) | true | false | false | false |

Set additional flags as required by future features (for example `canViewAllReports` if added later), but keep the four booleans above in sync with the current security rules.

### Example documents

Manager:

```json
{
  "email": "vincent@thinkersafrika.co.za",
  "displayName": "Vincent Mogashoa",
  "role": "manager",
  "isActive": true,
  "assignedSites": [],
  "permissions": {
    "canApprove": true,
    "canViewAll": true,
    "canManageUsers": true,
    "canCreateReports": true
  },
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```

Controller:

```json
{
  "email": "keamogetswe@thinkersafrika.co.za",
  "displayName": "Kea Maripane",
  "role": "controller",
  "isActive": true,
  "assignedSites": [],
  "permissions": {
    "canApprove": true,
    "canViewAll": false,
    "canManageUsers": false,
    "canCreateReports": true
  },
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```

Replace `"serverTimestamp()"` with the Firestore console's server timestamp option or the Admin SDK equivalent.

## Verification checklist

- Sign in with each seeded account and confirm the correct dashboard loads.
- Open `report-form.html` and make sure both controller dropdowns list only active users with display names and that the roster updates after toggling `isActive`.
- Submit a report, then approve or reject it from the manager dashboard to confirm reviewer permissions and Cloud Functions workflows.
- Visit `messages.html` to ensure conversation participants match the report's controllers and decision makers. Unread badges should update when messages are read.
- When developing locally, run `pnpm emulator:start` to validate the workflow against the Firestore emulator before deploying.

## Notifications

- In-app notifications surface via the header bell and are stored in Firestore at `inboxes/{uid}/items` for each signed-in user.
- Marking a notification as read only clears it for that user; teammates with the same item keep their unread badge until they open it.
- Email is not sent automatically—ensure staff know to monitor the bell and conversations feed for review activity.

## Security notes

- Firestore rules restrict direct edits to `users` documents. Managers can update profiles; other roles are read-only. Client-side scripts should never bypass this.
- Controllers, reviewers, and managers all have `canApprove: true` so the callable can surface them for review assignments, but Cloud Functions prevent self-approval by validating tokens and comparing UIDs.
- Reports list two different controllers (`controller1Id` and `controller2Id`). Ensure the roster contains distinct UIDs so the UI can enforce unique selections.
- Deactivate dormant accounts (`isActive: false`) instead of deleting them; historical approvals reference reviewer UIDs.

## Real-time messaging overview

- Each submitted report creates (or reuses) a conversation document at `conversations/{reportId}` containing the controllers on duty and every user with `permissions.canApprove === true`.
- Cloud Functions append system messages for submissions, approvals, and rejections, and maintain unread counters in `unreadCount.{uid}`.
- The navbar badge aggregates unread items across conversations. `messages.html` lets each participant drill into conversations and resets their unread counter via `markConversationRead`.
- Keep the composite index `participants array-contains` + `lastMessageAt desc` deployed (`firestore.indexes.json` already includes it).

## Password policy

- Issue temporary passwords using the `FirstName2024!` pattern (for example `Vincent2024!`).
- Require users to set a new password immediately after their first login.

## Troubleshooting

### User cannot sign in

- Confirm the Auth user exists and the email matches the Firestore document.
- Verify `isActive` is `true` and permissions are populated.
- Check browser console and Firebase auth logs for error codes.

### Permission denied errors

- Ensure Firestore rules are deployed (`firebase deploy --only firestore:rules`).
- Confirm the Firestore document uses the correct UID and role.
- Re-run the emulators locally (`pnpm emulator:start`) to reproduce the issue with verbose logging.

### Wrong dashboard after login

- Verify the user's `role` and `permissions` map in Firestore.
- Clear local storage/session storage and sign in again.
- If testing with multiple roles in the same browser, use separate profiles or private windows to avoid cached state.
