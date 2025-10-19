
import { db } from "../firebase-config.js";
import { userService } from "./user-service.js";
import { enhancedReportService } from "./enhanced-report-service.js";
import { generatePdf } from "./pdf-service.js";
import { ROLE_CONTROLLER, ROLE_MANAGER } from "./constants.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const DEFAULT_SELECTORS = {
  dateRangeSelector: "#date-range",
  controllerSelectSelector: "#controller",
  statusSelectSelector: "#status",
  applyButtonSelector: "#filter-apply",
  clearButtonSelector: "#filter-clear",
  tableBodySelector: "#reports-table-body",
  searchInputSelector: "#dashboard-search"
};

function debounce(fn, delay = 300) {
  let timeoutId;
  return function debounced(...args) {
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(context, args), delay);
  };
}

function coerceDate(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input?.toDate === "function") {
    const converted = input.toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeString(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return value ?? "";
}

function lowercase(value) {
  return normalizeString(value).toLowerCase();
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
    this.reportListeners = [];
    this.onFiltersChanged = (filters) => this.applyFilters(filters);

    this.triggerFilterUpdate = this.triggerFilterUpdate.bind(this);
    this.debouncedTriggerFilterUpdate = debounce(() => this.triggerFilterUpdate(), 300);

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
    this.searchInput = selectors.searchInputSelector
      ? document.querySelector(selectors.searchInputSelector)
      : null;
    this.filtersIndicator = document.querySelector("#filters-active-indicator");
  }

  initializeEventListeners() {
    if (this.applyButton) {
      this.applyButton.addEventListener("click", this.triggerFilterUpdate);
    }
    if (this.clearButton) {
      this.clearButton.addEventListener("click", () => this.handleClearFilters());
    }
    if (this.dateRangeInput) {
      this.dateRangeInput.addEventListener("change", this.triggerFilterUpdate);
    }
    if (this.controllerSelect) {
      this.controllerSelect.addEventListener("change", this.triggerFilterUpdate);
    }
    if (this.statusSelect) {
      this.statusSelect.addEventListener("change", this.triggerFilterUpdate);
    }
    if (this.searchInput) {
      this.searchInput.addEventListener("input", this.debouncedTriggerFilterUpdate);
    }

    this.updateFilterIndicator(this.getFilterValues());
  }

  async setupAuthListener() {
    try {
      const authResult = await userService.initializeAuthGuard();
      if (!authResult.authenticated) {
        return;
      }

      if (this.requiredRole && authResult.role !== this.requiredRole) {
        this.showMessage("You do not have permission to view this dashboard.", "error");
        return;
      }

      this.currentUser = authResult.user;
      this.userRole = authResult.role;
      this.userPermissions = authResult.permissions;

      this.updateHeader();
      await this.onAuthReady(authResult);
    } catch (error) {
      console.error("Dashboard authentication error:", error);
      this.showMessage("Failed to authenticate user", "error");
    }
  }

  // Intended to be overridden by subclasses
  async onAuthReady() {}

  triggerFilterUpdate() {
    const filters = this.getFilterValues();
    this.updateFilterIndicator(filters);
    const result = this.onFiltersChanged(filters);
    if (result && typeof result.then === "function") {
      result.catch((error) => {
        console.error("Dashboard filter update error:", error);
        this.showMessage("Failed to update dashboard data", "error");
      });
    }
  }

  getFilterValues() {
    const date = lowercase(this.dateRangeInput?.value);

    let controllerRaw = "";
    let controllerNormalized = "";
    if (this.controllerSelect) {
      const selected = this.controllerSelect.selectedOptions?.[0];
      if (selected) {
        controllerRaw = normalizeString(selected.value);
        controllerNormalized = lowercase(selected.dataset.filterValue ?? selected.value);
      }
    }
    if (!controllerRaw || controllerNormalized === "all controllers") {
      controllerRaw = "";
      controllerNormalized = "";
    }

    const statuses = [];
    if (this.statusSelect) {
      const options = this.statusSelect.multiple
        ? Array.from(this.statusSelect.selectedOptions)
        : [this.statusSelect.selectedOptions?.[0]].filter(Boolean);
      options.forEach((option) => {
        const value = lowercase(option?.value);
        if (value) {
          statuses.push(value);
        }
      });
    }

    const search = lowercase(this.searchInput?.value);

    return {
      date,
      controller: controllerNormalized,
      controllerRaw,
      statuses,
      search
    };
  }

  handleClearFilters() {
    if (this.dateRangeInput) {
      this.dateRangeInput.value = "";
    }
    if (this.controllerSelect) {
      this.controllerSelect.selectedIndex = 0;
    }
    if (this.statusSelect) {
      Array.from(this.statusSelect.options).forEach((option) => {
        option.selected = false;
      });
    }
    if (this.searchInput) {
      this.searchInput.value = "";
    }

    this.triggerFilterUpdate();
  }

  applyFilters(filters = null) {
    const criteria = filters ?? this.getFilterValues();
    const filtered = this.reports.filter((report) => this.matchesFilters(report, criteria));
    this.renderFilteredReports(filtered);
  }

  matchesFilters(report, filters) {
    const statuses = Array.isArray(filters.statuses) ? filters.statuses : [];
    const status = lowercase(report.status);
    const statusMatch = !statuses.length || statuses.includes(status);

    const dateFilter = filters.date;
    const reportDate = this.formatDate(this.getTimelineDate(report)).toLowerCase();
    const dateMatch = !dateFilter || reportDate.includes(dateFilter);

    const controllerFilter = filters.controller;
    const controllerMatch =
      !controllerFilter ||
      lowercase(report.controller1).includes(controllerFilter) ||
      lowercase(report.controller2).includes(controllerFilter) ||
      this.getControllerNames(report).toLowerCase().includes(controllerFilter);

    const searchMatch = this.matchesSearch(report, filters.search);

    return statusMatch && dateMatch && controllerMatch && searchMatch;
  }

  matchesSearch(report, query) {
    if (!query) return true;
    const haystack = [
      normalizeString(report.reportName),
      this.getSiteName(report),
      normalizeString(report.shiftType),
      normalizeString(report.controller1),
      normalizeString(report.controller2)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  }

  updateFilterIndicator(filters) {
    if (!this.filtersIndicator) return;
    const activeLabels = [];
    if (filters.search) {
      activeLabels.push(`Search: "${filters.search}"`);
    }
    if (filters.statuses?.length) {
      const count = filters.statuses.length;
      activeLabels.push(`Status (${count})`);
    }
    if (filters.controllerRaw) {
      activeLabels.push(`Controller: ${filters.controllerRaw}`);
    }
    if (filters.date) {
      activeLabels.push("Date range");
    }

    const hasActiveFilters = activeLabels.length > 0;
    if (hasActiveFilters) {
      this.filtersIndicator.textContent = `Filters active: ${activeLabels.join(" · ")}`;
      this.filtersIndicator.classList.remove("hidden");
    } else {
      this.filtersIndicator.textContent = "";
      this.filtersIndicator.classList.add("hidden");
    }

    if (this.clearButton) {
      this.clearButton.disabled = !hasActiveFilters;
      this.clearButton.classList.toggle("opacity-50", !hasActiveFilters);
      this.clearButton.classList.toggle("cursor-not-allowed", !hasActiveFilters);
      this.clearButton.setAttribute("aria-disabled", String(!hasActiveFilters));
    }
  }

  setReports(reports) {
    this.reports = Array.isArray(reports) ? [...reports] : [];
    this.sortReports();
    this.applyFilters();
  }

  sortReports() {
    this.reports.sort((a, b) => {
      const aTime = this.getComparableTime(a);
      const bTime = this.getComparableTime(b);
      return bTime - aTime;
    });
  }

  getComparableTime(report) {
    const timelineDate = coerceDate(this.getTimelineDate(report));
    const fallback = coerceDate(report.createdAt) || new Date(0);
    return (timelineDate || fallback).getTime();
  }

  renderFilteredReports(reports) {
    if (!this.tableBody) return;

    this.tableBody.innerHTML = "";

    if (!reports.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = 
        <td colspan="5" class="px-6 py-8 text-center text-sm text-neutral-500">
          No reports match your filters.
        </td>
      ;
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
    throw new Error("createReportRow must be implemented by subclasses");
  }

  getTimelineDate(report) {
    return (
      report?.shiftDate ||
      report?.reportDate ||
      report?.updatedAtClientIso ||
      report?.createdAtClientIso ||
      report?.updatedAt ||
      report?.createdAt
    );
  }

  formatDate(value) {
    const date = coerceDate(value);
    if (!date) return "N/A";
    return date.toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  }

  getControllerNames(report) {
    const controller1 = normalizeString(report.controller1?.name || report.controller1);
    const controller2 = normalizeString(report.controller2?.name || report.controller2);

    if (controller1 && controller2 && controller1 !== controller2) {
      return ${controller1}, ;
    }
    return controller1 || controller2 || "Unknown";
  }

  getSiteName(report) {
    return normalizeString(report.siteName || report.startingDestination || "Unknown Site");
  }

  showSkeletonLoading(rows = 5) {
    if (!this.tableBody) return;
    const skeleton = Array.from({ length: rows }, () => 
      <tr class="animate-pulse">
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-24"></div></td>
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-40"></div></td>
        <td class="px-6 py-4"><div class="h-6 bg-neutral-200 rounded-full w-24"></div></td>
        <td class="px-6 py-4"><div class="h-4 bg-neutral-200 rounded w-32"></div></td>
        <td class="px-6 py-4 text-right"><div class="h-8 bg-neutral-200 rounded w-24 ml-auto"></div></td>
      </tr>
    ).join("");

    this.tableBody.innerHTML = skeleton;
  }

  showLoading(message = "Loading...") {
    let loadingEl = document.getElementById("loadingMessage");
    if (!loadingEl) {
      loadingEl = document.createElement("div");
      loadingEl.id = "loadingMessage";
      loadingEl.className = "fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg";
      document.body.appendChild(loadingEl);
    }
    loadingEl.textContent = message;
    loadingEl.style.display = "block";
  }

  hideLoading() {
    const loadingEl = document.getElementById("loadingMessage");
    if (loadingEl) {
      loadingEl.style.display = "none";
    }
  }

  showMessage(message, type = "info") {
    const colors = {
      success: "bg-green-500",
      error: "bg-red-500",
      info: "bg-blue-500"
    };

    const toast = document.createElement("div");
    toast.className = 
ixed top-4 right-4 z-50  text-white px-4 py-2 rounded-lg shadow-lg;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);
  }

  async downloadPDF(reportId) {
    if (!reportId) {
      this.showMessage("Invalid report identifier provided.", "error");
      return;
    }

    try {
      this.showLoading("Preparing PDF...");
      const response = await enhancedReportService.getReport(reportId);
      if (!response.success) {
        throw new Error(response.error || "Unable to fetch report data");
      }

      const reportData = { id: reportId, ...(response.data || {}) };

      if (reportData.pdfUrl && typeof window !== "undefined") {
        window.open(reportData.pdfUrl, "_blank", "noopener");
        this.showMessage("Opening stored PDF file...", "success");
        return;
      }

      await generatePdf(reportData, { autoDownload: true });

      if (typeof enhancedReportService.markPdfGenerated === "function") {
        await enhancedReportService.markPdfGenerated(reportId);
      }

      const reportIndex = this.reports.findIndex((item) => item.id === reportId);
      if (reportIndex >= 0) {
        this.reports[reportIndex] = { ...this.reports[reportIndex], pdfGenerated: true };
      }

      this.showMessage("PDF downloaded successfully!", "success");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      this.showMessage("Failed to generate PDF: " + (error.message || error), "error");
    } finally {
      this.hideLoading();
    }
  }

  updateHeader() {
    const userAvatar = document.querySelector(
      '.h-10.w-10.rounded-full, header img[alt="User avatar"]'
    );
    if (!userAvatar || !this.currentUser) return;

    const userName =
      this.currentUser.displayName ||
      this.currentUser.email?.split("@")[0] ||
      "User";
    const profilePhoto = this.currentUser.photoURL;

    if ("src" in userAvatar) {
      userAvatar.src =
        profilePhoto ||
        https://ui-avatars.com/api/?name=&background=137fec&color=fff&size=40;
    } else if ("style" in userAvatar) {
      userAvatar.style.backgroundImage = profilePhoto
        ? url("")
        : url("https://ui-avatars.com/api/?name=&background=137fec&color=fff&size=40");
    }
  }

  buildStatusBadge(status) {
    const normalized = lowercase(status);
    const config = {
      draft: { className: "bg-gray-100 text-gray-700", label: "Draft" },
      submitted: { className: "bg-yellow-100 text-yellow-800", label: "Pending Review" },
      under_review: { className: "bg-orange-100 text-orange-800", label: "Under Review" },
      approved: { className: "bg-green-100 text-green-800", label: "Approved" },
      rejected: { className: "bg-red-100 text-red-800", label: "Rejected" }
    };

    const badge = config[normalized] || {
      className: "bg-neutral-100 text-neutral-700",
      label: status || "Unknown"
    };

    return <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium "></span>;
  }

  teardownReportListeners() {
    this.reportListeners.forEach((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.error("Failed to detach listener", error);
      }
    });
    this.reportListeners = [];
  }
}
export class DashboardController extends DashboardBase {
  constructor(options = {}) {
    super({ ...options, searchInputSelector: null, requiredRole: ROLE_CONTROLLER });
    this.initialSnapshotState = { controller1: false, controller2: false };
  }

