import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { PayrollRecord, PayrollRun, Settings } from '../types';

/**
 * Converts a numeric currency amount into formal English words (Rupees and Paisa)
 * using the South Asian numbering system (Crores, Lakhs, Thousands, Hundreds).
 */
export function amountInWordsRupees(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Nepali Rupees Zero Only';

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const rupees = Math.floor(absAmount);
  const paisa = Math.round((absAmount - rupees) * 100);

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 
                 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(num: number): string {
    if (num < 20) return units[num];
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return unit > 0 ? `${tens[ten]} ${units[unit]}` : tens[ten];
  }

  function convertThreeDigits(num: number): string {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    let res = '';
    if (hundred > 0) {
      res += `${units[hundred]} Hundred`;
    }
    if (remainder > 0) {
      res += (res ? ' ' : '') + convertTwoDigits(remainder);
    }
    return res;
  }

  let words = '';
  let n = rupees;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundredAndBelow = n;

  if (crore > 0) {
    words += `${convertThreeDigits(crore)} Crore `;
  }
  if (lakh > 0) {
    words += `${convertTwoDigits(lakh)} Lakh `;
  }
  if (thousand > 0) {
    words += `${convertTwoDigits(thousand)} Thousand `;
  }
  if (hundredAndBelow > 0) {
    words += `${convertThreeDigits(hundredAndBelow)} `;
  }

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `Nepali Rupees ${words}`;
  if (paisa > 0) {
    result += ` and ${convertTwoDigits(paisa)} Paisa`;
  }
  result += ' Only';

  return isNegative ? `Minus ${result}` : result;
}

/**
 * Builds a single payslip page into a jsPDF document instance.
 */
