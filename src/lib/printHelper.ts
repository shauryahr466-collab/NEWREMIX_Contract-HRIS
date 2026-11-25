import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { getNepaliDate } from '../utils/dateHelper';

export interface PrintableTable {
  title?: string;
  headers: string[];
  rows: string[][];
  footer?: string[];
}

export interface PrintableSnapshot {
  title: string;
  subtitle?: string;
  generatedAt: string;
  bsDate: string;
  metrics: Array<{ label: string; value: string }>;
  tables: PrintableTable[];
}

function cleanCellText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findTableTitle(table: HTMLTableElement): string | undefined {
  let node: Element | null = table;
  for (let depth = 0; depth < 5 && node; depth++) {
    let prev = node.previousElementSibling;
    while (prev) {
      if (/^H[1-4]$/.test(prev.tagName)) {
        const text = cleanCellText(prev);
        if (text) return text;
      }
      const nestedHeading = prev.querySelector('h2, h3, h4');
      if (nestedHeading) {
        const text = cleanCellText(nestedHeading);
        if (text) return text;
      }
      prev = prev.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}

export function captureModulePrintSnapshot(title: string, subtitle?: string): PrintableSnapshot {
  const now = new Date();
  const bs = getNepaliDate(now);
  const generatedAt = format(now, 'yyyy-MM-dd HH:mm');
  const bsDate = bs !== '0000-00-00' ? `BS ${bs}` : '';

  const root =
    document.querySelector('.print-scroll-container .max-w-7xl') ||
    document.querySelector('main') ||
    document.body;

  const tables: PrintableTable[] = [];
  const tableEls = Array.from(root.querySelectorAll('table'));

  for (const tbl of tableEls) {
    if (tbl.closest('.print\\:hidden')) continue;
    const style = window.getComputedStyle(tbl);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    let headers: string[] = [];
    const headerRow = tbl.querySelector('thead tr:last-child') || tbl.querySelector('thead tr');
    if (headerRow) {
      headers = Array.from(headerRow.children)
        .filter((cell) => !cell.classList.contains('print:hidden'))
        .map((cell) => cleanCellText(cell));
    }

    const bodyRows = Array.from(tbl.querySelectorAll('tbody tr')).filter((tr) => {
      if (tr.classList.contains('print:hidden')) return false;
      const trStyle = window.getComputedStyle(tr);
      return trStyle.display !== 'none';
    });

    const rows: string[][] = [];
    for (const tr of bodyRows) {
      const rowCells = Array.from(tr.children)
        .filter((cell) => !cell.classList.contains('print:hidden'))
        .map((cell) => cleanCellText(cell));
      if (rowCells.some((c) => c.length > 0)) {
        rows.push(rowCells);
      }
    }

    if (headers.length === 0 && rows.length > 0) {
      headers = rows.shift() || [];
    }

    let footer: string[] | undefined;
    const footerRow = tbl.querySelector('tfoot tr');
    if (footerRow && !footerRow.classList.contains('print:hidden')) {
      const fCells = Array.from(footerRow.children)
        .filter((cell) => !cell.classList.contains('print:hidden'))
        .map((cell) => cleanCellText(cell));
      if (fCells.some((c) => c.length > 0)) {
        footer = fCells;
      }
    }

    if (headers.length > 0 || rows.length > 0) {
      tables.push({
        title: findTableTitle(tbl),
        headers,
        rows,
        footer,
      });
    }
  }

  // Extract KPI / summary key-value cards if visible
  const metrics: Array<{ label: string; value: string }> = [];
  const metricCards = Array.from(
    root.querySelectorAll('.rounded-xl, .rounded-lg')
  ).filter((card) => {
    if (card.closest('table') || card.closest('.print\\:hidden')) return false;
    return card.querySelector('h3, .text-2xl, .text-3xl') && card.querySelector('p');
  });

  const seenMetricLabels = new Set<string>();
  for (const card of metricCards) {
    if (card.querySelectorAll('h3, .text-2xl, .text-3xl').length !== 1) continue;
    const labelEl = card.querySelector('p');
    const valEl = card.querySelector('h3, .text-2xl, .text-3xl');
    const label = labelEl ? cleanCellText(labelEl) : '';
    const value = valEl ? cleanCellText(valEl) : '';
    if (label && value && !seenMetricLabels.has(label) && label.length < 60 && value.length < 40) {
      seenMetricLabels.add(label);
      metrics.push({ label, value });
    }
    if (metrics.length >= 12) break;
  }

  return {
    title: title || 'HRIS Module Report',
    subtitle,
    generatedAt,
    bsDate,
    metrics,
    tables,
  };
}

export function tryNativePrint(): boolean {
  let triggered = false;
  const onBeforePrint = () => {
    triggered = true;
  };
  window.addEventListener('beforeprint', onBeforePrint, { once: true });
  try {
    window.print();
  } catch {
    triggered = false;
  } finally {
    window.removeEventListener('beforeprint', onBeforePrint);
  }
  return triggered;
}

export function exportPrintablePdf(snapshot: PrintableSnapshot): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(snapshot.title, 32, cursorY);
  cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const metaLine = [
    snapshot.subtitle,
    `Printed: ${snapshot.generatedAt}`,
    snapshot.bsDate || undefined,
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(metaLine, 32, cursorY, { maxWidth: pageWidth - 64 });
  cursorY += 18;

  if (snapshot.metrics.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 32, right: 32 },
      head: [['Summary Metric', 'Value']],
      body: snapshot.metrics.map((m) => [m.label, m.value]),
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      theme: 'grid',
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 14;
  }

  if (snapshot.tables.length > 0) {
    snapshot.tables.forEach((tbl, index) => {
      if (index > 0 && cursorY > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage();
        cursorY = 36;
      }
      if (tbl.title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(tbl.title, 32, cursorY);
        cursorY += 8;
      }

      const colCount = Math.max(
        tbl.headers.length,
        tbl.rows[0]?.length || 0,
        tbl.footer?.length || 0
      );
      const compact = colCount > 10;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: 32, right: 32 },
        head: tbl.headers.length > 0 ? [tbl.headers] : undefined,
        body: tbl.rows.length > 0 ? tbl.rows : [['No visible rows to display']],
        foot: tbl.footer && tbl.footer.length > 0 ? [tbl.footer] : undefined,
        styles: {
          fontSize: compact ? 7 : 8.5,
          cellPadding: compact ? 3 : 4,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
        },
        footStyles: {
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
        },
        theme: 'grid',
      });

      cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 16;
    });
  } else if (snapshot.metrics.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      'No tabular data was visible on this view at the time of printing.',
      32,
      cursorY
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 32,
      doc.internal.pageSize.getHeight() - 18,
      { align: 'right' }
    );
  }

  const safeName = snapshot.title
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  doc.save(`${safeName || 'HRIS_Print'}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}

export function downloadPrintableHtmlSheet(snapshot: PrintableSnapshot): void {
  const metricsHtml =
    snapshot.metrics.length > 0
      ? `<div class="metrics">${snapshot.metrics
          .map(
            (m) =>
              `<div class="metric-card"><div class="metric-label">${escapeHtml(m.label)}</div><div class="metric-val">${escapeHtml(m.value)}</div></div>`
          )
          .join('')}</div>`
      : '';

  const tablesHtml =
    snapshot.tables.length > 0
      ? snapshot.tables
          .map((tbl) => {
            const thead =
              tbl.headers.length > 0
                ? `<thead><tr>${tbl.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
                : '';
            const tbody = `<tbody>${
              tbl.rows.length > 0
                ? tbl.rows
                    .map(
                      (r) =>
                        `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
                    )
                    .join('')
                : '<tr><td colspan="99">No visible rows</td></tr>'
            }</tbody>`;
            const tfoot =
              tbl.footer && tbl.footer.length > 0
                ? `<tfoot><tr>${tbl.footer.map((f) => `<td>${escapeHtml(f)}</td>`).join('')}</tr></tfoot>`
                : '';
            return `${tbl.title ? `<h2>${escapeHtml(tbl.title)}</h2>` : ''}<table>${thead}${tbody}${tfoot}</table>`;
          })
          .join('')
      : '<p class="empty">No visible tables in this view.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.title)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Cambria", Georgia, serif; color: #0f172a; background: #fff; margin: 0; padding: 18px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .toolbar button { background: #e54f38; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
    header { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { margin: 0; font-size: 20px; }
    .meta { margin-top: 4px; font-size: 12px; color: #475569; }
    h2 { font-size: 13px; margin: 16px 0 6px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }
    .metric-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
    .metric-label { font-size: 11px; color: #475569; }
    .metric-val { font-size: 16px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    tfoot td { background: #f8fafc; font-weight: 700; }
    .empty { color: #64748b; font-size: 13px; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print Document</button></div>
  <header>
    <h1>${escapeHtml(snapshot.title)}</h1>
    <div class="meta">${escapeHtml(
      [snapshot.subtitle, `Printed: ${snapshot.generatedAt}`, snapshot.bsDate]
        .filter(Boolean)
        .join(' | ')
    )}</div>
  </header>
  ${metricsHtml}
  ${tablesHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = snapshot.title
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  a.href = url;
  a.download = `${safeName || 'HRIS_Print'}_${format(new Date(), 'yyyyMMdd_HHmm')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