  async onAuthReady() {
    this.showSkeletonLoading();
    this.showLoading("Loading your shift reports...");

    const profile = await userService.getUserProfile(this.currentUser.uid);
    const controllerName = normalizeString(profile.displayName || profile.email);
    this.controllerDisplayName = controllerName;

    await this.subscribeToControllerReports(controllerName);
    this.updateFilterIndicator(this.getFilterValues());
  }

  async subscribeToControllerReports(controllerName) {
    this.teardownReportListeners();
    this.reportDocs = new Map();
    this.reports = [];
    this.initialSnapshotState = { controller1: false, controller2: false };

    const reportsRef = collection(db, "shiftReports");
    const normalizedName = normalizeString(controllerName);

    const registerListener = (fieldKey) => {
      const q = query(reportsRef, where(fieldKey, "==", normalizedName));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => this.handleSnapshotUpdate(fieldKey, snapshot),
        (error) => {
          console.error("Real-time listener error:", error);
          this.showMessage("Real-time updates failed: " + (error.message || error), "error");
          this.hideLoading();
        }
      );
      this.reportListeners.push(unsubscribe);
    };

    registerListener("controller1");
    registerListener("controller2");
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
      if (change.type === "removed") {
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
      this.applyFilters();
    }
  }

  createReportRow(report, index) {
    const row = document.createElement("tr");
    row.className = index % 2 === 0 ? "bg-white hover:bg-neutral-50" : "bg-neutral-50 hover:bg-neutral-100";

    const reportDate = this.formatDate(this.getTimelineDate(report));
    const siteName = this.getSiteName(report);
    const controllerNames = this.getControllerNames(report);
    const statusBadge = this.buildStatusBadge(report.status);

    row.innerHTML = 
      <td class=\"whitespace-nowrap px-6 py-4 text-sm text-neutral-600\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-800\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm text-neutral-600\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm\">
        <div class=\"flex justify-end gap-2\">
          <a href=\"report-form.html?reportId=\" class=\"flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100\" data-action=\"view\" data-report-id=\"\">
            <span class=\"material-symbols-outlined text-base\">visibility</span>
            <span>View</span>
          </a>
          
          <button class=\"flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100\" data-action=\"download\" data-report-id=\"\">
            <span class=\"material-symbols-outlined text-base\">download</span>
            <span>Download PDF</span>
          </button>
        </div>
      </td>
    ;

    const submitBtn = row.querySelector('[data-action="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener("click", () => this.submitReport(report.id));
    }

    const downloadBtn = row.querySelector('[data-action="download"]');
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => this.downloadPDF(report.id));
    }

    return row;
  }

  buildDraftActions(report) {
    if (lowercase(report.status) !== "draft") {
      return "";
    }

    return 
      <button class=\"flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100\" data-action=\"submit\" data-report-id=\"\">
        <span class=\"material-symbols-outlined text-base\">send</span>
        <span>Send for Review</span>
      </button>
    ;
  }

  async submitReport(reportId) {
    try {
      this.showLoading("Submitting report for review...");
      const result = await enhancedReportService.submitReport(reportId);
      if (result.success) {
        this.showMessage("Report submitted for review successfully!", "success");
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      this.showMessage("Failed to submit report: " + (error.message || error), "error");
    } finally {
      this.hideLoading();
    }
  }

  async downloadPDF(reportId) {
    await super.downloadPDF(reportId);
  }
}
export class DashboardManager extends DashboardBase {
  constructor(options = {}) {
    super({ ...options, requiredRole: ROLE_MANAGER });
    this.onFiltersChanged = (filters) => this.refreshReports(filters);
    this.lastFetchSignature = null;
    this.controllerOptionsLoaded = false;
  }

