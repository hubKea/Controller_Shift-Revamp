# Conversations & Messages Schema

## Overview

Per-shift group messaging keeps the controllers on duty and their manager in sync. Each shift/report owns a single conversation document that references participating Firebase Auth UIDs. Individual chat messages live in the `messages` subcollection so new posts stream without rewriting the parent document.

## Collections

### `conversations/{conversationId}`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `reportId` | string | ID of the related `shiftReports` document. |
| `participants` | array<string> | Auth UIDs for controllers/managers invited to the thread. Rules rely on this array for access control. |
| `shiftDate` | string | ISO date for the shift; mirrors the report for quick filtering. |
| `siteName` | string | Human-readable site label shown in the UI. |
| `unreadCount` | map<string, number> | Per-participant counters maintained client-side. Each key matches a UID from `participants`. Clients may zero their own entry but cannot affect others. |
| `createdAt` | timestamp | Server timestamp set when the conversation spins up. |
| `lastMessageAt` | timestamp? | Server timestamp of the most recent message; can be `null` until the first post arrives. |

Use `participants` to query a user’s open conversations (`array-contains`). `lastMessageAt` enables ordering newest-first when combined with an index.

### `conversations/{conversationId}/messages/{messageId}`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `senderId` | string | UID of the author; must match the authenticated user for client writes. |
| `senderName` | string | Cached display name for quick rendering. |
| `content` | string | Message body (plain text/Markdown). |
| `timestamp` | timestamp | Server timestamp when the message is created. |
| `system` | boolean? | Optional flag reserved for automated notifications. Clients may omit it or leave it `false`; trusted code can set it `true`. |

Messages are immutable to preserve auditability—clients can only append new entries.

## Security Rules Summary

- Only listed participants can read conversation metadata or message documents.
- Messages can be created by participants (UI enforces `senderId === request.auth.uid`). No edits/deletes are allowed from client devices.
- Conversation updates are constrained to resetting the caller’s `unreadCount` entry to zero; all other fields are locked down and any attempt to touch another participant’s counter is rejected.

## Indexing

Add the following composite index to surface a user’s conversations sorted by most recent activity:

```
collectionGroup: conversations
fields:
  - participants arrayContains
  - lastMessageAt desc
```

This mirrors the structure defined in `firestore.indexes.json`.
