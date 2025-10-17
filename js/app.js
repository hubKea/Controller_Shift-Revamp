// Main Application Script - Thinkers Afrika Shift Report System
// Handles authentication, role management, and application initialization

import '../firebase-config.js';
import { userService } from './user-service.js';
import { enhancedReportService } from './enhanced-report-service.js';

class App {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.userPermissions = null;
    this.isInitialized = false;

    // Initialize the application
    this.init();
  }

  // Initialize the application
  async init() {
    try {
      console.log('🚀 Initializing Thinkers Afrika Shift Report System...');

      // Set up authentication state listener (now blocking)
      await this.setupAuthListener();

      // Initialize UI components
      this.initializeUI();

      this.isInitialized = true;
      console.log('✅ Application initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize application:', error);
      this.showError('Failed to initialize application. Please refresh the page.');
    }
  }

  // Set up authentication state listener using central guard
  async setupAuthListener() {
    console.log('📱 App: Initializing with Authentication Guard...');

    try {
      // Use the central authentication guard as the primary gatekeeper
      const authResult = await userService.initializeAuthGuard();

      if (authResult.authenticated) {
        console.log(
          '📱 App: User authenticated via guard:',
          authResult.user.email,
          'Role:',
          authResult.role
        );
        this.currentUser = authResult.user;
        this.userRole = authResult.role;
        this.userPermissions = authResult.permissions;

        // Update UI and handle page logic only after authentication is confirmed
        this.updateUserUI(authResult.user, authResult.role);
        this.handlePageLogic();

        if (authResult.error) {
          console.warn('📱 App: Authentication completed with warning:', authResult.error);
        }
      } else {
        console.log('📱 App: User not authenticated via guard');
        this.currentUser = null;
        this.userRole = null;
        this.userPermissions = null;
      }
    } catch (error) {
      console.error('📱 App: Error during authentication guard initialization:', error);
    }
  }

  // Get user permissions from centralized UserService
  async getUserPermissions(uid) {
    try {
      return await userService.getUserPermissions(uid);
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return {
        canApprove: false,
        canViewAll: false,
        canManageUsers: false,
        canCreateReports: false,
      };
    }
  }

  // Update UI with user information
  updateUserUI(user, role) {
    // Update auth status
    const authStatus = document.getElementById('authStatus');
    if (authStatus) {
      authStatus.textContent = `Welcome, ${user.displayName || user.email}`;
    }

    // Update user role
    const userRole = document.getElementById('userRole');
    if (userRole) {
      userRole.textContent = role || 'Controller';
    }

    // Update user initials
    const userInitials = document.getElementById('userInitials');
    if (userInitials) {
      const initials = (user.displayName || user.email).charAt(0).toUpperCase();
      userInitials.textContent = initials;
    }

    // Update user name in dashboard
    const userName = document.getElementById('userName');
    if (userName) {
      userName.textContent = user.displayName || user.email;
    }
  }

  // Handle page-specific logic
  handlePageLogic() {
    const currentPage = this.getCurrentPage();

    switch (currentPage) {
      case 'login':
        this.handleLoginPage();
        break;
      case 'dashboard-manager':
        this.handleManagerDashboard();
        break;
      case 'dashboard-controller':
        this.handleControllerDashboard();
        break;
      case 'index':
        this.handleReportForm();
        break;
      case 'approve':
        this.handleApprovalPage();
        break;
      default:
        console.log('📄 Unknown page, no specific logic needed');
    }
  }

  // Get current page name
  getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop().split('.')[0];

    if (filename === 'index' || filename === '') return 'index';
    if (filename.includes('dashboard-manager')) return 'dashboard-manager';
    if (filename.includes('dashboard-controller')) return 'dashboard-controller';
    if (filename.includes('login')) return 'login';
    if (filename.includes('approve')) return 'approve';

    return 'unknown';
  }

  // Handle login page logic
  handleLoginPage() {
    // Don't redirect here - let the login page's own onAuthStateChanged handle it
    console.log('📄 Login page logic - individual page will handle redirects');
  }

  // Handle manager dashboard logic
  handleManagerDashboard() {
    // Don't redirect here - let the dashboard page's own onAuthStateChanged handle it
    console.log('👑 Manager dashboard logic - individual page will handle redirects');
    this.loadManagerData();
  }

  // Handle controller dashboard logic
  handleControllerDashboard() {
    // Don't redirect here - let the dashboard page's own onAuthStateChanged handle it
    console.log('🎮 Controller dashboard logic - individual page will handle redirects');
    this.loadControllerData();
  }

  // Handle report form logic
  handleReportForm() {
    console.log('📝 Report form loaded');
    this.loadUserReports();
  }

  // Handle approval page logic
  handleApprovalPage() {
    if (!this.userPermissions?.canApprove) {
      console.log('⚠️ User cannot approve reports, redirecting to dashboard');
      this.redirectToDashboard();
      return;
    }

    console.log('✅ Approval page loaded');
    this.loadReportsForApproval();
  }

  // Redirect to appropriate dashboard based on user role
  redirectToDashboard() {
    if (this.userRole === 'manager') {
      window.location.href = 'dashboard-manager.html';
    } else {
      window.location.href = 'dashboard-controller.html';
    }
  }

  // Load manager dashboard data
  async loadManagerData() {
    try {
      console.log('📊 Loading manager dashboard data...');

      // Load all reports
      const reportsResult = await enhancedReportService.getAllReports({ limit: 10 });
      if (reportsResult.success) {
        this.displayReports(reportsResult.reports, 'manager');
      }

      // Load statistics
      const statsResult = await enhancedReportService.getReportStatistics();
      if (statsResult.success) {
        this.displayStatistics(statsResult.statistics);
      }
    } catch (error) {
      console.error('Error loading manager data:', error);
      this.showError('Failed to load dashboard data');
    }
  }

  // Load controller dashboard data
  async loadControllerData() {
    try {
      console.log('📊 Loading controller dashboard data...');

      // Load user's reports
      const reportsResult = await enhancedReportService.getUserReports({ limit: 10 });
      if (reportsResult.success) {
        this.displayReports(reportsResult.reports, 'controller');
      }

      // Load reports for review (if user can approve)
      if (this.userPermissions?.canApprove) {
        const reviewResult = await enhancedReportService.getReportsForReview({ limit: 5 });
        if (reviewResult.success) {
          this.displayReportsForReview(reviewResult.reports);
        }
      }
    } catch (error) {
      console.error('Error loading controller data:', error);
      this.showError('Failed to load dashboard data');
    }
  }

  // Load user reports for report form
  async loadUserReports() {
    try {
      const result = await enhancedReportService.getUserReports({ limit: 4 });
      if (result.success) {
        this.displayUserReports(result.reports);
      }
    } catch (error) {
      console.error('Error loading user reports:', error);
    }
  }

  // Load reports for approval
  async loadReportsForApproval() {
    try {
      const result = await enhancedReportService.getReportsForReview();
      if (result.success) {
        this.displayReportsForApproval(result.reports);
      }
    } catch (error) {
      console.error('Error loading reports for approval:', error);
    }
  }

  // Display reports in dashboard
  displayReports(reports, userType) {
    const reportsContainer =
      document.getElementById('reportsList') || document.getElementById('reportsContainer');
    if (!reportsContainer) return;

    reportsContainer.innerHTML = '';

    if (reports.length === 0) {
      reportsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No reports found</p>';
      return;
    }

    reports.forEach((report) => {
      const reportCard = this.createReportCard(report, userType);
      reportsContainer.appendChild(reportCard);
    });
  }

  // Create report card element
  createReportCard(report, userType) {
    const card = document.createElement('div');
    card.className =
      'p-4 border border-gray-200 rounded-xl bg-white hover:shadow-md transition-shadow';

    const statusBadge = this.getStatusBadge(report.status);
    const timelineDate = this.getTimelineDate(report);
    const date = timelineDate ? new Date(timelineDate).toLocaleDateString() : 'N/A';

    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold text-gray-900">${report.reportName || 'Unnamed Report'}</h3>
        ${statusBadge}
      </div>
      <div class="text-sm text-gray-600 mb-2">
        <div>Date: ${report.shiftDate || date}</div>
        <div>Shift: ${report.shiftType || 'Not specified'}</div>
        <div>Site: ${report.siteName || 'Not specified'}</div>
      </div>
      <div class="flex gap-2">
        <button class="view-report-btn px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600" data-report-id="${report.id}">
          View
        </button>
        ${this.getActionButtons(report, userType)}
      </div>
    `;

    // Add event listeners
    this.addReportCardListeners(card, report);

    return card;
  }

  getTimelineDate(report) {
    if (!report) return null;
    if (report.shiftDate) return report.shiftDate;
    if (report.updatedAtClientIso) return report.updatedAtClientIso;
    if (report.createdAtClientIso) return report.createdAtClientIso;
    if (report.updatedAt) {
      if (typeof report.updatedAt.toDate === 'function') {
        return report.updatedAt.toDate();
      }
      return report.updatedAt;
    }
    if (report.createdAt) {
      if (typeof report.createdAt.toDate === 'function') {
        return report.createdAt.toDate();
      }
      return report.createdAt;
    }
    return null;
  }

  // Get action buttons based on user type and report status
  getActionButtons(report, userType) {
    let buttons = '';

    if (userType === 'manager') {
      if (report.status === 'draft') {
        buttons += `<button class="edit-report-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600" data-report-id="${report.id}">Edit</button>`;
      }
      if (report.status === 'submitted') {
        buttons += `<button class="approve-report-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600" data-report-id="${report.id}">Approve</button>`;
        buttons += `<button class="reject-report-btn px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600" data-report-id="${report.id}">Reject</button>`;
      }
    } else if (userType === 'controller') {
      if (report.status === 'draft') {
        buttons += `<button class="edit-report-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600" data-report-id="${report.id}">Edit</button>`;
        buttons += `<button class="submit-report-btn px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600" data-report-id="${report.id}">Submit</button>`;
      }
      if (report.status === 'submitted' && this.userPermissions?.canApprove) {
        buttons += `<button class="approve-report-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600" data-report-id="${report.id}">Approve</button>`;
        buttons += `<button class="reject-report-btn px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600" data-report-id="${report.id}">Reject</button>`;
      }
    }

    return buttons;
  }

  // Add event listeners to report card
  addReportCardListeners(card, report) {
    // View button
    const viewBtn = card.querySelector('.view-report-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => this.viewReport(report.id));
    }

    // Edit button
    const editBtn = card.querySelector('.edit-report-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.editReport(report.id));
    }

    // Submit button
    const submitBtn = card.querySelector('.submit-report-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitReport(report.id));
    }

    // Approve button
    const approveBtn = card.querySelector('.approve-report-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => this.approveReport(report.id));
    }

    // Reject button
    const rejectBtn = card.querySelector('.reject-report-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => this.rejectReport(report.id));
    }
  }

  // Get status badge HTML
  getStatusBadge(status) {
    const badges = {
      draft:
        '<span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">Draft</span>',
      submitted:
        '<span class="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">Submitted</span>',
      approved:
        '<span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Approved</span>',
      rejected:
        '<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Rejected</span>',
    };
    return (
      badges[status] ||
      '<span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">Unknown</span>'
    );
  }

  // Display user reports (for report form page)
  displayUserReports(reports) {
    const reportsList = document.getElementById('savedReportsList');
    if (!reportsList) return;

    reportsList.innerHTML = '';

    reports.forEach((report) => {
      const card = document.createElement('div');
      card.className =
        'p-4 border border-gray-200 rounded-xl bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors';

      const statusBadge = this.getStatusBadge(report.status);

      card.innerHTML = `
        <div>
          <div class="font-semibold text-gray-900">${report.reportName || 'Unnamed Report'}</div>
          <div class="text-sm text-gray-600">${report.shiftDate || ''} • ${report.shiftType || ''}</div>
          <div class="mt-1">${statusBadge}</div>
        </div>
        <div class="flex gap-2">
          <button class="load-report-btn px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600" data-report-id="${report.id}">
            Load
          </button>
          <button class="delete-report-btn px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600" data-report-id="${report.id}">
            Delete
          </button>
        </div>
      `;

      reportsList.appendChild(card);
    });
  }

  // Display statistics (for manager dashboard)
  displayStatistics(stats) {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-xl border border-gray-200">
          <div class="text-2xl font-bold text-blue-600">${stats.total || 0}</div>
          <div class="text-sm text-gray-600">Total Reports</div>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
          <div class="text-2xl font-bold text-yellow-600">${stats.submitted || 0}</div>
          <div class="text-sm text-gray-600">Submitted</div>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
          <div class="text-2xl font-bold text-green-600">${stats.approved || 0}</div>
          <div class="text-sm text-gray-600">Approved</div>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-200">
          <div class="text-2xl font-bold text-red-600">${stats.rejected || 0}</div>
          <div class="text-sm text-gray-600">Rejected</div>
        </div>
      </div>
    `;
  }

  // Report actions
  async viewReport(reportId) {
    try {
      const result = await enhancedReportService.getReport(reportId);
      if (result.success) {
        // Redirect to report form with data
        window.location.href = `index.html?reportId=${reportId}`;
      } else {
        this.showError('Failed to load report: ' + result.error);
      }
    } catch (error) {
      this.showError('Error loading report: ' + error.message);
    }
  }

  async editReport(reportId) {
    try {
      const result = await enhancedReportService.getReport(reportId);
      if (result.success) {
        // Redirect to report form for editing
        window.location.href = `index.html?edit=${reportId}`;
      } else {
        this.showError('Failed to load report for editing: ' + result.error);
      }
    } catch (error) {
      this.showError('Error loading report for editing: ' + error.message);
    }
  }

  async submitReport(reportId) {
    if (confirm('Are you sure you want to submit this report for review?')) {
      try {
        const result = await enhancedReportService.submitReport(reportId);
        if (result.success) {
          this.showSuccess('Report submitted successfully');
          this.handlePageLogic(); // Refresh the page
        } else {
          this.showError('Failed to submit report: ' + result.error);
        }
      } catch (error) {
        this.showError('Error submitting report: ' + error.message);
      }
    }
  }

  async approveReport(reportId) {
    const comment = prompt('Enter approval comment (optional):');
    try {
      const result = await enhancedReportService.approveReport(reportId, comment || '');
      if (result.success) {
        this.showSuccess('Report approved successfully');
        this.handlePageLogic(); // Refresh the page
      } else {
        this.showError('Failed to approve report: ' + result.error);
      }
    } catch (error) {
      this.showError('Error approving report: ' + error.message);
    }
  }

  async rejectReport(reportId) {
    const comment = prompt('Enter rejection reason (required):');
    if (!comment || comment.trim() === '') {
      this.showError('Rejection reason is required');
      return;
    }

    try {
      const result = await enhancedReportService.rejectReport(reportId, comment);
      if (result.success) {
        this.showSuccess('Report rejected successfully');
        this.handlePageLogic(); // Refresh the page
      } else {
        this.showError('Failed to reject report: ' + result.error);
      }
    } catch (error) {
      this.showError('Error rejecting report: ' + error.message);
    }
  }

  // Initialize UI components
  initializeUI() {
    // Set up logout functionality
    this.setupLogout();

    // Set up navigation
    this.setupNavigation();

    // Set up form handlers
    this.setupFormHandlers();
  }

  // Set up logout functionality
  setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  // Set up navigation
  setupNavigation() {
    // Add click handlers for navigation links
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-nav]')) {
        e.preventDefault();
        const page = e.target.dataset.nav;
        this.navigateToPage(page);
      }
    });
  }

  // Set up form handlers
  setupFormHandlers() {
    // Handle report form submission
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
      reportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleReportFormSubmit();
      });
    }
  }

  // Navigate to page
  navigateToPage(page) {
    switch (page) {
      case 'dashboard':
        this.redirectToDashboard();
        break;
      case 'new-report':
        window.location.href = 'report-form.html';
        break;
      case 'approve':
        if (this.userPermissions?.canApprove) {
          window.location.href = 'approve.html';
        } else {
          this.showError('You do not have permission to approve reports');
        }
        break;
      case 'logout':
        this.logout();
        break;
    }
  }

  // Handle report form submission
  async handleReportFormSubmit() {
    try {
      const formData = this.collectFormData();
      const result = await enhancedReportService.createReport(formData);

      if (result.success) {
        this.showSuccess('Report saved successfully');
        this.loadUserReports(); // Refresh the list
      } else {
        this.showError('Failed to save report: ' + result.error);
      }
    } catch (error) {
      this.showError('Error saving report: ' + error.message);
    }
  }

  // Collect form data
  collectFormData() {
    // This would collect data from the form
    // Implementation depends on your form structure
    return {};
  }

  // Logout user
  async logout() {
    try {
      await userService.logout();
      this.showSuccess('Logged out successfully');
      window.location.href = 'index.html';
    } catch (error) {
      this.showError('Error logging out: ' + error.message);
    }
  }

  // Show success message
  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  // Show error message
  showError(message) {
    this.showMessage(message, 'error');
  }

  // Show message
  showMessage(message, type) {
    // Create or update message element
    let messageEl = document.getElementById('appMessage');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'appMessage';
      messageEl.className = 'fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm';
      document.body.appendChild(messageEl);
    }

    const colors = {
      success: 'bg-green-100 text-green-800 border border-green-200',
      error: 'bg-red-100 text-red-800 border border-red-200',
      info: 'bg-blue-100 text-blue-800 border border-blue-200',
    };

    messageEl.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${colors[type] || colors.info}`;
    messageEl.textContent = message;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (messageEl) {
        messageEl.remove();
      }
    }, 5000);
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

// Export for use in other modules
export default App;