  async onAuthReady() {
    await this.populateControllerFilter();
    this.updateFilterIndicator(this.getFilterValues());
    await this.refreshReports(this.getFilterValues());
  }

  async populateControllerFilter() {
    if (this.controllerOptionsLoaded || !this.controllerSelect) return;

    try {
      const functionsModule = await import(
        "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js"
      );
      const functions = functionsModule.getFunctions();
      const listForAssign = functionsModule.httpsCallable(functions, "users-listForAssign");
      const response = await listForAssign({ roles: ["controller"] });
      const items = Array.isArray(response?.data?.items) ? response.data.items : [];

      const controllers = new Set();
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const name = normalizeString(item.displayName || item.email);
        if (name) controllers.add(name);
      });

      const select = this.controllerSelect;
      select.innerHTML = "";
      const anyOption = document.createElement("option");
      anyOption.value = "";
      anyOption.dataset.filterValue = "all controllers";
      anyOption.textContent = "All Controllers";
      select.appendChild(anyOption);

      Array.from(controllers)
        .sort((a, b) => a.localeCompare(b))
        .forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.dataset.filterValue = name.toLowerCase();
          option.textContent = name;
          select.appendChild(option);
        });

      this.controllerOptionsLoaded = true;
    } catch (error) {
      console.error("Error populating controller filter:", error);
    }
  }

  async refreshReports(filters) {
    const normalizedStatuses = [...new Set(filters.statuses.map((status) => lowercase(status)))].sort();
    const signature = JSON.stringify({
      statuses: normalizedStatuses,
      controller: filters.controllerRaw || "",
      search: filters.search || ""
    });

    if (signature === this.lastFetchSignature) {
      this.applyFilters(filters);
      return;
    }

    if (normalizedStatuses.length > 10) {
    }

    const hasSearch = Boolean(filters.search);
    const searchTokens = hasSearch ? this.buildSearchTokens(filters.search) : [];

    this.showLoading("Loading reports...");
    this.showSkeletonLoading(6);

    try {
      const reportsRef = collection(db, "shiftReports");
      const baseConstraints = [];

      if (normalizedStatuses.length === 1) {
        baseConstraints.push(where("status", "==", normalizedStatuses[0]));
      } else if (normalizedStatuses.length > 1) {
        baseConstraints.push(where("status", "in", normalizedStatuses.slice(0, 10)));
      }

      const maxResults = hasSearch ? 100 : 200;
      const buildQuery = (additional = []) =>
        query(
          reportsRef,
          ...baseConstraints,
          ...additional,
          orderBy("updatedAtServer", "desc"),
          limit(maxResults)
        );

      const queries = [];
      if (filters.controllerRaw) {
        queries.push(buildQuery([where("controller1", "==", filters.controllerRaw)]));
        queries.push(buildQuery([where("controller2", "==", filters.controllerRaw)]));
      } else {
        const searchConstraint = this.buildSearchConstraint(searchTokens);
        if (searchConstraint) {
          queries.push(buildQuery([searchConstraint]));
        }
        queries.push(buildQuery());
      }

      const docsMap = new Map();
      await Promise.all(
        queries.map(async (q) => {
          const snapshot = await getDocs(q);
          snapshot.forEach((docSnap) => {
            docsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
        })
      );

      this.lastFetchSignature = signature;
      this.reports = Array.from(docsMap.values());
      this.sortReports();
      this.applyFilters(filters);
    } catch (error) {
      this.lastFetchSignature = null;
      console.error("Error loading reports:", error);
      this.showMessage("Failed to load reports: " + (error.message || error), "error");
    } finally {
      this.hideLoading();
    }
  }

  buildSearchTokens(searchValue = "") {
    return searchValue
      .split(/\s+/)
      .map((token) => lowercase(token))
      .filter((token) => token.length)
      .slice(0, 10);
  }

  buildSearchConstraint(tokens) {
    if (!tokens?.length) return null;
    if (tokens.length === 1) {
      return where("searchKeywords", "array-contains", tokens[0]);
    }
    return where("searchKeywords", "array-contains-any", tokens.slice(0, 10));
  }

  createReportRow(report, index) {
    const row = document.createElement("tr");
    row.className = index % 2 === 0 ? "hover:bg-neutral-50" : "bg-neutral-50 hover:bg-neutral-50";

    const reportDate = this.formatDate(this.getTimelineDate(report));
    const controllerName = this.getControllerNames(report);
    const statusBadge = this.buildStatusBadge(report.status);
    const approvalHistory = this.getApprovalHistory(report);

    row.innerHTML = 
      <td class=\"whitespace-nowrap px-6 py-4 text-sm text-neutral-600\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-800\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm text-neutral-600\"></td>
      <td class=\"whitespace-nowrap px-6 py-4 text-sm\">
        <div class=\"flex justify-end gap-2\">
          <a href=\"report-form.html?reportId=\" class=\"flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100\" data-action=\"view\" data-report-id=\"\">
            <span class=\"material-symbols-outlined text-base\">visibility</span>
            <span>View</span>
          </a>
          
          <button class=\"flex items-center justify-center gap-2 rounded-[12px] border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100\" data-action=\"download\" data-report-id=\"\">
            <span class=\"material-symbols-outlined text-base\">download</span>
            <span>Download PDF</span>
          </button>
        </div>
      </td>
    ;

    const actionsContainer = row.querySelector('.flex.justify-end.gap-2');
    if (actionsContainer) {
      const chatLink = document.createElement('a');
      chatLink.href = `messages.html?conv=${report.id}`;
      chatLink.className =
        'flex items-center justify-center gap-2 rounded-[12px] border border-blue-500 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
      chatLink.setAttribute('data-action', 'chat');
      chatLink.setAttribute('aria-label', 'Open chat for this report');

      const chatIcon = document.createElement('span');
      chatIcon.className = 'material-symbols-outlined text-base';
      chatIcon.textContent = 'chat';

      const chatLabel = document.createElement('span');
      chatLabel.textContent = 'Open chat';

      chatLink.append(chatIcon, chatLabel);

      const downloadButton = actionsContainer.querySelector('[data-action="download"]');
      if (downloadButton) {
        actionsContainer.insertBefore(chatLink, downloadButton);
      } else {
        actionsContainer.appendChild(chatLink);
      }
    }

    const approveBtn = row.querySelector('[data-action="approve"]');
    if (approveBtn) {
      approveBtn.addEventListener("click", () => this.approveReport(report.id));
    }

    const rejectBtn = row.querySelector('[data-action="reject"]');
    if (rejectBtn) {
      rejectBtn.addEventListener("click", () => this.rejectReport(report.id));
    }

    const downloadBtn = row.querySelector('[data-action="download"]');
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => this.downloadPDF(report.id));
    }

    return row;
  }

  buildManagerActions(report) {
    const status = lowercase(report.status);
    if (status !== "submitted" && status !== "under_review") {
      return "";
    }

    return 
      <button class=\"flex items-center justify-center gap-2 rounded-[12px] border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600\" data-action=\"approve\" data-report-id=\"\">
        <span class=\"material-symbols-outlined text-base\">check</span>
        <span>Approve</span>
      </button>
      <button class=\"flex items-center justify-center gap-2 rounded-[12px] border border-red-500 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50\" data-action=\"reject\" data-report-id=\"\">
        <span class=\"material-symbols-outlined text-base\">close</span>
        <span>Reject</span>
      </button>
    ;
  }

  getApprovalHistory(report) {
    const approvals = Array.isArray(report.approvals) ? report.approvals : [];
    if (!approvals.length) {
      return "No actions recorded yet.";
    }

    const latest = approvals[approvals.length - 1];
    const actor = normalizeString(latest.approverName || latest.approverId);
    const action = lowercase(latest.action);
    const timestamp = this.formatDate(latest.timestamp);

    if (action === "approved") {
      return Approved by  on ;
    }
    if (action === "rejected") {
      return Rejected by  on ;
    }
    return "Awaiting reviewer action.";
  }

  async approveReport(reportId) {
    try {
      this.showLoading("Approving report...");
      const result = await enhancedReportService.approveReport(reportId);
      if (result.success) {
        this.showMessage("Report approved successfully!", "success");
        await this.refreshReports(this.getFilterValues());
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error approving report:", error);
      this.showMessage("Failed to approve report: " + (error.message || error), "error");
    } finally {
      this.hideLoading();
    }
  }

  async rejectReport(reportId) {
    const reason = prompt("Please provide a reason for rejection:");
    if (!reason) return;

    try {
      this.showLoading("Rejecting report...");
      const result = await enhancedReportService.rejectReport(reportId, reason);
      if (result.success) {
        this.showMessage("Report rejected successfully!", "success");
        await this.refreshReports(this.getFilterValues());
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error rejecting report:", error);
      this.showMessage("Failed to reject report: " + (error.message || error), "error");
    } finally {
      this.hideLoading();
    }
  }

  async downloadPDF(reportId) {
    await super.downloadPDF(reportId);
  }
}
