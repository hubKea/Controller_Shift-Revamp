const DEFAULT_OPTIONS = {
  autoDownload: typeof window !== 'undefined',
  returnBlob: true,
  includeDoc: false,
};

const MARGINS = {
  left: 40,
  top: 50,
};

const FONT_SIZES = {
  title: 18,
  section: 14,
  body: 10,
};

let cachedJsPdfModule = null;
let cachedAutoTable = null;

const ensureJsPdf = async () => {
  if (cachedJsPdfModule) {
    return cachedJsPdfModule;
  }

  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) {
    cachedJsPdfModule = { jsPDF: window.jspdf.jsPDF };
    return cachedJsPdfModule;
  }

  const module = await import('jspdf');
  cachedJsPdfModule = module?.jsPDF ? module : { jsPDF: module.default };
  return cachedJsPdfModule;
};

const ensureAutoTable = async () => {
  if (cachedAutoTable) {
    return cachedAutoTable;
  }

  if (typeof window !== 'undefined') {
    if (window.jspdfAutotable) {
      cachedAutoTable = window.jspdfAutotable;
      return cachedAutoTable;
    }
    if (window.jspdfAutoTable) {
      cachedAutoTable = window.jspdfAutoTable;
      return cachedAutoTable;
    }

    if (window.jspdf?.jsPDF?.API?.autoTable) {
      cachedAutoTable = (docInstance, config) => docInstance.autoTable(config);
      return cachedAutoTable;
    }
  }

  const module = await import('jspdf-autotable');
  cachedAutoTable = module.default ?? module.autoTable ?? module;
  return cachedAutoTable;
};

const slugify = (value) => {
  if (!value) return 'site';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const formatIsoDate = (value) => {
  if (!value) return 'unknown-date';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'unknown-date';
    }
    return date.toISOString().slice(0, 10);
  } catch (_error) {
    return 'unknown-date';
  }
};

const formatDisplayDate = (value) => {
  if (!value) return 'N/A';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }
    return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_error) {
    return 'N/A';
  }
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const normalize = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value);
};

const addSectionTitle = (doc, title, state) => {
  doc.setFontSize(FONT_SIZES.section);
  doc.text(title, MARGINS.left, state.currentY);
  state.currentY += 12;
};

const addParagraph = (doc, text, state, offset = 12) => {
  doc.setFontSize(FONT_SIZES.body);
  doc.text(text, MARGINS.left, state.currentY);
  state.currentY += offset;
};

const addTable = (doc, autoTable, state, title, head, body) => {
  const rows = body.filter((row) => row.some((cell) => normalize(cell)));
  addSectionTitle(doc, title, state);

  if (!rows.length) {
    addParagraph(doc, 'No records available.', state);
    return false;
  }

  autoTable(doc, {
    startY: state.currentY,
    head: [head],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: FONT_SIZES.body,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [19, 127, 236],
      textColor: 255,
      fontStyle: 'bold',
    },
    margin: { left: MARGINS.left, right: MARGINS.left },
  });

  state.currentY = (doc.lastAutoTable?.finalY || state.currentY) + 18;
  return true;
};

