// Enhanced Report Management Service with Complete Data Model
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { userService } from './user-service.js';
import { ROLE_MANAGER } from './constants.js';
import { DataModel, DataValidator, DataTransformer } from './data-model.js';
import { nowIso } from './utils.js';

/**
 * ## Audit 2025-10-19 – Workflow hardening
 *
 * - Review queues now pivot on controller UID metadata so security rules, UI, and Cloud Functions agree on assignments.
 * - Authors can no longer approve or reject their own reports from the client, mirroring Firestore rule enforcement.
 * - Submission guards cross-check controller UID arrays to prevent duplicate selections observed during the QA logic audit.
 */

function buildTimestampFields({ includeCreated = false, clientTimestampIso } = {}) {
  const iso = clientTimestampIso || nowIso();
  const updatedServerValue = serverTimestamp();
  const payload = {
    updatedAtServer: updatedServerValue,
    updatedAtClientIso: iso,
    updatedAt: updatedServerValue,
  };

  if (includeCreated) {
    const createdServerValue = serverTimestamp();
    payload.createdAtServer = createdServerValue;
    payload.createdAtClientIso = iso;
    payload.createdAt = createdServerValue;
  }

  return payload;
}

function deriveCreatedAtFields(existing = {}) {
  const derived = {};
  if (existing.createdAt !== undefined) {
    derived.createdAt = existing.createdAt;
  }
  if (existing.createdAtServer !== undefined) {
    derived.createdAtServer = existing.createdAtServer;
  } else if (existing.createdAt) {
    derived.createdAtServer = existing.createdAt;
  }

  if (existing.createdAtClientIso) {
    derived.createdAtClientIso = existing.createdAtClientIso;
  } else if (existing.createdAt && typeof existing.createdAt.toDate === 'function') {
    derived.createdAtClientIso = existing.createdAt.toDate().toISOString();
  }

  return derived;
}

class EnhancedReportService {
  constructor() {
    this.reportsCollection = DataModel.shiftReports.collection;
    this.approvalsCollection = DataModel.approvals.collection;
    this.usersCollection = DataModel.users.collection;
  }

  // Create a new shift report with complete data validation
  async createReport(formData, options = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to create reports');
      }

      if (!userService.hasPermission('canCreateReports')) {
        throw new Error('User does not have permission to create reports');
      }

      const status = options.status || 'draft';
      const controller1Value =
        typeof formData?.controller1Id === 'string' ? formData.controller1Id.trim() : '';
      const controller2Value =
        typeof formData?.controller2Id === 'string' ? formData.controller2Id.trim() : '';
      if (
        controller1Value &&
        controller2Value &&
        controller1Value.toLowerCase() === controller2Value.toLowerCase()
      ) {
        throw new Error('Controller selections must be different individuals');
      }
      const additionalFields = options.additionalFields ?? {};
      const clientTimestampIso = options.clientTimestampIso || nowIso();

      const reportData = DataTransformer.formToReport(formData, currentUser.user.uid, { status });
      reportData.status = status;
      reportData.createdBy = currentUser.user.uid;
      reportData.version = options.version ?? 1;

      Object.assign(reportData, additionalFields);

      DataValidator.validateShiftReport(reportData);

      Object.assign(reportData, buildTimestampFields({ includeCreated: true, clientTimestampIso }));

      if (status === 'under_review') {
        reportData.submittedAt = serverTimestamp();
        reportData.submittedBy = currentUser.user.uid;
        reportData.submittedAtClientIso = clientTimestampIso;
      }

      const docRef = await addDoc(collection(db, this.reportsCollection), reportData);