export function buildPayslipPage(
  doc: jsPDF, 
  record: PayrollRecord, 
  run: PayrollRun, 
  settings: Settings,
  pageIndex: number = 1,
  totalPages: number = 1
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  // 1. TOP HEADER BANNER
  // Header background subtle container
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.roundedRect(margin, 10, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.roundedRect(margin, 10, contentWidth, 24, 2, 2, 'S');

  // Company Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // Slate-900
  const companyTitle = (settings.companyName || 'Contractor HRIS').toUpperCase();
  doc.text(companyTitle, margin + 4, 18);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text('OFFICIAL SALARY PAYSLIP & STATUTORY STATEMENT', margin + 4, 23);
  doc.text(`Issued pursuant to Nepal Labor Act 2074 & Social Security Act 2075`, margin + 4, 28);

  // Right-aligned Pay Period Box
  const periodX = pageWidth - margin - 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138); // Indigo-900
  const periodText = run.nepaliMonth 
    ? `${run.monthName} / ${run.nepaliMonth}`
    : run.monthName;
  doc.text(periodText, periodX, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const fyText = run.fiscalYear || 'FY 2083/84';
  doc.text(`Fiscal Year: ${fyText}  |  Status: ${record.disbursementStatus || 'Approved'}`, periodX, 23, { align: 'right' });
  doc.text(`Slip Ref: PS-${run.month.replace('-', '')}-${record.employeeId}  |  Date: ${format(new Date(), 'dd/MM/yyyy')}`, periodX, 28, { align: 'right' });

  let currentY = 37;

  // 2. EMPLOYEE MASTER INFORMATION & ATTENDANCE SUMMARY (2-COLUMN GRID)
  const empDetailsHead = [['EMPLOYEE MASTER PROFILE', 'ATTENDANCE & TIME SUMMARY']];
  const empDetailsBody = [
    [
      `Employee Name:  ${record.employeeName}\n` +
      `Employee ID / Bio ID:  ${record.employeeId}\n` +
      `Department:  ${record.department || 'General'}\n` +
      `Designation:  ${record.designation || 'Staff'}\n` +
      `PAN (Tax ID):  ${record.panNumber || 'N/A'}\n` +
      `Tax Category:  ${record.taxStatus || 'Single'} Assessment`,

      `Total Calendar Days:  ${record.totalDaysInMonth} Days\n` +
      `Present / Worked Days:  ${record.presentDays} Days\n` +
      `Paid Leaves / Holidays:  ${record.paidLeaveDays} Days\n` +
      `Absent Days:  ${record.absentDays} Days\n` +
      `Payable Days:  ${record.payableDays} / ${record.totalDaysInMonth} Days\n` +
      `Overtime Hours Logged:  ${record.overtimeHours || 0} Hours`
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: empDetailsHead,
    body: empDetailsBody,
    theme: 'plain',
    headStyles: {
      fillColor: [30, 41, 59], // Slate-800
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 2
    },
    bodyStyles: {
      fillColor: [248, 250, 252],
      textColor: [30, 41, 59],
      fontSize: 8,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: contentWidth / 2 },
      1: { cellWidth: contentWidth / 2 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // 3. ITEMIZED SALARY TABLE: EARNINGS VS DEDUCTIONS
  const earnings: [string, string][] = [
    ['Basic Salary (Earned)', `Rs. ${record.earnedBasicSalary.toLocaleString()}`],
    ['Dearness & Other Allowances', `Rs. ${record.earnedAllowances.toLocaleString()}`],
    [`Overtime Pay (${record.overtimeHours || 0} hrs)`, `Rs. ${(record.overtimePay || 0).toLocaleString()}`],
  ];
  if (record.bonus && record.bonus > 0) {
    earnings.push(['Incentives / Festive Dashain Bonus', `Rs. ${record.bonus.toLocaleString()}`]);
  }

  const deductions: [string, string][] = [
    ['Income Tax (Nepal IRD TDS)', `Rs. ${record.incomeTaxTDS.toLocaleString()}`],
    ['Social Security Fund (Employee 11%)', `Rs. ${record.socialSecurity.toLocaleString()}`],
  ];
  if (record.otherDeductions && record.otherDeductions > 0) {
    deductions.push(['Other Deductions / Advances', `Rs. ${record.otherDeductions.toLocaleString()}`]);
  }

  const maxRows = Math.max(earnings.length, deductions.length);
  const salaryTableBody: any[][] = [];

  for (let i = 0; i < maxRows; i++) {
    const earn = earnings[i] || ['', ''];
    const ded = deductions[i] || ['', ''];
    salaryTableBody.push([earn[0], earn[1], ded[0], ded[1]]);
  }

  // Total Gross & Total Deductions Row
  salaryTableBody.push([
    'TOTAL GROSS SALARY (A)',
    `Rs. ${record.grossSalary.toLocaleString()}`,
    'TOTAL DEDUCTIONS (B)',
    `Rs. ${(record.incomeTaxTDS + record.socialSecurity + (record.otherDeductions || 0)).toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['EARNINGS & ALLOWANCES', 'AMOUNT (NPR)', 'STATUTORY DEDUCTIONS', 'AMOUNT (NPR)']],
    body: salaryTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 58, 138], // Dark Blue / Indigo
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 1.8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 1.8
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.32 },
      1: { cellWidth: contentWidth * 0.18, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: contentWidth * 0.32 },
      3: { cellWidth: contentWidth * 0.18, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] }
    },
    didParseCell: function(data) {
      // Highlight the totals row
      if (data.row.index === maxRows) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
        if (data.column.index === 1) {
          data.cell.styles.textColor = [15, 23, 42];
        }
      }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // 4. NET PAYABLE HIGHLIGHT BOX (PROMINENT BANNER)
  const employerSsfAmount = record.employerSSF ?? (record.ssfEnrolled !== false ? Math.round(record.earnedBasicSalary * 0.20) : 0);
  const monthlyCtcAmount = record.monthlyCTC ?? (record.grossSalary + employerSsfAmount);
  const netInWords = amountInWordsRupees(record.netSalary);

  doc.setFillColor(16, 185, 129); // Emerald-500
  doc.roundedRect(margin, currentY, contentWidth, 20, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NET SALARY PAYABLE (A - B)', margin + 4, currentY + 6);

  doc.setFontSize(14);
  doc.text(`NPR Rs. ${record.netSalary.toLocaleString()}`, margin + 4, currentY + 14);

  // Bank Info on the right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const bankDetails = [
    `Bank: ${record.bankName || 'Bank Transfer'}`,
    `A/C No: ${record.accountNumber || 'On File'}`,
    record.transactionRef ? `Ref: ${record.transactionRef}` : `Disbursement: ${record.disbursementStatus}`
  ];
  doc.text(bankDetails[0], pageWidth - margin - 4, currentY + 6, { align: 'right' });
  doc.text(bankDetails[1], pageWidth - margin - 4, currentY + 11, { align: 'right' });
  doc.text(bankDetails[2], pageWidth - margin - 4, currentY + 16, { align: 'right' });

  currentY += 23;

  // Words Box
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, currentY, contentWidth, 7, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, currentY, contentWidth, 7, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Amount in Words:', margin + 3, currentY + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(netInWords, margin + 28, currentY + 4.8);

  currentY += 10;

  // 5. STATUTORY SSF 31% & EMPLOYER CONTRIBUTION SUMMARY TABLE
  const totalSsfContribution = record.socialSecurity + employerSsfAmount;
  const ssfTableBody = [
    [
      `Employee SSF (11%):\nRs. ${record.socialSecurity.toLocaleString()}`,
      `Employer SSF (20%):\nRs. ${employerSsfAmount.toLocaleString()}`,
      `Total SSF Deposited (31%):\nRs. ${totalSsfContribution.toLocaleString()}`,
      `Total Monthly CTC:\nRs. ${monthlyCtcAmount.toLocaleString()}`
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['NEPAL SOCIAL SECURITY FUND (SSF 31% STATUTORY SCHEME) & TOTAL CTC BREAKDOWN']],
    body: ssfTableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 58, 138],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 1.5,
      halign: 'center'
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [30, 41, 59],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 2,
      halign: 'center',
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 3;

  // 6. NEPAL IRD TAX SLABS DIAGNOSTIC SUMMARY (COMPACT)
  if (record.taxSlabBreakdown && record.taxSlabBreakdown.length > 0) {
    const taxRows = record.taxSlabBreakdown.map(s => [
      s.slabName,
      `Rs. ${(s.minAmount || 0).toLocaleString()} - ${!s.maxAmount || s.maxAmount === Infinity ? 'Above' : `Rs. ${s.maxAmount.toLocaleString()}`}`,
      `Rs. ${s.taxableAmount.toLocaleString()}`,
      `${(s.rate * 100)}%`,
      `Rs. ${s.taxAmount.toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Tax Slab (FY 2083/84)', 'Bracket Range', 'Taxable Amount', 'Rate', 'Annual Tax (NPR)']],
      body: taxRows,
      theme: 'grid',
      headStyles: {
        fillColor: [71, 85, 105], // Slate-600
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 1.5
      },
      bodyStyles: {
        fontSize: 6.5,
        textColor: [51, 65, 85],
        cellPadding: 1.2
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.28 },
        1: { cellWidth: contentWidth * 0.28, halign: 'right' },
        2: { cellWidth: contentWidth * 0.18, halign: 'right' },
        3: { cellWidth: contentWidth * 0.10, halign: 'center' },
        4: { cellWidth: contentWidth * 0.16, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 3;
  }

  // 7. SIGNATURE AUTHORIZATION BLOCKS (BOTTOM OF PAGE)
  const sigY = Math.min(Math.max(currentY + 2, pageHeight - 30), pageHeight - 26);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);

  const sigColWidth = contentWidth / 3;

  // Sig 1: Prepared By
  const sig1X = margin + 4;
  doc.line(sig1X, sigY + 12, sig1X + sigColWidth - 10, sigY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Prepared By', sig1X + (sigColWidth - 10) / 2, sigY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('HR & Payroll Officer', sig1X + (sigColWidth - 10) / 2, sigY + 20, { align: 'center' });

  // Sig 2: Approved By
  const sig2X = margin + sigColWidth + 5;
  doc.line(sig2X, sigY + 12, sig2X + sigColWidth - 10, sigY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Verified & Approved By', sig2X + (sigColWidth - 10) / 2, sigY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Finance / Managing Director', sig2X + (sigColWidth - 10) / 2, sigY + 20, { align: 'center' });

  // Sig 3: Employee Signature
  const sig3X = margin + (sigColWidth * 2) + 6;
  doc.line(sig3X, sigY + 12, sig3X + sigColWidth - 10, sigY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Employee Signature', sig3X + (sigColWidth - 10) / 2, sigY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Receiver Acknowledgement', sig3X + (sigColWidth - 10) / 2, sigY + 20, { align: 'center' });

  // Footer Disclaimer
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Confidential Document • Generated automatically by ${settings.companyName || 'Contractor HRIS'} on ${format(new Date(), 'dd/MM/yyyy HH:mm')} • Page ${pageIndex} of ${totalPages}`,
    pageWidth / 2,
    pageHeight - 4,
    { align: 'center' }
  );
}

/**
 * Generates a single Payslip PDF document and returns the jsPDF instance.
 */
export function generatePayslipPdf(
  record: PayrollRecord, 
  run: PayrollRun, 
  settings: Settings
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  buildPayslipPage(doc, record, run, settings, 1, 1);
  return doc;
}

/**
 * Downloads a single Payslip as a PDF file directly.
 */
export function downloadPayslipPdf(
  record: PayrollRecord, 
  run: PayrollRun, 
  settings: Settings
): void {
  const doc = generatePayslipPdf(record, run, settings);
  const safeName = record.employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${record.employeeId}_${safeName}_Payslip_${run.month}.pdf`;
  doc.save(fileName);
}

/**
 * Prints the Payslip PDF by generating a Blob URL and triggering window/iframe print.
 */
export function printPayslipPdf(
  record: PayrollRecord, 
  run: PayrollRun, 
  settings: Settings
): void {
  const doc = generatePayslipPdf(record, run, settings);
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  // Try creating an iframe for direct seamless print
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = blobUrl;

  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      // Fallback: open in new tab
      window.open(blobUrl, '_blank');
    }
  };
}

/**
 * Generates a compiled multi-page PDF of all employee payslips in a PayrollRun.
 */
export function downloadAllPayslipsPdf(
  records: PayrollRecord[], 
  run: PayrollRun, 
  settings: Settings
): void {
  if (!records || records.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const totalPages = records.length;

  records.forEach((rec, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'portrait');
    }
    buildPayslipPage(doc, rec, run, settings, idx + 1, totalPages);
  });

  const companySafe = (settings.companyName || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${companySafe}_All_Payslips_${run.month}.pdf`;
  doc.save(fileName);
}
