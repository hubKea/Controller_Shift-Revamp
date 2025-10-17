import { Blob as NodeBlob } from 'node:buffer';
import { generatePdf } from '../js/pdf-service.js';

if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = NodeBlob;
}

const buildSampleReport = () => ({
  id: 'report-123',
  reportName: 'Night Shift Overview',
  reportDate: '2024-10-15T00:00:00.000Z',
  shiftType: 'Night Shift',
  shiftTime: '22:00 - 06:00',
  siteName: 'Johannesburg Hub',
  siteLocation: 'Johannesburg',
  controller1: 'Thabo M',
  controller2: 'Lerato P',
  metrics: {
    totalTrucks: '5',
    totalLoads: '12',
    loadsDelivered: '10',
    pendingDeliveries: '2'
  },
  activities: [
    { order: 1, description: 'Truck 101 dispatched to Site A' },
    { order: 2, description: 'Truck 102 refuelling at depot' }
  ],
  incidents: [
    {
      truckRegNo: 'TRK-009',
      timeReported: '23:45',
      issue: 'Hydraulic leak detected',
      status: 'Technician dispatched'
    }
  ],
  notifications: [
    {
      driverTruckRegNo: 'TRK-015',
      ruleViolated: 'Speeding',
      timeOfCall: '01:30',
      summary: 'Driver warned and monitored'
    }
  ],
  maintenanceRequired: [
    {
      truckRegNo: 'TRK-021',
      issueIdentified: 'Brake failure alarm',
      timeLocation: '02:10, Gate 4',
      findings: 'Sensor malfunction',
      actionTaken: 'Reset and logged for follow-up'
    }
  ],
  communications: [
    {
      time: '03:15',
      recipient: 'Operations Manager',
      subject: 'Update on inbound convoy ETA'
    }
  ],
  outstandingIssues: 'Awaiting confirmation of spare part delivery.',
  incomingInfo: 'Morning shift to verify inventory at Site B.',
  reportSummary: {
    shiftPerformance: 'Shift ran smoothly with minor delays handled promptly.'
  }
});

describe('pdf-service generatePdf', () => {
  test('returns a blob and descriptive filename with populated tables', async () => {
    const report = buildSampleReport();
    const result = await generatePdf(report, { autoDownload: false });

    expect(result).toBeDefined();
    expect(result.fileName).toMatch(/^ShiftReport_\d{4}-\d{2}-\d{2}_/);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.tables).toEqual(
      expect.arrayContaining([
        'Metadata',
        'Key Metrics',
        'Truck Updates',
        'Breakdowns / Incidents',
        'Phone Calls',
        'Investigations',
        'Communications'
      ])
    );
  });

  test('handles reports without optional sections', async () => {
    const minimalReport = {
      id: 'minimal-1',
      reportDate: '2024-09-01T00:00:00.000Z',
      siteName: 'Minimal Site',
      controller1: 'Solo Controller'
    };

    const result = await generatePdf(minimalReport, { autoDownload: false });
    expect(result.fileName).toContain('minimal_site');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.tables).toContain('Metadata');
  });
});
