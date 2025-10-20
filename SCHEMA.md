# Firestore Schema Reference

This document captures the canonical Firestore collections used by the Controller Shift Report Revamp after the final audit changes. Use it to seed data, reason about Cloud Function side effects, and validate security rules.

## `users/{uid}`

- Document ID: Firebase Auth UID.
- Managed by administrators; clients have read-only access (except to their own document for profile display).
- Source of truth for roster dropdowns (`users-listForAssign` callable) and permission checks inside Cloud Functions.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `email` | string | Lowercase email address. Required for authentication and roster fallback. |
| `displayName` | string | Preferred label for dropdowns and chat participants. |
| `role` | string | `manager`, `controller`, or `reviewer`. |
| `permissions` | map | Booleans controlling workflow access. See table below. |
| `isActive` | boolean | Only `true` users are returned by `users-listForAssign`. Toggle to remove someone from dropdowns without deleting the profile. |
| `assignedSites` | array<string> | Optional site IDs this user manages or works on. Leave empty if not used. |
| `createdAt` | timestamp | Server timestamp for when the profile was created. |
| `updatedAt` | timestamp | Server timestamp for the most recent profile change. |

`permissions` map:

| Key | Meaning |
| --- | ------- |
| `canApprove` | User can approve/reject reports (Cloud Functions still prevent self-approval). |
| `canViewAll` | User can access all reports, regardless of author. |
| `canManageUsers` | Enables administrative tasks (profile edits, roster management). |
| `canCreateReports` | Required for controllers creating or editing shift reports. |

Additional flags can be added over time; update security rules if you introduce new ones.

## `shiftReports/{reportId}`

Primary document produced by controllers, enriched by Cloud Functions during the review workflow.

### Core metadata

| Field | Type | Notes |
| ----- | ---- | ----- |
| `status` | string | `draft`, `submitted`, `under_review`, `approved`, or `rejected`. |
| `version` | number | Incremented on every edit. |
| `createdBy` | string | UID of the author. |
| `submittedBy` | string | UID of the user who submitted for review. |
| `controller1` / `controller2` | string | Display names of the on-duty controllers. |
| `controller1Id` / `controller2Id` | string | UIDs selected in the dropdowns. Enforced to be distinct. |
| `controller1Uid` / `controller2Uid` | string | Alias fields maintained for legacy listeners; mirror the controller IDs. |
| `controller1Email` / `controller2Email` | string | Lowercase emails for roster display and security-rule fallbacks. |
| `controllerUids` | array<string> | Distinct list of on-duty controller UIDs (used by review queues, conversations, and security rules). |
| `reportName` | string | Optional human-readable title. |
| `shiftDate` | string | ISO date (`YYYY-MM-DD`). Mirrors `reportDate`. |
| `shiftType` | string | Day/Night/etc. |
| `shiftTime` | string | Free-form shift window. |
| `siteName` / `siteLocation` | string | Location details gathered from the form. |
| `notes`, `outstandingIssues`, `incomingInfo` | string | Narrative fields from the form. |
| `pdfGenerated` | boolean | True once a PDF has been exported from the UI. |
| `pdfUrl` | string | Reserved for future storage uploads. Currently blank. |
| `searchKeywords` | array<string> | Optional tokens to power dashboard search. Generated client-side when available. |

### Audit timestamps

All timestamps are written with Firestore `serverTimestamp()` helpers and mirrored as ISO strings for traceability.

| Field | Purpose |
| ----- | ------- |
| `createdAt`, `createdAtServer`, `createdAtClientIso` | Authoritative creation times. `createdAt`/`createdAtServer` are identical server timestamps; `createdAtClientIso` captures the client ISO string. |
| `updatedAt`, `updatedAtServer`, `updatedAtClientIso` | Last modification moments. Updated on every write (client or Cloud Function). |
| `submittedAt`, `submittedAtClientIso` | Set when a report transitions from draft to submitted. |
| `reviewRequestedAt`, `reviewRequestedAtClientIso` | Set by Cloud Functions when reviewer tokens are issued. |
| `approvedAt`, `approvedAtServer`, `approvedAtClientIso` | Populated when all required reviewers approve. |
| `rejectedAt`, `rejectedAtServer`, `rejectedAtClientIso` | Populated when any reviewer rejects. |

### Controller and participant details

| Field | Type | Notes |
| ----- | ---- | ----- |
| `personnelOnDuty` | array<object> | Derived list containing the two controllers with their roles and optional `uid` field. |
| `reviewers` | array<object> | Assignment metadata for reviewers (see below). |
| `approvals` | array<object> | Legacy structure retaining historical approval payloads. |
| `formSnapshot` | map | Raw form submission for auditing/debugging. Includes dropdown selections and any transient fields. |

Reviewer entry structure:

