import { db } from '../firebase-config.js';
import { userService } from './user-service.js';
import { enhancedReportService } from './enhanced-report-service.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const DEFAULT_SELECTORS = {
  dateRangeSelector: '#date-range',
  controllerSelectSelector: '#controller',
  statusSelectSelector: '#status',
  applyButtonSelector: '#filter-apply',
  clearButtonSelector: '#filter-clear',
  tableBodySelector: '#reports-table-body',
  searchInputSelector: '#dashboard-search'
};

function coerceDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input?.toDate === 'function') {
    const converted = input.toDate();
    return isNaN(converted.getTime()) ? null : converted;
  }
  const date = new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export class DashboardBase {
  constructor(options = {}) {
    this.options = { ...DEFAULT_SELECTORS, ...options };
    this.requiredRole = this.options.requiredRole;
    delete this.options.requiredRole;
    this.currentUser = null;
    this.userRole = null;
    this.userPermissions = null;
    this.reports = [];
    this.reportDocs = new Map();
    this.reportListeners = [];

    this.handleApplyFilters = this.handleApplyFilters.bind(this);
    this.handleClearFilters = this.handleClearFilters.bind(this);
    this.handleSearchInput = this.handleSearchInput.bind(this);
    this.applyFilters = this.applyFilters.bind(this);

    this.cacheDom();
    this.initializeEventListeners();
    this.setupAuthListener();
  }

  cacheDom() {
    const selectors = this.options;
    this.dateRangeInput = document.querySelector(selectors.dateRangeSelector);
    this.controllerSelect = document.querySelector(selectors.controllerSelectSelector);
    this.statusSelect = document.querySelector(selectors.statusSelectSelector);
    this.applyButton = document.querySelector(selectors.applyButtonSelector);
    this.clearButton = document.querySelector(selectors.clearButtonSelector);
    this.tableBody = document.querySelector(selectors.tableBodySelector);
    this.searchInput = selectors.searchInputSelector ? document.querySelector(selectors.searchInputSelector) : null;
  }

  initializeEventListeners() {
    if (this.applyButton) {
      this.applyButton.addEventListener('click', this.handleApplyFilters);
    }
    if (this.clearButton) {
      this.clearButton.addEventListener('click', this.handleClearFilters);
    }
    if (this.dateRangeInput) {
      this.dateRangeInput.addEventListener('change', this.applyFilters);
    }
    if (this.controllerSelect) {
      this.controllerSelect.addEventListener('change', this.applyFilters);
    }
    if (this.statusSelect) {
      this.statusSelect.addEventListener('change', this.applyFilters);
    }
    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.handleSearchInput);
    }
  }

  async setupAuthListener() {
    try {
      const authResult = await userService.initializeAuthGuard();
      if (!authResult.authenticated) {
        return;
      }

      if (this.requiredRole && authResult.role !== this.requiredRole) {
        this.showMessage('You do not have permission to view this dashboard.', 'error');
        return;
      }

      this.currentUser = authResult.user;
      this.userRole = authResult.role;
      this.userPermissions = authResult.permissions;

      this.updateHeader();
      await this.onAuthReady(authResult);
    } catch (error) {
      console.error('Dashboard authentication error:', error);
      this.showMessage('Failed to authenticate user', 'error');
    }
  }

  updateHeader() {
    const userAvatar = document.querySelector('.h-10.w-10.rounded-full, header img[alt="User avatar"]');
    if (!userAvatar || !this.currentUser) return;

    const userName = this.currentUser.displayName || this.currentUser.email?.split('@')[0] || 'User';
    const profilePhoto = this.currentUser.photoURL;

    if ('src' in userAvatar) {
      userAvatar.src = profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=137fec&color=fff&size=40`;
    } else if ('style' in userAvatar) {
      userAvatar.style.backgroundImage = profilePhoto
        ? `url("${profilePhoto}")`
        : `url("https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=137fec&color=fff&size=40")`;
    }
  }

  // Intended to be overridden by subclasses
  async onAuthReady() {}

  handleApplyFilters() {
    this.applyFilters();
  }

  handleClearFilters() {
    if (this.dateRangeInput) {
      this.dateRangeInput.value = '';
    }
    if (this.controllerSelect) {
      this.controllerSelect.selectedIndex = 0;
    }
    if (this.statusSelect) {
      this.statusSelect.selectedIndex = 0;
    }
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.applyFilters();
  }

  handleSearchInput() {
    this.applyFilters();
  }

  getFilterValues() {
    return {
      date: normalizeString(this.dateRangeInput?.value).toLowerCase(),
      controller: normalizeString(this.controllerSelect?.value).toLowerCase(),
      status: normalizeString(this.statusSelect?.value).toLowerCase(),
      search: normalizeString(this.searchInput?.value).toLowerCase()
    };
  }

  applyFilters() {
    const filters = this.getFilterValues();
    const filteredReports = this.reports.filter((report) => this.matchesFilters(report, filters));
    this.renderFilteredReports(filteredReports);
  }

  matchesFilters(report, filters) {
    const reportDate = this.formatDate(this.getTimelineDate(report)).toLowerCase();
    const controllerName = this.getControllerNames(report).toLowerCase();
    const status = normalizeString(report.status).toLowerCase();

    const dateMatch = !filters.date || reportDate.includes(filters.date);
    const controllerMatch = !filters.controller || filters.controller === 'all controllers' || controllerName.includes(filters.controller);
    const statusMatch = !filters.status || filters.status === 'all statuses' || status === filters.status;
    const searchMatch = !filters.search || this.matchesSearch(report, filters.search);

    return dateMatch && controllerMatch && statusMatch && searchMatch;
  }

  matchesSearch(report, query) {
    if (!query) return true;
    const haystack = [
      normalizeString(report.reportName),
      normalizeString(report.siteName),
      normalizeString(report.shiftType),
      normalizeString(report.controller1),
      normalizeString(report.controller2)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  setReports(reports) {
    this.reports = Array.isArray(reports) ? [...reports] : [];
    this.sortReports();
    this.renderReports();
  }

  sortReports() {
    this.reports.sort((a, b) => {
      const aTime = this.getComparableTime(a);
      const bTime = this.getComparableTime(b);
      return bTime - aTime;
    });
  }

  getComparableTime(report) {
    const date = coerceDate(this.getTimelineDate(report)) || coerceDate(report.createdAt) || new Date(0);
    return date.getTime();
  }

  renderReports() {
    this.renderFilteredReports(this.reports);
  }

  renderFilteredReports(reports) {
    if (!this.tableBody) return;

    this.tableBody.innerHTML = '';

    if (!reports.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="5" class="px-6 py-8 text-center text-sm text-neutral-500">
          No reports match your filters.
        </td>
      `;
      this.tableBody.appendChild(emptyRow);
      return;
    }

    reports.forEach((report, index) => {
      const row = this.createReportRow(report, index);
      if (row) {
        this.tableBody.appendChild(row);
      }
    });
  }

  createReportRow() {
    throw new Error('createReportRow must be implemented by subclasses');
  }

  getTimelineDate(report) {
    return report?.shiftDate || report?.reportDate || report?.updatedAtClientIso || report?.createdAtClientIso || report?.updatedAt || report?.createdAt;
  }

  formatDate(dateInput) {
    const date = coerceDate(dateInput);
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  getControllerNames(report) {
    const controller1 = normalizeString(report.controller1?.name || report.controller1);
    const controller2 = normalizeString(report.controller2?.name || report.controller2);

    if (controller1 && controller2 && controller1 !== controller2) {
      return `${controller1}, ${controller2}`;
    }
    return controller1 || controller2 || 'Unknown';
  }

  getSiteName(report) {
    return normalizeString(report.siteName || report.startingDestination || 'Unknown Site');
  }

  showSkeletonLoading(rows = 5) {
    if (!this.tableBody) return;
    const skeleton = Array.from({ length: rows }, () => `
      <tr class="animate-pulse">
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-24"></div></td>
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-40"></div></td>
        <td class="px-6 py-4"><div class="h-6 bg-neutral-200 rounded-full w-24"></div></td>
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-32"></div></td>
        <td class="px-6 py-4 text-right"><div class="h-8 bg-neutral-200 rounded w-24 ml-auto"></div></td>
      </tr>
    `).join('');

    this.tableBody.innerHTML = skeleton;
  }

  showLoading(message = 'Loading...') {
    let loadingEl = document.getElementById('loadingMessage');
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'loadingMessage';
      loadingEl.className = 'fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg';
      document.body.appendChild(loadingEl);
    }
    loadingEl.textContent = message;
    loadingEl.style.display = 'block';
  }

  hideLoading() {
    const loadingEl = document.getElementById('loadingMessage');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  showMessage(message, type = 'info') {
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500'
    };

    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 ${colors[type] || colors.info} text-white px-4 py-2 rounded-lg shadow-lg`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);
  }

  teardownReportListeners() {
    this.reportListeners.forEach((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.warn('Failed to detach listener', error);
      }
    });
    this.reportListeners = [];
  }
}

export class DashboardController extends DashboardBase {
  constructor(options = {}) {
    super({ ...options, searchInputSelector: null, requiredRole: 'controller' });
    this.initialSnapshotState = { controller1: false, controller2: false };
  }

  async onAuthReady() {
    this.showSkeletonLoading();
    this.showLoading('Loading your shift reports...');
    const profile = await userService.getUserProfile(this.currentUser.uid);
    const controllerName = normalizeString(profile.displayName || profile.email);
    this.controllerDisplayName = controllerName;
    await this.subscribeToControllerReports(controllerName);
  }

  async subscribeToControllerReports(controllerName) {
    this.teardownReportListeners();
    this.reportDocs.clear();
    this.reports = [];
    this.initialSnapshotState = { controller1: false, controller2: false };

    const reportsRef = collection(db, 'shiftReports');
    const normalizedName = normalizeString(controllerName);

    const registerListener = (fieldKey) => {
      const q = query(reportsRef, where(fieldKey, '==', normalizedName));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => this.handleSnapshotUpdate(fieldKey, snapshot),
        (error) => {
          console.error('Real-time listener error:', error);
          this.showMessage('Real-time updates failed: ' + error.message, 'error');
          this.hideLoading();
        }
      );
      this.reportListeners.push(unsubscribe);
    };

    registerListener('controller1');
    registerListener('controller2');
  }

  handleSnapshotUpdate(fieldKey, snapshot) {
    if (!this.initialSnapshotState[fieldKey]) {
      this.initialSnapshotState[fieldKey] = true;
      if (this.initialSnapshotState.controller1 && this.initialSnapshotState.controller2) {
        this.hideLoading();
      }
    }

    let changed = false;
    snapshot.docChanges().forEach((change) => {
      const docId = change.doc.id;
      if (change.type === 'removed') {
        changed = this.reportDocs.delete(docId) || changed;
        return;
      }

      const data = { id: docId, ...change.doc.data() };
      this.reportDocs.set(docId, data);
      changed = true;
    });

    if (changed) {
      this.reports = Array.from(this.reportDocs.values());
      this.sortReports();
      this.renderReports();
    }
  }

  createReportRow(report, index) {
    const row = document.createElement('tr');
    row.className = index % 2 === 0 ? 'bg-white hover:bg-neutral-50' : 'bg-neutral-50 hover:bg-neutral-100';

    const reportDate = this.formatDate(this.getTimelineDate(report));
    const siteName = this.getSiteName(report);
    const controllerNames = this.getControllerNames(report);
    const statusBadge = this.buildStatusBadge(report.status);

    row.innerHTML = `
      <td class="whitespace-nowrap px-6 py-4 text-sm text-neutral-600">${reportDate}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-800">${siteName}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm">${statusBadge}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm text-neutral-600">${controllerNames}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm">
        <div class="flex justify-end gap-2">
          <a href="report-form.html?reportId=${report.id}" class="flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100" data-action="view" data-report-id="${report.id}">
            <span class="material-symbols-outlined text-base">visibility</span>
            <span>View</span>
          </a>
          ${this.buildDraftActions(report)}
          <button class="flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100" data-action="download" data-report-id="${report.id}">
            <span class="material-symbols-outlined text-base">download</span>
            <span>Download PDF</span>
          </button>
        </div>
      </td>
    `;

    const submitBtn = row.querySelector('[data-action="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitReport(report.id));
    }

    const downloadBtn = row.querySelector('[data-action="download"]');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadPDF(report.id));
    }

    return row;
  }

  buildDraftActions(report) {
    if (normalizeString(report.status) !== 'draft') {
      return '';
    }

    return `
      <button class="flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100" data-action="submit" data-report-id="${report.id}">
        <span class="material-symbols-outlined text-base">send</span>
        <span>Send for Review</span>
      </button>
    `;
  }

  buildStatusBadge(status) {
    const normalized = normalizeString(status).toLowerCase();
    const config = {
      draft: { className: 'bg-gray-100 text-gray-700', label: 'Draft' },
      submitted: { className: 'bg-yellow-100 text-yellow-800', label: 'Pending Review' },
      under_review: { className: 'bg-orange-100 text-orange-800', label: 'Under Review' },
      approved: { className: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { className: 'bg-red-100 text-red-800', label: 'Rejected' }
    };

    const badge = config[normalized] || { className: 'bg-neutral-100 text-neutral-700', label: status || 'Unknown' };
    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}">${badge.label}</span>`;
  }

  async submitReport(reportId) {
    try {
      this.showLoading('Submitting report for review...');
      const result = await enhancedReportService.submitReport(reportId);
      if (result.success) {
        this.showMessage('Report submitted for review successfully!', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      this.showMessage('Failed to submit report: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }

  async downloadPDF(reportId) {
    try {
      this.showLoading('Preparing PDF...');
      this.showMessage('PDF generation will be implemented in the next phase.', 'info');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      this.showMessage('Failed to generate PDF: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }
}

export class DashboardManager extends DashboardBase {
  constructor(options = {}) {
    super({ ...options, requiredRole: 'manager' });
  }

  async onAuthReady() {
    this.showSkeletonLoading(6);
    this.showLoading('Loading all shift reports...');
    await this.loadAllReports();
    await this.populateControllerFilter();
    await this.setupRealtimeUpdates();
  }

  matchesSearch(report, query) {
    if (!query) return true;
    const haystack = [
      normalizeString(report.reportName),
      normalizeString(report.siteName),
      normalizeString(report.shiftType),
      normalizeString(report.controller1),
      normalizeString(report.controller2),
      normalizeString(report.status)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  async loadAllReports() {
    try {
      const result = await enhancedReportService.getAllReports({ limit: 200 });
      if (result.success) {
        this.setReports(result.reports || []);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      this.showMessage('Failed to load reports: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }

  async setupRealtimeUpdates() {
    this.teardownReportListeners();
    const reportsRef = collection(db, 'shiftReports');
    const q = query(reportsRef, orderBy('updatedAtServer', 'desc'), limit(200));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          if (change.type === 'removed') {
            this.reportDocs.delete(docId);
            return;
          }
          const data = { id: docId, ...change.doc.data() };
          this.reportDocs.set(docId, data);
        });
        this.reports = Array.from(this.reportDocs.values());
        this.sortReports();
        this.renderReports();
      },
      (error) => {
        console.error('Manager dashboard realtime error:', error);
        this.showMessage('Real-time updates failed: ' + (error.message || error), 'error');
      }
    );

    this.reportListeners.push(unsubscribe);
  }

  async populateControllerFilter() {
    const select = this.controllerSelect;
    if (!select) return;

    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(query(usersRef, where('role', 'in', ['controller', 'manager'])));
      const controllers = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.isActive === false) return;
        controllers.push(normalizeString(data.displayName || data.email));
      });

      const unique = Array.from(new Set(controllers)).filter(Boolean).sort();
      select.innerHTML = '<option value="">All Controllers</option>';
      unique.forEach((name) => {
        const option = document.createElement('option');
        option.value = name.toLowerCase();
        option.textContent = name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading controllers for filter:', error);
    }
  }

  createReportRow(report, index) {
    const row = document.createElement('tr');
    row.className = index % 2 === 0 ? 'hover:bg-neutral-50' : 'bg-neutral-50 hover:bg-neutral-50';

    const reportDate = this.formatDate(this.getTimelineDate(report));
    const controllerName = this.getControllerNames(report);
    const statusBadge = this.buildStatusBadge(report.status);
    const approvalHistory = this.getApprovalHistory(report);

    row.innerHTML = `
      <td class="whitespace-nowrap px-6 py-4 text-sm text-neutral-600">${reportDate}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-800">${controllerName}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm">${statusBadge}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm text-neutral-600">${approvalHistory}</td>
      <td class="whitespace-nowrap px-6 py-4 text-sm">
        <div class="flex justify-end gap-2">
          <a href="report-form.html?reportId=${report.id}" class="flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100" data-action="view" data-report-id="${report.id}">
            <span class="material-symbols-outlined text-base">visibility</span>
            <span>View</span>
          </a>
          ${this.buildManagerActions(report)}
          <button class="flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100" data-action="download" data-report-id="${report.id}">
            <span class="material-symbols-outlined text-base">download</span>
            <span>Download PDF</span>
          </button>
        </div>
      </td>
    `;

    const approveBtn = row.querySelector('[data-action="approve"]');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => this.approveReport(report.id));
    }

    const rejectBtn = row.querySelector('[data-action="reject"]');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => this.rejectReport(report.id));
    }

    const downloadBtn = row.querySelector('[data-action="download"]');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadPDF(report.id));
    }

    return row;
  }

  buildManagerActions(report) {
    const status = normalizeString(report.status).toLowerCase();
    if (status !== 'submitted' && status !== 'under_review') {
      return '';
    }

    return `
      <button class="flex items-center justify-center gap-2 rounded-[12px] border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600" data-action="approve" data-report-id="${report.id}">
        <span class="material-symbols-outlined text-base">check</span>
        <span>Approve</span>
      </button>
      <button class="flex items-center justify-center gap-2 rounded-[12px] border border-red-500 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50" data-action="reject" data-report-id="${report.id}">
        <span class="material-symbols-outlined text-base">close</span>
        <span>Reject</span>
      </button>
    `;
  }

  buildStatusBadge(status) {
    const normalized = normalizeString(status).toLowerCase();
    const config = {
      draft: { className: 'badge badge-yellow', label: 'Draft' },
      submitted: { className: 'badge badge-yellow', label: 'Pending Review' },
      under_review: { className: 'badge badge-yellow', label: 'Under Review' },
      approved: { className: 'badge badge-green', label: 'Approved' },
      rejected: { className: 'badge badge-red', label: 'Rejected' }
    };
    const badge = config[normalized] || { className: 'badge bg-gray-100 text-gray-700', label: status || 'Unknown' };
    return `<span class="${badge.className}">${badge.label}</span>`;
  }

  getApprovalHistory(report) {
    const approvals = Array.isArray(report.approvals) ? report.approvals : [];
    if (!approvals.length) {
      return 'No actions recorded yet.';
    }

    const latest = approvals[approvals.length - 1];
    const actor = normalizeString(latest.approverName || latest.approverId);
    const action = normalizeString(latest.action).toLowerCase();
    const timestamp = this.formatDate(latest.timestamp);

    if (action === 'approved') {
      return `Approved by ${actor || 'reviewer'} on ${timestamp}`;
    }
    if (action === 'rejected') {
      return `Rejected by ${actor || 'reviewer'} on ${timestamp}`;
    }
    return 'Awaiting reviewer action.';
  }

  async approveReport(reportId) {
    try {
      this.showLoading('Approving report...');
      const result = await enhancedReportService.approveReport(reportId);
      if (result.success) {
        this.showMessage('Report approved successfully!', 'success');
        await this.loadAllReports();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error approving report:', error);
      this.showMessage('Failed to approve report: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }

  async rejectReport(reportId) {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      this.showLoading('Rejecting report...');
      const result = await enhancedReportService.rejectReport(reportId, reason);
      if (result.success) {
        this.showMessage('Report rejected successfully!', 'success');
        await this.loadAllReports();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error rejecting report:', error);
      this.showMessage('Failed to reject report: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }

  async downloadPDF(reportId) {
    try {
      this.showLoading('Preparing PDF...');
      this.showMessage('PDF generation will be implemented in the next phase.', 'info');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      this.showMessage('Failed to generate PDF: ' + (error.message || error), 'error');
    } finally {
      this.hideLoading();
    }
  }
}
