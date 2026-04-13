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
  doc.setFontSize(20);
  doc.setTextColor(28, 25, 23); // stone-900
  doc.text('Hospital Compliance & Retention Report', 14, 22);

  // Subtitle
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108); // stone-500
  doc.text(`Generated on: ${now}`, 14, 30);
  doc.text(`Period: ${dateRange.start || 'All Time'} to ${dateRange.end || 'All Time'}`, 14, 35);

  // Summary Stats
  const total = hospitals.length;
  const renewed = hospitals.filter(h => h.reapplied).length;
  const expired = hospitals.filter(h => {
    const expiry = new Date(h.expiryDate);
    return expiry < new Date();
  }).length;

  doc.setFontSize(12);
  doc.setTextColor(28, 25, 23);
  doc.text('Summary Metrics', 14, 50);
  
  const statsData = [
    ['Total Hospitals', total.toString()],
    ['Renewed', renewed.toString()],
    ['Expired', expired.toString()],
    ['Retention Rate', expired > 0 ? `${Math.round((renewed / expired) * 100)}%` : '100%']
  ];

  autoTable(doc, {
    startY: 55,
    head: [['Metric', 'Value']],
    body: statsData,
    theme: 'striped',
    headStyles: { fillColor: [28, 25, 23] }
  });

  // Detailed Hospital Table
  const finalY1 = (doc as any).lastAutoTable.finalY;
  doc.text('Detailed Hospital Status', 14, finalY1 + 15);

  const tableData = hospitals.map(h => [
    h.name,
    h.state,
    format(new Date(h.expiryDate), 'dd-MM-yyyy'),
    h.reapplied ? 'Yes' : 'No',
    h.status
  ]);

  autoTable(doc, {
    startY: finalY1 + 20,
    head: [['Hospital Name', 'State', 'Expiry Date', 'Renewed', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [28, 25, 23] }
  });

  // Interaction Summary
  if (interactions.length > 0) {
    const finalY2 = (doc as any).lastAutoTable.finalY;
    doc.addPage();
    doc.text('Recent Interaction Logs', 14, 22);
    
    const interactionData = interactions.slice(0, 50).map(i => {
      const h = hospitals.find(hos => hos.id === i.hospitalId);
      return [
        format(new Date(i.timestamp), 'dd-MM-yyyy HH:mm'),
        h?.name || 'Unknown',
        i.result,
        i.reason || '-',
        i.remarks || '-'
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Hospital', 'Result', 'Reason', 'Remarks']],
      body: interactionData,
      theme: 'striped',
      headStyles: { fillColor: [28, 25, 23] }
    });
  }

  return doc;
};