      return {
        success: true,
        reportId: docRef.id,
        savedAt: clientTimestampIso,
        data: { id: docRef.id, ...reportData },
      };
    } catch (error) {
      console.error('Create report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Update an existing report with validation
  async updateReport(reportId, formData, options = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to update reports');
      }

      const controller1Value =
        typeof formData?.controller1Id === 'string' ? formData.controller1Id.trim() : '';
      const controller2Value =
        typeof formData?.controller2Id === 'string' ? formData.controller2Id.trim() : '';
      if (
        controller1Value &&
        controller2Value &&
        controller1Value.toLowerCase() === controller2Value.toLowerCase()
      ) {
        throw new Error('Controller selections must be different individuals');
      }

      // Get existing report
      const report = await this.getReport(reportId);
      if (!report.success) {
        return report;
      }

      // Check permissions
      if (!this.canUserEditReport(report.data, currentUser.user.uid)) {
        throw new Error('User does not have permission to edit this report');
      }

      // Transform form data to report structure
      const clientTimestampIso = options.clientTimestampIso || nowIso();
      const updateData = DataTransformer.formToReport(formData, currentUser.user.uid);

      // Preserve critical fields that shouldn't be changed by client
      updateData.id = reportId;
      updateData.status = report.data.status;
      updateData.createdBy = report.data.createdBy;
      updateData.version = (report.data.version || 1) + 1;
      Object.assign(updateData, deriveCreatedAtFields(report.data));
      Object.assign(updateData, buildTimestampFields({ clientTimestampIso }));

      // Update the report
      await updateDoc(doc(db, this.reportsCollection, reportId), updateData);

      return { success: true, data: updateData, savedAt: clientTimestampIso };
    } catch (error) {
      console.error('Update report error:', error);
      return { success: false, error: error.message };
    }
  }

  async markPdfGenerated(reportId, options = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to update reports');
      }

      const payload = {
        pdfGenerated: true,
        ...buildTimestampFields({ clientTimestampIso: nowIso() }),
      };

      if (Object.prototype.hasOwnProperty.call(options, 'pdfUrl')) {
        payload.pdfUrl = options.pdfUrl || '';
      }

      await updateDoc(doc(db, this.reportsCollection, reportId), payload);
      return { success: true };
    } catch (error) {
      console.error('Mark PDF generated error:', error);
      return { success: false, error: error.message };
    }
  }

  // Submit a report for review
  async submitReport(reportId) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to submit reports');
      }

      const report = await this.getReport(reportId);
      if (!report.success) {
        return report;
      }

      // Validate submission permissions
      if (report.data.createdBy !== currentUser.user.uid) {
        throw new Error('User can only submit their own reports');
      }

      if (report.data.status !== 'draft') {
        throw new Error('Only draft reports can be submitted');
      }

      const hasDuplicateControllerIds =
        report.data.controller1Id &&
        report.data.controller2Id &&
        typeof report.data.controller1Id === 'string' &&
        typeof report.data.controller2Id === 'string' &&
        report.data.controller1Id.trim().toLowerCase() ===
          report.data.controller2Id.trim().toLowerCase();
      const controllerUidListSource = Array.isArray(report.data.controllerUids)
        ? report.data.controllerUids
        : [];
      const controllerUidList = controllerUidListSource
        .filter((uid) => typeof uid === 'string')
        .map((uid) => uid.trim())
        .filter((uid) => uid);
      const hasDuplicateControllerUids =
        controllerUidList.length > 1 &&
        new Set(controllerUidList.map((uid) => uid.toLowerCase())).size !==
          controllerUidList.length;

      if (hasDuplicateControllerIds || hasDuplicateControllerUids) {
        throw new Error('Reports must list two different on-duty controllers before submission');
      }

      // Update report status
      const clientTimestampIso = nowIso();
      const updateData = {
        status: 'submitted',
        submittedAt: serverTimestamp(),
        submittedBy: currentUser.user.uid,
        version: (report.data.version || 1) + 1,
      };
      updateData.submittedAtClientIso = clientTimestampIso;
      Object.assign(updateData, buildTimestampFields({ clientTimestampIso }));
      Object.assign(updateData, deriveCreatedAtFields(report.data));

      await updateDoc(doc(db, this.reportsCollection, reportId), updateData);

      return { success: true, savedAt: clientTimestampIso };
    } catch (error) {
      console.error('Submit report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get a single report with permission checking
  async getReport(reportId) {
    try {
      const reportDoc = await getDoc(doc(db, this.reportsCollection, reportId));
      if (!reportDoc.exists()) {
        return { success: false, error: 'Report not found' };
      }

      const reportData = { id: reportDoc.id, ...reportDoc.data() };

      // Check if user can view this report
      const currentUser = userService.getCurrentUser();
      if (!this.canUserViewReport(reportData, currentUser.user.uid)) {
        return { success: false, error: 'User does not have permission to view this report' };
      }

      return { success: true, data: reportData };
    } catch (error) {
      console.error('Get report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get reports for current user with filtering
  async getUserReports(filters = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to view reports');
      }

      let q = query(
        collection(db, this.reportsCollection),
        where('createdBy', '==', currentUser.user.uid),
        orderBy('updatedAtServer', 'desc')
      );

      // Apply filters
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }

      if (filters.limit) {
        q = query(q, limit(filters.limit));
      }

      const snapshot = await getDocs(q);
      const reports = [];
      snapshot.forEach((doc) => {
        reports.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, reports: reports };
    } catch (error) {
      console.error('Get user reports error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all reports (manager function) with filtering
  async getAllReports(filters = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to view reports');
      }

      if (!userService.hasPermission('canViewAll')) {
        throw new Error('User does not have permission to view all reports');
      }

      let q = query(collection(db, this.reportsCollection), orderBy('updatedAtServer', 'desc'));

      // Apply filters
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }

      if (filters.createdBy) {
        q = query(q, where('createdBy', '==', filters.createdBy));
      }

      if (filters.limit) {
        q = query(q, limit(filters.limit));
      }

      const snapshot = await getDocs(q);
      const reports = [];
      snapshot.forEach((doc) => {
        reports.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, reports: reports };
    } catch (error) {
      console.error('Get all reports error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get reports for review (controllers can review)
  async getReportsForReview(filters = {}) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to view reports');
      }

      if (!userService.hasPermission('canApprove')) {
        throw new Error('User does not have permission to review reports');
      }

      const constraints = [where('status', '==', 'submitted')];
      const normalizedRole = (currentUser.role || '').toLowerCase();
      const isManager = normalizedRole === ROLE_MANAGER.toLowerCase();
      if (!isManager) {
        constraints.push(where('controllerUids', 'array-contains', currentUser.user.uid));
      }

      let q = query(
        collection(db, this.reportsCollection),
        ...constraints,
        orderBy('submittedAt', 'desc')
      );

      if (filters.limit) {
        q = query(q, limit(filters.limit));
      }

      const snapshot = await getDocs(q);
      const reports = [];
      snapshot.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        if (data.createdBy && data.createdBy === currentUser.user.uid) {
          return;
        }
        reports.push(data);
      });

      return { success: true, reports: reports };
    } catch (error) {
      console.error('Get reports for review error:', error);
      return { success: false, error: error.message };
    }
  }

  // Approve a report with complete approval tracking
  async approveReport(reportId, comment = '') {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to approve reports');
      }

      if (!userService.hasPermission('canApprove')) {
        throw new Error('User does not have permission to approve reports');
      }

      const report = await this.getReport(reportId);
      if (!report.success) {
        return report;
      }

      if (report.data.status !== 'submitted') {
        throw new Error('Only submitted reports can be approved');
      }

      if (report.data.createdBy && report.data.createdBy === currentUser.user.uid) {
        throw new Error('You cannot approve your own report');
      }

      // Create approval record
      const approval = {
        approverId: currentUser.user.uid,
        approverName: currentUser.user.displayName || currentUser.user.email,
        action: 'approved',
        comment: comment,
        timestamp: serverTimestamp(),
      };

      // Add approval to report
      const updatedApprovals = [...(report.data.approvals || []), approval];

      // Update report status
      const clientTimestampIso = nowIso();
      const updateData = {
        status: 'approved',
        approvals: updatedApprovals,
        approvedAt: serverTimestamp(),
        approvedBy: currentUser.user.uid,
        version: (report.data.version || 1) + 1,
      };
      updateData.approvedAtClientIso = clientTimestampIso;
      Object.assign(updateData, deriveCreatedAtFields(report.data));
      Object.assign(updateData, buildTimestampFields({ clientTimestampIso }));

      await updateDoc(doc(db, this.reportsCollection, reportId), updateData);

      // Create separate approval document (optional)
      await this.createApprovalDocument(reportId, approval, report.data);

      return { success: true, savedAt: clientTimestampIso };
    } catch (error) {
      console.error('Approve report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Reject a report with complete rejection tracking
  async rejectReport(reportId, comment) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to reject reports');
      }

      if (!userService.hasPermission('canApprove')) {
        throw new Error('User does not have permission to reject reports');
      }

      if (!comment || comment.trim() === '') {
        throw new Error('Rejection comment is required');
      }

      const report = await this.getReport(reportId);
      if (!report.success) {
        return report;
      }

      if (report.data.status !== 'submitted') {
        throw new Error('Only submitted reports can be rejected');
      }

      if (report.data.createdBy && report.data.createdBy === currentUser.user.uid) {
        throw new Error('You cannot reject your own report');
      }

      // Create rejection record
      const approval = {
        approverId: currentUser.user.uid,
        approverName: currentUser.user.displayName || currentUser.user.email,
        action: 'rejected',
        comment: comment,
        timestamp: serverTimestamp(),
      };

      // Add approval to report
      const updatedApprovals = [...(report.data.approvals || []), approval];

      // Update report status
      const clientTimestampIso = nowIso();
      const updateData = {
        status: 'rejected',
        approvals: updatedApprovals,
        rejectionReason: comment,
        version: (report.data.version || 1) + 1,
      };
      updateData.rejectedAt = serverTimestamp();
      updateData.rejectedAtClientIso = clientTimestampIso;
      Object.assign(updateData, deriveCreatedAtFields(report.data));
      Object.assign(updateData, buildTimestampFields({ clientTimestampIso }));

      await updateDoc(doc(db, this.reportsCollection, reportId), updateData);

      // Create separate approval document (optional)
      await this.createApprovalDocument(reportId, approval, report.data);

      return { success: true, savedAt: clientTimestampIso };
    } catch (error) {
      console.error('Reject report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete a report (only draft reports)
  async deleteReport(reportId) {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to delete reports');
      }

      const report = await this.getReport(reportId);
      if (!report.success) {
        return report;
      }

      // Only allow deletion of draft reports by the creator
      if (report.data.createdBy !== currentUser.user.uid) {
        throw new Error('User can only delete their own reports');
      }

      if (report.data.status !== 'draft') {
        throw new Error('Only draft reports can be deleted');
      }

      await deleteDoc(doc(db, this.reportsCollection, reportId));

      return { success: true };
    } catch (error) {
      console.error('Delete report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Create separate approval document
  async createApprovalDocument(reportId, approval, reportData) {
    try {
      const approvalDoc = {
        reportId: reportId,
        reportCreatedBy: reportData.createdBy,
        approverId: approval.approverId,
        approverName: approval.approverName,
        action: approval.action,
        comment: approval.comment,
        timestamp: approval.timestamp,
        reportStatus: reportData.status,
      };

      await addDoc(collection(db, this.approvalsCollection), approvalDoc);
    } catch (error) {
      console.error('Error creating approval document:', error);
      // Don't throw error as this is optional
    }
  }

  // Real-time report updates
  subscribeToUserReports(callback, filters = {}) {
    const currentUser = userService.getCurrentUser();
    if (!currentUser.isAuthenticated) {
      throw new Error('User must be authenticated to subscribe to reports');
    }

    let q = query(
      collection(db, this.reportsCollection),
      where('createdBy', '==', currentUser.user.uid),
      orderBy('updatedAtServer', 'desc')
    );

    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const reports = [];
        snapshot.forEach((doc) => {
          reports.push({ id: doc.id, ...doc.data() });
        });
        callback({ success: true, reports: reports });
      },
      (error) => {
        console.error('Subscription error:', error);
        callback({ success: false, error: error.message });
      }
    );
  }

  // Helper method to check if user can edit a report
  canUserEditReport(report, userId) {
    // User can edit their own draft reports
    if (report.createdBy === userId && report.status === 'draft') {
      return true;
    }

    // Managers can edit any draft report
    if (userService.hasPermission('canManageUsers') && report.status === 'draft') {
      return true;
    }

    return false;
  }

  // Helper method to check if user can view a report
  canUserViewReport(report, userId) {
    // User can always view their own reports
    if (report.createdBy === userId) {
      return true;
    }

    // Managers can view all reports
    if (userService.hasPermission('canViewAll')) {
      return true;
    }

    // Controllers can view submitted reports (they can review)
    if (userService.hasPermission('canApprove') && report.status === 'submitted') {
      return true;
    }

    return false;
  }

  // Get report statistics
  async getReportStatistics() {
    try {
      const currentUser = userService.getCurrentUser();
      if (!currentUser.isAuthenticated) {
        throw new Error('User must be authenticated to view statistics');
      }

      const stats = {
        total: 0,
        draft: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
      };

      let q;
      if (userService.hasPermission('canViewAll')) {
        q = query(collection(db, this.reportsCollection));
      } else {
        q = query(
          collection(db, this.reportsCollection),
          where('createdBy', '==', currentUser.user.uid)
        );
      }

      const snapshot = await getDocs(q);
      snapshot.forEach((doc) => {
        const data = doc.data();
        stats.total++;
        stats[data.status] = (stats[data.status] || 0) + 1;
      });

      return { success: true, statistics: stats };
    } catch (error) {
      console.error('Get statistics error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create and export singleton instance
export const enhancedReportService = new EnhancedReportService();
export default enhancedReportService;
