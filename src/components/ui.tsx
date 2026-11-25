import React, { useState } from 'react';
import { X, Printer, FileDown, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  PrintableSnapshot,
  captureModulePrintSnapshot,
  downloadPrintableHtmlSheet,
  exportPrintablePdf,
  tryNativePrint,
} from '../lib/printHelper';

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className, title, subtitle, actions, icon: Icon }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, actions?: React.ReactNode, icon?: any }) {
  return (
    <div className={cn("bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-colors duration-200", className)}>
      {(title || actions) && (
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon size={15} />
              </div>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">{title}</h3>}
              {subtitle && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ children, className, variant = 'primary', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success', size?: 'sm' | 'md' | 'lg' }) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark shadow-xs',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    outline: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800',
    danger: 'bg-danger text-white hover:bg-red-700 shadow-xs',
    success: 'bg-success text-white hover:bg-green-700 shadow-xs',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
  };

  const sizes = {
    sm: 'h-8 px-3 text-[12px]',
    md: 'h-9 px-4 text-[13px]',
    lg: 'h-11 px-6 text-[14px]'
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, label, error, icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string, error?: string, icon?: React.ReactNode }) {
  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 px-0.5 block">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input 
          className={cn(
            "flex h-9 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 text-[13px] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all dark:text-white",
            icon ? "pl-9 pr-3" : "px-3",
            error && "border-danger focus:border-danger focus:ring-danger/10",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-[11px] text-danger mt-1 px-0.5">{error}</p>}
    </div>
  );
}

export function StatusBadge({ status, type = 'info', className }: { status: string, type?: 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'outline', className?: string }) {
  const types = {
    success: 'bg-green-50 text-green-700 border-green-200/70 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30',
    danger: 'bg-red-50 text-red-700 border-red-200/70 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30',
    info: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-900/30',
    muted: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    outline: 'bg-transparent border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1.5 leading-none whitespace-nowrap", types[type], className)}>
      {status}
    </span>
  );
}

export function KPICard({ label, value, icon: Icon, trend, trendValue, color = 'primary', onClick }: { label: string, value: string | number, icon: any, trend?: 'up' | 'down' | 'neutral', trendValue?: string, color?: string, onClick?: () => void }) {
  const iconTone = color === 'success'
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
    : color === 'danger'
    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
    : color === 'warning'
    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
    : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#FF7861]';

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 transition-all duration-150",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-sm"
      )}
    >
      <div className="flex flex-col h-full justify-between min-w-0">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 truncate tabular-nums">{value}</h3>
        </div>
        {trendValue && (
          <p className={cn("text-[12px] font-semibold mt-3 flex items-center gap-1 tabular-nums", 
            trend === 'up' ? "text-success" : trend === 'down' ? "text-danger" : "text-slate-500 dark:text-slate-400"
          )}>
            {trend === 'up' ? "↑" : trend === 'down' ? "↓" : "·"} {trendValue}
          </p>
        )}
      </div>
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconTone)}>
        <Icon size={18} />
      </div>
    </div>
  );
}

