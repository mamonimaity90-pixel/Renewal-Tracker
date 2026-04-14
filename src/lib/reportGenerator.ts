import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Hospital, Interaction } from '../types';

export const generateHospitalReport = (
  hospitals: Hospital[],
  interactions: Interaction[],
  dateRange: { start: string; end: string }
) => {
  const doc = new jsPDF();
  const now = format(new Date(), 'PPP p');

  // Title
  doc.setFontSize(22);
  doc.setTextColor(28, 25, 23); // stone-900
  doc.text('Executive Dashboard Summary', 14, 22);

  // Subtitle
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108); // stone-500
  doc.text(`Generated on: ${now}`, 14, 30);
  doc.text(`Period: ${dateRange.start || 'All Time'} to ${dateRange.end || 'All Time'}`, 14, 35);

  // 1. Key Performance Indicators
  const total = hospitals.length;
  const renewed = hospitals.filter(h => h.reapplied).length;
  const pending = hospitals.filter(h => !h.reapplied).length;
  const expiredHospitals = hospitals.filter(h => {
    const expiry = new Date(h.expiryDate);
    return expiry < new Date();
  });
  const expiredCount = expiredHospitals.length;
  const expiredRenewedCount = expiredHospitals.filter(h => h.reapplied).length;

  doc.setFontSize(14);
  doc.setTextColor(28, 25, 23);
  doc.text('Key Performance Indicators (KPIs)', 14, 50);
  
  const statsData = [
    ['Total Hospitals Under Management', total.toString()],
    ['Successfully Renewed', renewed.toString()],
    ['Currently Expired', expiredCount.toString()],
    ['Pending Renewals', pending.toString()],
    ['Overall Retention Rate', expiredCount > 0 ? `${Math.round((expiredRenewedCount / expiredCount) * 100)}%` : '100%']
  ];

  autoTable(doc, {
    startY: 55,
    head: [['Metric', 'Value']],
    body: statsData,
    theme: 'grid',
    headStyles: { fillColor: [28, 25, 23], textColor: [255, 255, 255] },
    styles: { fontSize: 10, cellPadding: 5 }
  });

  // 2. Program Migration Summary
  const finalY1 = (doc as any).lastAutoTable.finalY;
  doc.text('Program Migration Analysis', 14, finalY1 + 15);

  const programs: Record<string, number> = { 'HCO': 0, 'SHCO': 0, 'ECO': 0, 'ELCP': 0 };
  hospitals.forEach(h => {
    if (h.reapplied && h.reappliedProgram) {
      programs[h.reappliedProgram] = (programs[h.reappliedProgram] || 0) + 1;
    }
  });

  const migrationData = Object.entries(programs).map(([prog, count]) => [
    prog, 
    count.toString(), 
    renewed > 0 ? `${Math.round((count / renewed) * 100)}%` : '0%'
  ]);

  autoTable(doc, {
    startY: finalY1 + 20,
    head: [['Target Program', 'Count', 'Share of Renewals']],
    body: migrationData,
    theme: 'striped',
    headStyles: { fillColor: [68, 64, 60] }, // stone-700
    styles: { fontSize: 10 }
  });

  // 3. Geographic Performance (Top 5 States)
  const finalY2 = (doc as any).lastAutoTable.finalY;
  doc.text('Geographic Performance (Top 5 States)', 14, finalY2 + 15);

  const stateData: Record<string, { total: number, renewed: number }> = {};
  hospitals.forEach(h => {
    if (!stateData[h.state]) stateData[h.state] = { total: 0, renewed: 0 };
    stateData[h.state].total++;
    if (h.reapplied) stateData[h.state].renewed++;
  });

  const topStates = Object.entries(stateData)
    .map(([name, data]) => ({
      name,
      total: data.total,
      rate: Math.round((data.renewed / data.total) * 100)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(s => [s.name, s.total.toString(), `${s.rate}%`]);

  autoTable(doc, {
    startY: finalY2 + 20,
    head: [['State', 'Total Hospitals', 'Renewal Rate']],
    body: topStates,
    theme: 'grid',
    headStyles: { fillColor: [120, 113, 108] }, // stone-500
    styles: { fontSize: 10 }
  });

  // 4. Retention by Hospital Size (Beds)
  const finalYBed = (doc as any).lastAutoTable.finalY;
  doc.text('Retention by Hospital Size (Beds)', 14, finalYBed + 15);

  const bedCategories = [
    { label: 'Upto 50 Beds', min: 0, max: 50 },
    { label: '51-100 Beds', min: 51, max: 100 },
    { label: '101-300 Beds', min: 101, max: 300 },
    { label: '301 and Above', min: 301, max: 99999 },
  ];

  const bedRows = bedCategories.map(cat => {
    const cohort = hospitals.filter(h => h.beds >= cat.min && h.beds <= cat.max);
    const total = cohort.length;
    const renewed = cohort.filter(h => h.reapplied).length;
    const rate = total > 0 ? Math.round((renewed / total) * 100) : 0;
    return [cat.label, total.toString(), renewed.toString(), `${rate}%`];
  });

  autoTable(doc, {
    startY: finalYBed + 20,
    head: [['Bed Category', 'Total Hospitals', 'Renewed', 'Retention Rate']],
    body: bedRows,
    theme: 'grid',
    headStyles: { fillColor: [28, 25, 23] },
    styles: { fontSize: 10 }
  });

  // 5. Managerial Placeholders
  doc.addPage();
  doc.setFontSize(16);
  doc.text('Managerial Insights & Team Performance', 14, 22);

  doc.setFontSize(11);
  doc.setTextColor(120, 113, 108);
  doc.text('The following sections are placeholders for future automated team performance metrics.', 14, 32);

  // Team Performance Placeholder
  doc.setFontSize(13);
  doc.setTextColor(28, 25, 23);
  doc.text('Team Performance Overview', 14, 50);
  
  autoTable(doc, {
    startY: 55,
    head: [['Team Member', 'Calls Made', 'Conversion Rate', 'Avg. Handling Time', 'Status']],
    body: [
      ['Placeholder Member A', '-', '-', '-', 'Active'],
      ['Placeholder Member B', '-', '-', '-', 'Active'],
      ['Placeholder Member C', '-', '-', '-', 'On Leave'],
    ],
    theme: 'striped',
    headStyles: { fillColor: [28, 25, 23] },
    styles: { fontSize: 10, fontStyle: 'italic' }
  });

  // Strategic Recommendations Placeholder
  const finalY3 = (doc as any).lastAutoTable.finalY;
  doc.setFontSize(13);
  doc.text('Strategic Recommendations', 14, finalY3 + 20);
  
  doc.setFontSize(10);
  doc.setTextColor(68, 64, 60);
  const recommendations = [
    '• Focus on states with renewal rates below 60% (See Geographic Performance).',
    '• Investigate high "Not Connected" rates in recent interaction logs.',
    '• Monitor the shift towards ELCP program to ensure resource availability.',
    '• Review follow-up schedules for hospitals expiring in the next 30 days.'
  ];
  
  recommendations.forEach((rec, index) => {
    doc.text(rec, 14, finalY3 + 30 + (index * 7));
  });

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(168, 162, 158);
    doc.text(`Confidential - Internal Use Only | Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
  }

  return doc;
};
