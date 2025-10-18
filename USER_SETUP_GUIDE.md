# User Setup Guide - Thinkers Afrika

## Team Members

### Manager
- **Vincent Mogashoa** - vincent@thinkersafrika.co.za
  - Role: Manager
  - Permissions: All (can approve, view all reports, manage users)

### Controllers (All can review reports)
- **Kea Maripane** - keamogetswe@thinkersafrika.co.za
- **Sipho Mahlinza** - control@thinkersafrika.co.za
- **John Macharaga** - john@thinkersafrika.co.za
- **Matshidiso Maake** - matshidiso@thinkersafrika.co.za
- **Gontle Ditibane** - gontle@thinkersafrika.co.za
- **Kabelo Tshabalala** - kabelo@thinkersafrika.co.za

## Quick Setup Steps

### Option 1: Manual Setup (Recommended)

1. **Go to Firebase Console** → Authentication → Users
2. **Add each user manually:**
   - Click "Add user"
   - Enter email address
   - Enter temporary password (user will change on first login)
   - Click "Add user"

3. **Set up user roles in Firestore:**
   - Go to Firestore Database → Data
   - Create collection: `users`
   - For each user, create document with their UID as document ID
   - Copy the JSON structure from below

### Option 2: Automated Setup

1. **Open your application in browser**
2. **Open browser console (F12)**
3. **Copy and paste the contents of `create-users.js`**
4. **Run: `createAllUsers()`**

## User Document Structure

### Manager (Vincent)
```json
{
  "uid": "vincent_uid_from_auth",
  "email": "vincent@thinkersafrika.co.za",
  "displayName": "Vincent Mogashoa",
  "role": "manager",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "isActive": true,
  "assignedSites": [],
  "permissions": {
    "canApprove": true,
    "canViewAll": true,
    "canManageUsers": true
  }
}
```

### Controllers (All others)
```json
{
  "uid": "user_uid_from_auth",
  "email": "user@thinkersafrika.co.za",
  "displayName": "User Name",
  "role": "controller",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "isActive": true,
  "assignedSites": [],
  "permissions": {
    "canApprove": true,
    "canViewAll": false,
    "canManageUsers": false
  }
}
```

## Testing

1. **Sign-in validation** – confirm each seeded account can authenticate and lands on the correct dashboard.
2. **Report workflow** – create a draft, submit for review, approve/reject from the manager dashboard.
3. **Messaging checks**
   - Watch the navbar badge increase when a report is submitted and when new chat messages arrive.
   - Open `messages.html` and verify the conversation stream, unread counters, and ability to reply.
   - Ensure mark-as-read clears the badge for the current user.
4. **Emulator smoke test** – run `pnpm emulator:start` to exercise the Firestore emulator locally before deploying to production.

## Security Notes

- All users have `canApprove: true` (controllers can review reports)
- Only manager has `canViewAll: true` and `canManageUsers: true`
- Users can only edit their own draft reports
- Users can review any submitted report
- Manager can view and manage everything

## Real-time Messaging Overview

- Every submitted report spins up a conversation document (`conversations/{reportId}`) containing the controllers on duty and all managers with approval permissions.
- The conversation powers the unread badge in the navbar and the dedicated `messages.html` workspace. Controllers see a “View chat” link immediately after submitting a report; managers have an “Open chat” action beside each report row.
- Cloud Functions append system messages when reports are submitted, approved, or rejected. Unread counters are updated automatically for all participants except the sender.
- Firestore security rules restrict read/write access to the `participants` array. Clients can only reset their own unread counter via `markConversationRead`.
- Required index: participants `array-contains` + `lastMessageAt` descending (included in `firestore.indexes.json`). Deploy indexes alongside rules after pulling the latest code.

## Password Policy

**Recommended temporary passwords:**
- Use format: `FirstName2024!`
- Example: `Vincent2024!`, `Kea2024!`, etc.
- Users should change passwords on first login

## Troubleshooting

### User can't login
- Check if user exists in Firebase Authentication
- Verify email address is correct
- Check if user document exists in Firestore

### Permission denied errors
- Verify user document has correct permissions
- Check Firestore security rules are deployed
- Ensure user role is set correctly

### User sees wrong dashboard
- Check user role in Firestore document
- Verify permissions object is correct
- Clear browser cache and try again