export function Badge({ children, className, variant = 'info' }: { children: React.ReactNode, className?: string, variant?: 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'outline' }) {
  const variants = {
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    info: 'bg-info/10 text-info border-info/20',
    muted: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    outline: 'bg-transparent border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
  };
  
  return (
    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap", variants[variant], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, icon: Icon, hidePrint = false }: { title: string, description?: string, actions?: React.ReactNode, icon?: any, hidePrint?: boolean }) {
  const [printSnapshot, setPrintSnapshot] = useState<PrintableSnapshot | null>(null);

  const handlePrintClick = () => {
    const nativeFired = tryNativePrint();
    if (!nativeFired) {
      setPrintSnapshot(captureModulePrintSnapshot(title, description));
    }
  };

  return (
    <>
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200/80 dark:border-slate-800 print:mb-3 print:pb-2">
        <div className="flex items-start sm:items-center gap-3.5 min-w-[240px] flex-1">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary shrink-0 print:hidden">
              <Icon size={20} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-slate-900 dark:text-white leading-tight">{title}</h1>
            {description && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0 print:hidden">
          {actions}
          {!hidePrint && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrintClick}
              title="Print current module view or export formatted PDF sheet"
              className="gap-1.5"
            >
              <Printer size={14} /> Print
            </Button>
          )}
        </div>
      </div>

      {printSnapshot && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-[120] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-white truncate">
                  Print Preview · {printSnapshot.title}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Embedded preview restricts browser print dialogs — download a formatted PDF or printable HTML sheet below, or use Ctrl+P in a full browser tab.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintSnapshot(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
                aria-label="Close Print Preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                Captured {printSnapshot.tables.length} {printSnapshot.tables.length === 1 ? 'table' : 'tables'}
                {printSnapshot.metrics.length > 0 ? ` · ${printSnapshot.metrics.length} summary metrics` : ''} · {printSnapshot.generatedAt}
                {printSnapshot.bsDate ? ` (${printSnapshot.bsDate})` : ''}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => exportPrintablePdf(printSnapshot)}
                >
                  <FileDown size={14} /> Save as PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPrintableHtmlSheet(printSnapshot)}
                >
                  <FileText size={14} /> Save Printable Sheet (.html)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    try {
                      window.print();
                    } catch {
                      // ignore in sandbox
                    }
                  }}
                >
                  <Printer size={14} /> Try System Print
                </Button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex-1">
              <div className="bg-white text-slate-900 rounded-lg border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <h4 className="text-lg font-bold text-slate-900">{printSnapshot.title}</h4>
                  {printSnapshot.subtitle && (
                    <p className="text-xs text-slate-500 mt-0.5">{printSnapshot.subtitle}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                    Generated {printSnapshot.generatedAt} {printSnapshot.bsDate ? `· ${printSnapshot.bsDate}` : ''}
                  </p>
                </div>

                {printSnapshot.metrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {printSnapshot.metrics.map((m, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">{m.label}</p>
                        <p className="text-base font-bold text-slate-900 mt-0.5 tabular-nums truncate">{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {printSnapshot.tables.length > 0 ? (
                  printSnapshot.tables.map((tbl, tIdx) => (
                    <div key={tIdx} className="space-y-2">
                      {tbl.title && (
                        <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          {tbl.title}
                        </h5>
                      )}
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse text-xs">
                          {tbl.headers.length > 0 && (
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200">
                                {tbl.headers.map((h, hIdx) => (
                                  <th key={hIdx} className="px-2.5 py-2 font-bold text-slate-800 whitespace-nowrap border-r last:border-r-0 border-slate-200">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody className="divide-y divide-slate-200">
                            {tbl.rows.slice(0, 100).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-2.5 py-1.5 text-slate-700 border-r last:border-r-0 border-slate-200">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {tbl.rows.length > 100 && (
                              <tr>
                                <td colSpan={Math.max(1, tbl.headers.length)} className="px-3 py-2 text-center text-slate-500 bg-slate-50 font-medium">
                                  Showing first 100 of {tbl.rows.length} rows in preview — click Save as PDF or Save Printable Sheet for all {tbl.rows.length} rows.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {tbl.footer && tbl.footer.length > 0 && (
                            <tfoot>
                              <tr className="bg-slate-50 border-t border-slate-300 font-bold">
                                {tbl.footer.map((f, fIdx) => (
                                  <td key={fIdx} className="px-2.5 py-2 text-slate-900 border-r last:border-r-0 border-slate-200">
                                    {f}
                                  </td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  ))
                ) : printSnapshot.metrics.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No data table found on this view. Click Save as PDF to export the page header or switch to a report/table tab first.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-slate-200 dark:bg-slate-800 rounded", className)} />
  );
}

export function NepaliRupeeIcon({ 
  size = 18, 
  className = '',
  color = 'currentColor',
  ...props 
}: { 
  size?: number | string; 
  className?: string; 
  color?: string;
  [key: string]: any;
}) {
  const numericSize = typeof size === 'number' ? size : parseInt(size as string, 10) || 18;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={numericSize}
      height={numericSize}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0 select-none inline-block align-middle", className)}
      {...props}
    >
      <title>Nepali Currency (रु.)</title>
      <text
        x="12"
        y="17"
        textAnchor="middle"
        dominantBaseline="auto"
        fill={color}
        fontSize="15"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, 'Segoe UI', 'Noto Sans Devanagari', 'Mukta', 'Mangal', sans-serif"
        style={{ userSelect: 'none' }}
      >
        रु.
      </text>
    </svg>
  );
}
