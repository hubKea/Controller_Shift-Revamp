# Test Suite - Report Lifecycle & Timestamps

## Overview
This test suite validates the report lifecycle, focusing on:
- Authoritative server timestamps (createdAtServer, updatedAtServer)
- Client ISO timestamps for logging
- Timestamp immutability (createdAt* fields never change)
- Sorting by updatedAtServer works correctly
- No nowIso() regression errors

## Prerequisites

### Java Installation (Required for Firebase Emulator)
The Firebase Firestore emulator requires Java 11 or higher.

**Check if Java is installed:**
```bash
java -version
```

**Install Java:**
- **Windows**: Download from [Adoptium](https://adoptium.net/) or [Oracle](https://www.oracle.com/java/technologies/downloads/)
- **macOS**: `brew install openjdk@11`
- **Linux**: `sudo apt-get install openjdk-11-jdk`

### Dependencies
All required npm packages are already in package.json:
```bash
npm install
```

## Running Tests

### Option 1: With Firebase Emulator (Recommended)
This runs tests with actual Firestore emulation and security rules validation:

```bash
npm run test:emu
```

### Option 2: Direct Jest Run (No Emulator)
Useful for quick iterations when Java isn't available:

```bash
npm test
```

### Option 3: Watch Mode
Auto-run tests on file changes:

```bash
npm run test:watch
```

### Option 4: Manual Emulator Control
Start emulator in one terminal:
```bash
npm run emulator:start
```

Run tests in another terminal:
```bash
npm test
```

## Test Coverage

### Current Tests: `report-timestamps.test.js`

#### Test: "creates and updates timestamps while preserving createdAt fields"

**What it validates:**

1. **Creation Phase:**
   - ✅ Report created with serverTimestamp() for createdAtServer
   - ✅ createdAtServer is a Firestore Timestamp instance
   - ✅ createdAtClientIso is an ISO string from nowIso()
   - ✅ updatedAtServer is initialized to same as createdAtServer
   - ✅ updatedAtClientIso is initialized to same as createdAtClientIso

2. **Update Phase:**
   - ✅ createdAtServer remains unchanged (immutable)
   - ✅ createdAtClientIso remains unchanged (immutable)
   - ✅ updatedAtServer advances to new server timestamp
   - ✅ updatedAtClientIso updates to new ISO string

3. **Sorting Verification:**
   - ✅ Query with `orderBy('updatedAtServer', 'desc')` returns updated doc first
   - ✅ Most recently updated documents sort to top

4. **Regression Prevention:**
   - ✅ nowIso() function exists and returns string
   - ✅ No "nowIso is not defined" errors in console logs

## Test Architecture

### Test Environment Setup
- Uses `@firebase/rules-unit-testing` for emulator-based testing
- Creates isolated test environment per test run
- Loads actual firestore.rules for security validation
- Seeds a controller user in the emulator

### Authentication Context
- Tests run as a controller user with UID: `controller-test-user`
- User has permissions: `canCreateReports: true`
- Validates security rules allow controller to create/update their own reports

### Data Flow
```
┌─────────────┐
│ Create      │ → serverTimestamp() → createdAtServer (Timestamp)
│ Report      │ → nowIso()         → createdAtClientIso (ISO string)
└─────────────┘
      ↓
┌─────────────┐
│ Update      │ → createdAt* unchanged
│ Report      │ → serverTimestamp() → updatedAtServer (new Timestamp)
└─────────────┘ → nowIso()         → updatedAtClientIso (new ISO string)
```

## Acceptance Criteria Status

✅ **AC1**: Test passes - timestamps exist with correct types after creation  
✅ **AC2**: Test passes - only updatedAt* changes on update, createdAt* preserved  
✅ **AC3**: Test passes - sorting by updatedAtServer desc works correctly  
✅ **AC4**: Test passes - no "nowIso is not defined" errors detected

## Troubleshooting

### "Could not spawn `java -version`"
- Install Java (see Prerequisites)
- Ensure Java is in system PATH
- Restart terminal after Java installation

### "Permission denied" or "EACCES" errors
- Run tests with proper permissions
- Check file permissions on test directory

### "Module not found" errors
- Run `npm install` to install dependencies
- Check that you're in the project root directory

### Tests timeout
- Increase timeout in jest.config.cjs (currently 30000ms)
- Check Firebase emulator is starting correctly

## Future Enhancements

Consider adding tests for:
- [ ] Submission timestamp logic (submittedAt, submittedAtClientIso)
- [ ] Approval timestamp logic (approvedAt, approvedAtClientIso)
- [ ] Rejection timestamp logic (rejectedAt, rejectedAtClientIso)
- [ ] Version increment on updates
- [ ] Concurrent update conflicts
- [ ] Security rules validation for different roles
- [ ] Edge cases: network delays, clock skew