| Key | Type | Notes |
| --- | ---- | ----- |
| `uid` | string | Reviewer UID (required for token validation). |
| `email` | string | Lowercase email used as the token lookup key. |
| `name` | string | Display string for dashboards and notifications. |
| `role` | string | `primary` or `secondary` (or other descriptive labels). |
| `required` | boolean | Required reviewers must approve for the report to exit `under_review`. |
| `status` | string | `pending`, `approved`, or `rejected`. |
| `approved` / `rejected` | boolean | Convenience flags mirroring `status`. |
| `approvedAt` / `rejectedAt` | timestamp | Recorded when a decision is made. |
| `rejectionComment` | string | Mandatory explanation when rejecting. |
| `token`, `reviewToken`, `approvalToken` | string | Current access tokens issued by Cloud Functions. Cleared after use. |
| `tokenIssuedAt`, `tokenInvalidatedAt` | timestamp | Lifecycle markers for token rotation. |
| `tokenUsed` | boolean | Indicates whether the token has already been redeemed. |
| `tokens`, `links` | array | Legacy fields. Arrays of alternate tokens or link metadata retained for compatibility. |

Cloud Functions also manage the following optional token caches on the report itself:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `reviewerTokens` | array | Historical cache of issued tokens. Automatically cleared once all reviewers decide. |
| `reviewTokens` | map | Legacy map of tokens keyed by reviewer identifiers. |
| `approvalTokens` | map | Legacy approval token cache. |

### Report content

| Field | Type | Notes |
| ----- | ---- | ----- |
| `activities` | array<object> | Structured list of truck updates (`type`, `description`, `order`). |
| `incidents` | array<object> | Breakdown incidents (`truckRegNo`, `timeReported`, `issue`, `status`). |
| `equipmentIssues` | array<object> | Free-form list captured from the form. |
| `maintenanceRequired` | array<object> | Derived investigations (time/location, findings, action taken). |
| `visitors` | array<object> | Visitor log. |
| `communications` | array<object> | Communication log items (time, recipient, subject). |
| `notifications` | array<object> | Phone call summaries (driver truck number, violation, etc.). |
| `metrics` | map | Aggregated numeric/text metrics such as `totalTrucks`, `loadsDelivered`, `pendingDeliveries`. |
| `reportSummary` | map | Currently stores `shiftPerformance`. Extend as new summary fields are added. |

Security overview:

- Authors (`createdBy`) can read/update drafts and delete their own drafts.
- Managers (`role == manager` or `permissions.canViewAll`) can read all reports and override statuses.
- Reviewers (`permissions.canApprove`) can update `submitted` reports to approve or reject via Cloud Functions; direct writes are blocked.

## `approvals/{approvalId}`

Separate audit collection maintained by Cloud Functions for every decision event.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `reportId` | string | Foreign key to `shiftReports`. |
| `reportCreatedBy` | string | UID of the original author. |
| `approverId` | string | UID of the reviewer who acted. |
| `approverName` | string | Snapshot of the reviewer display name at decision time. |
| `action` | string | `approved` or `rejected`. |
| `comment` | string | Required when `action === "rejected"`. |
| `timestamp` | timestamp | Server timestamp when the decision was stored. |
| `reportStatus` | string | Status of the report immediately after the decision. |

Security: only managers and users with `canApprove` can read approvals. Writes occur exclusively inside Cloud Functions.

## `inboxes/{uid}`

Top-level document (one per user) and subcollection of notification items.

Parent document fields:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `unreadCount` | number | Aggregate unread notifications for quick badge display. |
| `updatedAt` | timestamp | Last time a notification was created or updated. |

Notification items (`inboxes/{uid}/items/{notificationId}`):

| Field | Type | Notes |
| ----- | ---- | ----- |
| `type` | string | `review_request`, `review_decision`, or future notification types. |
| `reportId` | string | Related shift report. |
| `actorId` / `actorName` | string | Who triggered the notification (UID and friendly name). |
| `status` | string | Workflow state associated with the message (`under_review`, `approved`, `rejected`). |
| `title` / `body` | string | Text displayed in inbox cards. |
| `href` | string | Optional deep link opened when the notification is activated (e.g., messages page or report detail). |
| `reportDate` | string | ISO shift date (optional). |
| `siteName` | string | Site label (optional). |
| `unread` | boolean | `true` until the recipient reads it. |
| `createdAt` | timestamp | Server timestamp (ordering). |

Security: users can read only their own inbox. All writes go through Cloud Functions (`createInboxNotification`), ensuring trusted timestamps.

## `conversations/{conversationId}` and `messages`

- `conversationId` equals the `shiftReports` document ID.
- Participants: on-duty controllers (from `controller1Id`/`controller2Id`) plus everyone with `permissions.canApprove`.
- Unread counters live in the `unreadCount` map (`uid` -> number). Clients may only reset their own counter to zero.
- Messages are stored in `conversations/{conversationId}/messages/{messageId}` with fields `senderId`, `senderName`, `content`, `timestamp`, and optional `system` flag.

See [`docs/SCHEMA-MESSAGES.md`](./docs/SCHEMA-MESSAGES.md) for deeper detail on chat payloads and indexing requirements.

---

Keep this document synchronized with application changes, security rules (`firestore.rules`), and Cloud Functions (`functions/index.js`) so onboarding developers can reason about new fields confidently.
