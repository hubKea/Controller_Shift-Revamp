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

1. **Test login with each user**
2. **Verify role-based access:**
   - Controllers should see their dashboard
   - Manager should see manager dashboard
   - All users should be able to create reports
   - All users should be able to review submitted reports

## Security Notes

- All users have `canApprove: true` (controllers can review reports)
- Only manager has `canViewAll: true` and `canManageUsers: true`
- Users can only edit their own draft reports
- Users can review any submitted report
- Manager can view and manage everything

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
