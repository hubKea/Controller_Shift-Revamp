const { describe, expect, test, beforeAll } = require('@jest/globals');

let DataValidator;
let DataTransformer;

beforeAll(async () => {
  const module = await import('../js/data-model.js');
  DataValidator = module.DataValidator;
  DataTransformer = module.DataTransformer;
});

describe('DataValidator', () => {
  describe('validateUser', () => {
    test('returns true for a valid user profile', () => {
      const user = {
        uid: 'user-123',
        email: 'controller@example.com',
        displayName: 'Controller Example',
        role: 'controller',
        permissions: {
          canApprove: true,
          canViewAll: false,
          canManageUsers: false,
          canCreateReports: true
        }
      };

      expect(DataValidator.validateUser(user)).toBe(true);
    });

    test('throws when required user fields are missing', () => {
      const incompleteUser = {
        uid: 'user-123',
        displayName: 'Controller Example',
        role: 'controller',
        permissions: {}
      };

      expect(() => DataValidator.validateUser(incompleteUser)).toThrow('Missing required user fields');
    });

    test('throws when role is not recognised', () => {
      const invalidRoleUser = {
        uid: 'user-123',
        email: 'controller@example.com',
        displayName: 'Someone',
        role: 'guest',
        permissions: {}
      };

      expect(() => DataValidator.validateUser(invalidRoleUser)).toThrow('Invalid user role');
    });
  });

  describe('validateShiftReport', () => {
    test('returns true when minimum required fields are present', () => {
      const report = {
        createdBy: 'user-123',
        status: 'draft'
      };

      expect(DataValidator.validateShiftReport(report)).toBe(true);
    });

    test('throws when required report fields are missing', () => {
      const incompleteReport = {
        status: 'draft'
      };

      expect(() => DataValidator.validateShiftReport(incompleteReport)).toThrow('Missing required report fields');
    });

    test('throws when report status is invalid', () => {
      const invalidReport = {
        createdBy: 'user-123',
        status: 'archived'
      };

      expect(() => DataValidator.validateShiftReport(invalidReport)).toThrow('Invalid report status');
    });
  });
});

describe('DataTransformer.formToReport', () => {
  test('normalises and maps structured form data', () => {
    const now = new Date('2025-06-02T12:00:00Z');
    const createdAt = new Date('2025-06-01T08:00:00Z');
    const formData = {
      controller1: '  Alice  ',
      controller2: ' Bob ',
      reportDate: ' 2025-06-01 ',
      shiftType: ' Night ',
      shiftTime: ' 22:00 ',
      siteName: ' ',
      startingDestination: ' North Hub ',
      siteLocation: ' Eastern Zone ',
      weatherConditions: ' Clear ',
      temperature: ' 20C ',
      visibility: ' High ',
      truckUpdates: ['  Checked pumps  '],
      breakdowns: [{ truckRegNo: ' AB123 ', timeReported: ' 08:00 ', issue: ' Leak ', status: ' Fixed ' }],
      phoneCalls: [{ driverTruckRegNo: ' TR-1 ', ruleViolated: ' Speeding ', timeOfCall: ' 10:00 ', summary: ' Reported by guard ' }],
      investigations: [{ truckRegNo: ' TR2 ', issueIdentified: ' Delay ', timeLocation: ' 11:00 HQ ', findings: ' Inspect ', actionTaken: ' Notified ' }],
      communicationLog: [{ time: ' 09:00 ', recipient: ' Manager ', subject: ' Update ' }],
      equipmentIssues: null,
      visitors: undefined,
      phoneCallsLog: undefined,
      reviewers: [{ uid: 'rev-1', email: 'reviewer@example.com' }],
      attachments: undefined,
      tags: [' night '],
      keyHighlights: ' Ops stable ',
      outstandingIssues: ' None ',
      incomingInfo: ' Next shift prep ',
      totalTrucks: ' 5 ',
      totalLoads: ' 10 ',
      loadsDelivered: ' 8 ',
      pendingDeliveries: ' 2 ',
      shiftPerformance: ' normal '
    };

    const additionalFields = { customField: 'custom-value' };
    const report = DataTransformer.formToReport(formData, 'user-123', {
      status: 'submitted',
      now,
      createdAt,
      updatedAt: now,
      submittedAt: now,
      submittedBy: 'user-123',
      additionalFields
    });

    expect(report.status).toBe('submitted');
    expect(report.createdBy).toBe('user-123');
    expect(report.createdAt).toBe(createdAt);
    expect(report.updatedAt).toBe(now);
    expect(report.submittedAt).toBe(now);
    expect(report.submittedBy).toBe('user-123');

    expect(report.controller1).toBe('Alice');
    expect(report.controller2).toBe('Bob');
    expect(report.personnelOnDuty).toEqual([
      { name: 'Alice', role: 'controller' },
      { name: 'Bob', role: 'controller' }
    ]);

    expect(report.siteName).toBe('North Hub');
    expect(report.siteLocation).toBe('Eastern Zone');

    expect(report.activities).toEqual([
      {
        type: 'truck_update',
        description: 'Checked pumps',
        order: 1
      }
    ]);

    expect(report.incidents).toEqual([
      {
        truckRegNo: 'AB123',
        timeReported: '08:00',
        issue: 'Leak',
        status: 'Fixed'
      }
    ]);

    expect(report.notifications).toEqual([
      {
        driverTruckRegNo: 'TR-1',
        ruleViolated: 'Speeding',
        timeOfCall: '10:00',
        summary: 'Reported by guard'
      }
    ]);

    expect(report.maintenanceRequired).toEqual([
      {
        truckRegNo: 'TR2',
        issueIdentified: 'Delay',
        timeLocation: '11:00 HQ',
        findings: 'Inspect',
        actionTaken: 'Notified'
      }
    ]);

    expect(report.metrics).toEqual({
      totalTrucks: '5',
      totalLoads: '10',
      loadsDelivered: '8',
      pendingDeliveries: '2'
    });

    expect(report.reportSummary).toEqual({ shiftPerformance: 'normal' });
    expect(report.equipmentIssues).toEqual([]);
    expect(report.attachments).toEqual([]);
    expect(report.tags).toEqual([' night ']);
    expect(report.reviewers).toEqual([{ uid: 'rev-1', email: 'reviewer@example.com' }]);
    expect(report.customField).toBe('custom-value');
    expect(report.formSnapshot).toBe(formData);
  });

  test('applies safe defaults when optional fields are missing', () => {
    const report = DataTransformer.formToReport({}, 'user-999');

    expect(report.status).toBe('draft');
    expect(report.createdBy).toBe('user-999');
    expect(report.reviewers).toEqual([]);
    expect(report.personnelOnDuty).toEqual([]);
    expect(report.attachments).toEqual([]);
    expect(report.tags).toEqual([]);
    expect(report.siteName).toBe('Unknown Site');
    expect(report.submittedAt).toBeNull();
    expect(report.submittedBy).toBe('');
    expect(report.createdAt).toBeInstanceOf(Date);
    expect(report.updatedAt).toBeInstanceOf(Date);
  });
});
