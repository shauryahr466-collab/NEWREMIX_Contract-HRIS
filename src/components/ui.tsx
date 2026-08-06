import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

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

export function Card({ children, className, title, subtitle, actions }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, actions?: React.ReactNode }) {
  return (
    <div className={cn("bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm transition-all duration-200", className)}>
      {(title || actions) && (
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900/50">
          <div>
            {title && <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white leading-tight">{title}</h3>}
            {subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ children, className, variant = 'primary', size = 'md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success', size?: 'sm' | 'md' | 'lg' }) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    outline: 'bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm',
    danger: 'bg-danger text-white hover:bg-red-700 shadow-sm',
    success: 'bg-success text-white hover:bg-green-700 shadow-sm',
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
        "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
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
      {label && <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 px-0.5">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input 
          className={cn(
            "flex h-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 text-[13px] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all dark:text-white",
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
    success: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30',
    danger: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30',
    info: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30',
    muted: 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-800/50',
    outline: 'bg-transparent border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1.5 leading-none", types[type], className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", 
        type === 'success' ? 'bg-green-500' : 
        type === 'danger' ? 'bg-red-500' : 
        type === 'warning' ? 'bg-amber-500' : 
        type === 'info' ? 'bg-blue-500' : 
        'bg-slate-400'
      )} />
      {status}
    </span>
  );
}

export function KPICard({ label, value, icon: Icon, trend, trendValue, color = 'primary', onClick }: { label: string, value: string | number, icon: any, trend?: 'up' | 'down' | 'neutral', trendValue?: string, color?: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between gap-3 transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5 active:translate-y-0"
      )}
    >
      <div className="flex flex-col h-full justify-between min-w-0">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</h3>
        </div>
        {trendValue && (
          <p className={cn("text-[11px] font-semibold mt-3 flex items-center gap-1", 
            trend === 'up' ? "text-success" : trend === 'down' ? "text-danger" : "text-slate-500"
          )}>
            {trend === 'up' ? "↑" : trend === 'down' ? "↓" : "•"} {trendValue}
          </p>
        )}
      </div>
      <div className={cn("p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 shrink-0")}>
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
    <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium border", variants[variant], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, icon: Icon }: { title: string, description?: string, actions?: React.ReactNode, icon?: any }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-white leading-tight truncate">{title}</h1>
          {description && <p className="text-[13px] text-slate-500 mt-1 truncate">{description}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap lg:justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-slate-200 dark:bg-slate-800 rounded", className)} />
  );
}
