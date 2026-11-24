export interface CsvColumn<T> {
  header: string;
  accessor: keyof T | ((row: T, index: number) => string | number | boolean | null | undefined);
}

export interface ExportCsvOptions<T> {
  filename: string;
  columns?: CsvColumn<T>[];
  includeBom?: boolean;
}

function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw);

  // Neutralize Excel/Sheets CSV formula injection on non-numeric strings
  if (/^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Standardized RFC 4180 CSV exporter with UTF-8 BOM support for Nepali/Devanagari
 * & Bikram Sambat text compatibility in Microsoft Excel and LibreOffice Calc.
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  options: ExportCsvOptions<T>
): number {
  if (!data || data.length === 0) return 0;

  const { filename, columns, includeBom = true } = options;

  const resolvedColumns: CsvColumn<T>[] =
    columns && columns.length > 0
      ? columns
      : Object.keys(data[0]).map((key) => ({
          header: key,
          accessor: key as keyof T,
        }));

  const headerLine = resolvedColumns.map((col) => escapeCsvCell(col.header)).join(',');

  const dataLines = data.map((row, rowIndex) =>
    resolvedColumns
      .map((col) => {
        const value =
          typeof col.accessor === 'function'
            ? col.accessor(row, rowIndex)
            : row[col.accessor];
        return escapeCsvCell(value);
      })
      .join(',')
  );

  const csvContent = [headerLine, ...dataLines].join('\r\n');
  const payload = includeBom ? `\uFEFF${csvContent}` : csvContent;
  const normalizedName = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;

  const blob = new Blob([payload], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = normalizedName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return data.length;
}
