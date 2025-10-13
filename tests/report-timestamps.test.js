const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const {
  Timestamp,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  getDocs,
  limit
} = require('firebase/firestore');

const { nowIso } = require('../js/utils.cjs');

let testEnv;
let controllerDb;
const controllerUid = 'controller-test-user';

describe('shiftReports timestamp lifecycle', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'controller-shift-revamp-tests',
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8')
      }
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', controllerUid), {
        uid: controllerUid,
        email: 'controller@example.com',
        role: 'controller',
        permissions: {
          canCreateReports: true,
          canViewAll: false,
          canApprove: false
        }
      });
    });

    controllerDb = testEnv.authenticatedContext(controllerUid, {
      token: {
        email: 'controller@example.com'
      }
    }).firestore();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  test('creates and updates timestamps while preserving createdAt fields', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const reportsCol = collection(controllerDb, 'shiftReports');
    const reportRef = doc(reportsCol);
    const otherRef = doc(reportsCol);

    const createdIso = nowIso();
    const createdAtSentinel = serverTimestamp();
    const updatedAtSentinel = serverTimestamp();

    await setDoc(reportRef, {
      reportName: 'Lifecycle primary',
      shiftDate: '2025-01-01',
      status: 'draft',
      version: 1,
      createdBy: controllerUid,
      createdAt: createdAtSentinel,
      createdAtServer: createdAtSentinel,
      createdAtClientIso: createdIso,
      updatedAt: updatedAtSentinel,
      updatedAtServer: updatedAtSentinel,
      updatedAtClientIso: createdIso
    });

    const secondaryIso = nowIso();
    const secondCreatedSentinel = serverTimestamp();
    const secondUpdatedSentinel = serverTimestamp();
    await setDoc(otherRef, {
      reportName: 'Lifecycle secondary',
      shiftDate: '2025-01-02',
      status: 'draft',
      version: 1,
      createdBy: controllerUid,
      createdAt: secondCreatedSentinel,
      createdAtServer: secondCreatedSentinel,
      createdAtClientIso: secondaryIso,
      updatedAt: secondUpdatedSentinel,
      updatedAtServer: secondUpdatedSentinel,
      updatedAtClientIso: secondaryIso
    });

    const createdSnap = await getDoc(reportRef);
    expect(createdSnap.exists()).toBe(true);
    const createdData = createdSnap.data();

    expect(createdData.createdAtServer).toBeInstanceOf(Timestamp);
    expect(createdData.createdAtClientIso).toBe(createdIso);
    expect(createdData.updatedAtServer).toBeInstanceOf(Timestamp);
    expect(createdData.updatedAtClientIso).toBe(createdIso);

    const initialCreatedServerMillis = createdData.createdAtServer.toMillis();
    const initialUpdatedServerMillis = createdData.updatedAtServer.toMillis();

    const updateIso = nowIso();
    const updateSentinel = serverTimestamp();
    await updateDoc(reportRef, {
      notes: 'Updated in emulator test',
      updatedAt: updateSentinel,
      updatedAtServer: updateSentinel,
      updatedAtClientIso: updateIso
    });

    const updatedSnap = await getDoc(reportRef);
    const updatedData = updatedSnap.data();

    expect(updatedData.createdAtServer.toMillis()).toBe(initialCreatedServerMillis);
    expect(updatedData.createdAtClientIso).toBe(createdIso);
    expect(updatedData.updatedAtServer.toMillis()).toBeGreaterThan(initialUpdatedServerMillis);
    expect(updatedData.updatedAtClientIso).toBe(updateIso);

    const orderingQuery = query(reportsCol, orderBy('updatedAtServer', 'desc'), limit(1));
    const orderedDocs = await getDocs(orderingQuery);
    expect(orderedDocs.docs[0].id).toBe(reportRef.id);

    const isoCheck = nowIso();
    expect(typeof isoCheck).toBe('string');

    const nowIsoErrors = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('nowIso is not defined'))
    );
    expect(nowIsoErrors.length).toBe(0);
    errorSpy.mockRestore();
  });
});
