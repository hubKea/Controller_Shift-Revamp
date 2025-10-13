## User Inbox Notifications

- Parent document: `inboxes/{uid}`
  - `unreadCount` (number, default 0): Incremented when new unread items are added.
  - `updatedAt` (timestamp): Server timestamp of the most recent notification mutation.
- Sub-collection: `inboxes/{uid}/items/{notificationId}`
- Purpose: Stores in-app notifications for a single account holder.
- Fields:
  - `type` (string, required): `review_request` for manager inboxes, `review_decision` for controllers.
  - `reportId` (string, required): Identifier of the report the notification references.
  - `actorId` (string, required): UID of the user or system actor that triggered the notification.
  - `actorName` (string, optional): Human-friendly name to display alongside the actor.
  - `status` (string, optional): Workflow state, one of `under_review`, `approved`, `rejected`.
  - `title` (string, required): Short summary line for the notification.
  - `body` (string, required): Single-line description shown in the inbox.
  - `reportDate` (string, optional): ISO date string linked to the originating shift.
  - `siteName` (string, optional): Site label associated with the report.
  - `unread` (boolean, required): `true` until the recipient acknowledges the notification.
  - `createdAt` (timestamp, required): Server timestamp of the event, used for ordering and audit.

- Security: Only the inbox owner (`request.auth.uid == uid`) can read items; all writes are performed by trusted Cloud Functions using the Admin SDK.
