// Firestore Data Model and Schema Definitions
// This file defines the complete data structure for the Thinkers Afrika Shift Report system

import { ROLE_CONTROLLER, ROLE_MANAGER, ROLE_REVIEWER } from './constants.js';
export const DataModel = {
  // User Collection Schema
  users: {
    collection: 'users',
    schema: {
      uid: 'string', // Firebase Auth UID
      email: 'string', // User email address
      displayName: 'string', // User's display name
      role: 'string', // 'manager' | 'controller' | 'reviewer'
      createdAt: 'timestamp', // Account creation date
      updatedAt: 'timestamp', // Last profile update
      isActive: 'boolean', // Account status
      assignedSites: 'array', // Array of site IDs user is assigned to
      permissions: {
        // Role-based permissions
        canApprove: 'boolean', // Can approve/reject reports
        canViewAll: 'boolean', // Can view all reports
        canManageUsers: 'boolean', // Can manage user accounts
        canCreateReports: 'boolean', // Can create new reports
      },
    },
  },

  // Shift Reports Collection Schema
  shiftReports: {
    collection: 'shiftReports',
    schema: {
      // Core Report Data
      id: 'string', // Document ID
      status: 'string', // 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
      version: 'number', // Report version number

      // Metadata
      createdBy: 'string', // UID of report creator
      createdAt: 'timestamp', // Creation timestamp
      createdAtServer: 'timestamp', // Server-side creation timestamp
      createdAtClientIso: 'string', // Client ISO string when created
      updatedAt: 'timestamp', // Last update timestamp
      updatedAtServer: 'timestamp', // Server-side last update
      updatedAtClientIso: 'string', // Client ISO string for last update
      submittedAt: 'timestamp', // Submission timestamp (if submitted)
      submittedAtClientIso: 'string', // Client ISO when submitted
      submittedBy: 'string', // UID of submitter

      // Report Content (from form)
      shiftDate: 'string', // Date of shift (YYYY-MM-DD)
      shiftTime: 'string', // Time of shift
      siteName: 'string', // Name of the site
      siteLocation: 'string', // Location of the site
      weatherConditions: 'string', // Weather conditions
      temperature: 'string', // Temperature
      visibility: 'string', // Visibility conditions

      // Activities and Incidents
      activities: 'array', // Array of activity objects
      incidents: 'array', // Array of incident objects
      equipmentIssues: 'array', // Array of equipment issue objects
      maintenanceRequired: 'array', // Array of maintenance items

      // Personnel
      personnelOnDuty: 'array', // Array of personnel objects
      visitors: 'array', // Array of visitor objects

      // Communication
      communications: 'array', // Array of communication objects
      notifications: 'array', // Array of notification objects

      // Review and Approval
      reviewers: 'array', // Array of reviewer objects
      approvals: 'array', // Array of approval objects
      rejectionReason: 'string', // Reason for rejection (if rejected)
      rejectedAt: 'timestamp', // Rejection timestamp
      rejectedAtClientIso: 'string', // Client ISO when rejected

      // Final Processing
      approvedAt: 'timestamp', // Approval timestamp
      approvedAtClientIso: 'string', // Client ISO when approved
      approvedBy: 'string', // UID of approver
      pdfGenerated: 'boolean', // Whether PDF has been generated
      pdfUrl: 'string', // URL to generated PDF

      // Additional Fields
      notes: 'string', // Additional notes
      attachments: 'array', // Array of attachment objects
      tags: 'array', // Array of tags for categorization
    },
  },

  // Approvals Collection Schema (Optional - can be embedded in shiftReports)
  approvals: {
    collection: 'approvals',
    schema: {
      id: 'string', // Document ID
      reportId: 'string', // ID of the report being approved
      reportCreatedBy: 'string', // UID of report creator
      approverId: 'string', // UID of approver
      approverName: 'string', // Name of approver
      action: 'string', // 'approved' | 'rejected'
      comment: 'string', // Approval/rejection comment
      timestamp: 'timestamp', // Approval timestamp
      reportStatus: 'string', // Status of report at time of approval
    },
  },
};