export const generatePdf = async (report, options = {}) => {
  if (!report || typeof report !== 'object') {
    throw new Error('Report data is required to generate PDF.');
  }

  const { autoDownload, returnBlob, includeDoc } = { ...DEFAULT_OPTIONS, ...options };
  const [{ jsPDF }, autoTable] = await Promise.all([ensureJsPdf(), ensureAutoTable()]);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

  const state = { currentY: MARGINS.top, tables: [] };

  // Title
  doc.setFontSize(FONT_SIZES.title);
  const title = report.reportName
    ? `Shift Report • ${normalize(report.reportName)}`
    : 'Shift Report';
  doc.text(title, MARGINS.left, state.currentY);
  state.currentY += 24;

  // Metadata table
  const metadataRows = [
    ['Report Date', formatDisplayDate(report.reportDate || report.shiftDate)],
    ['Site', normalize(report.siteName || report.siteLocation)],
    ['Shift', normalize(report.shiftType || report.shiftTime)],
    ['Controllers', [report.controller1, report.controller2].filter(Boolean).join(' & ') || 'N/A'],
  ];

  autoTable(doc, {
    startY: state.currentY,
    head: [['Field', 'Value']],
    body: metadataRows,
    theme: 'plain',
    styles: {
      fontSize: FONT_SIZES.body,
      cellPadding: 4,
    },
    margin: { left: MARGINS.left, right: MARGINS.left },
  });

  state.currentY = (doc.lastAutoTable?.finalY || state.currentY) + 20;
  state.tables.push('Metadata');

  // Key metrics
  const metrics = report.metrics || {};
  const metricsRows = [
    ['Total Trucks', normalize(metrics.totalTrucks)],
    ['Total Loads', normalize(metrics.totalLoads)],
    ['Loads Delivered', normalize(metrics.loadsDelivered)],
    ['Pending Deliveries', normalize(metrics.pendingDeliveries)],
  ];

  if (metricsRows.some((row) => row[1])) {
    addSectionTitle(doc, 'Key Metrics', state);
    autoTable(doc, {
      startY: state.currentY,
      head: [['Metric', 'Value']],
      body: metricsRows,
      theme: 'grid',
      styles: { fontSize: FONT_SIZES.body, cellPadding: 4 },
      margin: { left: MARGINS.left, right: MARGINS.left },
    });
    state.currentY = (doc.lastAutoTable?.finalY || state.currentY) + 20;
    state.tables.push('Key Metrics');
  }

  const sections = [
    {
      title: 'Truck Updates',
      head: ['#', 'Description'],
      body: ensureArray(report.activities).map((item, index) => [
        normalize(item?.order ?? index + 1),
        normalize(item?.description),
      ]),
    },
    {
      title: 'Breakdowns / Incidents',
      head: ['Truck', 'Time Reported', 'Issue', 'Status'],
      body: ensureArray(report.incidents).map((item) => [
        normalize(item?.truckRegNo),
        normalize(item?.timeReported),
        normalize(item?.issue),
        normalize(item?.status),
      ]),
    },
    {
      title: 'Phone Calls',
      head: ['Truck', 'Rule Violated', 'Time of Call', 'Summary'],
      body: ensureArray(report.notifications).map((item) => [
        normalize(item?.driverTruckRegNo),
        normalize(item?.ruleViolated),
        normalize(item?.timeOfCall),
        normalize(item?.summary),
      ]),
    },
    {
      title: 'Investigations',
      head: ['Truck', 'Issue Identified', 'Time / Location', 'Findings', 'Action Taken'],
      body: ensureArray(report.maintenanceRequired).map((item) => [
        normalize(item?.truckRegNo),
        normalize(item?.issueIdentified),
        normalize(item?.timeLocation),
        normalize(item?.findings),
        normalize(item?.actionTaken),
      ]),
    },
    {
      title: 'Communications',
      head: ['Time', 'Recipient', 'Subject'],
      body: ensureArray(report.communications).map((item) => [
        normalize(item?.time),
        normalize(item?.recipient),
        normalize(item?.subject),
      ]),
    },
  ];

  sections.forEach((section) => {
    const rendered = addTable(doc, autoTable, state, section.title, section.head, section.body);
    if (rendered) {
      state.tables.push(section.title);
    }
  });

  if (report.outstandingIssues || report.incomingInfo || report.reportSummary?.shiftPerformance) {
    addSectionTitle(doc, 'Summary Notes', state);
    if (report.outstandingIssues) {
      addParagraph(doc, `Outstanding Issues: ${normalize(report.outstandingIssues)}`, state);
    }
    if (report.incomingInfo) {
      addParagraph(doc, `Incoming Info: ${normalize(report.incomingInfo)}`, state);
    }
    if (report.reportSummary?.shiftPerformance) {
      addParagraph(
        doc,
        `Shift Performance: ${normalize(report.reportSummary.shiftPerformance)}`,
        state,
        16
      );
    }
  }

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    const footerText = `Page ${pageNumber} of ${totalPages}`;
    doc.setFontSize(FONT_SIZES.body - 2);
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text(footerText, pageWidth - MARGINS.left, doc.internal.pageSize.getHeight() - 30, {
      align: 'right',
    });
  }

  const dateSlug = formatIsoDate(report.reportDate || report.shiftDate);
  const siteSlug = slugify(report.siteName || report.siteLocation);
  const fileName = `ShiftReport_${dateSlug}_${siteSlug}.pdf`;

  let blob = null;
  if (returnBlob) {
    blob = doc.output('blob');
  }

  if (autoDownload) {
    doc.save(fileName);
  }

  const output = {
    fileName,
    tables: state.tables,
    blob,
  };

  if (includeDoc) {
    output.doc = doc;
  }

  return output;
};

export default generatePdf;