// Data Validation Functions
export const DataValidator = {
  // Validate user data
  validateUser(userData) {
    const required = ['uid', 'email', 'displayName', 'role', 'permissions'];
    const missing = required.filter((field) => !userData[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required user fields: ${missing.join(', ')}`);
    }

    if (![ROLE_MANAGER, ROLE_CONTROLLER, ROLE_REVIEWER].includes(userData.role)) {
      throw new Error('Invalid user role');
    }

    return true;
  },

  // Validate shift report data
  validateShiftReport(reportData) {
    const required = ['createdBy', 'status'];
    const missing = required.filter((field) => !reportData[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required report fields: ${missing.join(', ')}`);
    }

    if (
      !['draft', 'submitted', 'under_review', 'approved', 'rejected'].includes(reportData.status)
    ) {
      throw new Error('Invalid report status');
    }

    return true;
  },

  // Validate approval data
  validateApproval(approvalData) {
    const required = ['reportId', 'approverId', 'action', 'timestamp'];
    const missing = required.filter((field) => !approvalData[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required approval fields: ${missing.join(', ')}`);
    }

    if (!['approved', 'rejected'].includes(approvalData.action)) {
      throw new Error('Invalid approval action');
    }

    return true;
  },
};

// Data Transformation Functions
export const DataTransformer = {
  // Transform form data to report structure
  formToReport(formData, userId, options = {}) {
    const status = options.status || 'draft';
    const now = options.now || new Date();

    const normalizeString = (value) => {
      if (typeof value === 'string') {
        return value.trim();
      }
      return value ?? '';
    };

    const pickValue = (...candidates) => {
      for (const candidate of candidates) {
        const normalized = normalizeString(candidate);
        if (normalized) {
          return normalized;
        }
      }
      return '';
    };

    const ensureArray = (value) => (Array.isArray(value) ? value : []);

    const activities = ensureArray(formData.truckUpdates).map((description, index) => ({
      type: 'truck_update',
      description: normalizeString(description),
      order: index + 1,
    }));

    const incidents = ensureArray(formData.breakdowns).map((item) => ({
      truckRegNo: normalizeString(item?.truckRegNo),
      timeReported: normalizeString(item?.timeReported),
      issue: normalizeString(item?.issue),
      status: normalizeString(item?.status),
    }));

    const phoneCalls = ensureArray(formData.phoneCalls).map((item) => ({
      driverTruckRegNo: normalizeString(item?.driverTruckRegNo),
      ruleViolated: normalizeString(item?.ruleViolated),
      timeOfCall: normalizeString(item?.timeOfCall),
      summary: normalizeString(item?.summary),
    }));

    const investigations = ensureArray(formData.investigations).map((item) => ({
      truckRegNo: normalizeString(item?.truckRegNo),
      issueIdentified: normalizeString(item?.issueIdentified),
      timeLocation: normalizeString(item?.timeLocation),
      findings: normalizeString(item?.findings),
      actionTaken: normalizeString(item?.actionTaken),
    }));

    const communicationLog = ensureArray(formData.communicationLog).map((item) => ({
      time: normalizeString(item?.time),
      recipient: normalizeString(item?.recipient),
      subject: normalizeString(item?.subject),
    }));

    const controller1Name = pickValue(formData.controller1);
    const controller2Name = pickValue(formData.controller2);

    const personnelOnDuty = [
      controller1Name ? { name: controller1Name, role: ROLE_CONTROLLER } : null,
      controller2Name ? { name: controller2Name, role: ROLE_CONTROLLER } : null,
    ].filter(Boolean);

    const reportDate = pickValue(formData.reportDate, formData.shiftDate);
    const siteName = pickValue(formData.siteName, formData.startingDestination, 'Unknown Site');
    const siteLocation = pickValue(formData.siteLocation, formData.endingDestination);

    const report = {
      status,
      version: options.version ?? 1,
      createdBy: userId,
      createdAt: options.createdAt || now,
      updatedAt: options.updatedAt || now,
      submittedAt: options.submittedAt || null,
      submittedBy: options.submittedBy || '',
      controller1: controller1Name,
      controller2: controller2Name,
      reportName: pickValue(formData.reportName),
      reportDate,
      shiftDate: reportDate,
      shiftType: pickValue(formData.shiftType),
      shiftTime: pickValue(formData.shiftTime),
      siteName,
      siteLocation,
      weatherConditions: pickValue(formData.weatherConditions),
      temperature: pickValue(formData.temperature),
      visibility: pickValue(formData.visibility),
      activities,
      incidents,
      equipmentIssues: ensureArray(formData.equipmentIssues),
      maintenanceRequired: investigations,
      personnelOnDuty,
      visitors: ensureArray(formData.visitors),
      communications: communicationLog,
      notifications: phoneCalls,
      reviewers: ensureArray(formData.reviewers),
      approvals: [],
      rejectionReason: '',
      approvedAt: options.approvedAt || null,
      approvedBy: options.approvedBy || '',
      pdfGenerated: false,
      pdfUrl: '',
      notes: pickValue(formData.keyHighlights, formData.notes),
      attachments: ensureArray(formData.attachments),
      tags: ensureArray(formData.tags),
      outstandingIssues: pickValue(formData.outstandingIssues),
      incomingInfo: pickValue(formData.incomingInfo),
      metrics: {
        totalTrucks: pickValue(formData.totalTrucks),
        totalLoads: pickValue(formData.totalLoads),
        loadsDelivered: pickValue(formData.loadsDelivered),
        pendingDeliveries: pickValue(formData.pendingDeliveries),
      },
      reportSummary: {
        shiftPerformance: pickValue(formData.shiftPerformance),
      },
      formSnapshot: formData,
    };

    if (options.additionalFields) {
      Object.assign(report, options.additionalFields);
    }

    return report;
  },
};

// Export the complete data model
export default DataModel;
