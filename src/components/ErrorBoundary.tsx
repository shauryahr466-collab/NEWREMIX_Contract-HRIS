import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, ShieldCheck, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  moduleName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorRefId: string | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorRefId: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ref = `ERR-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return { hasError: true, error, errorRefId: ref };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[HRIS Error Boundary] ${this.props.moduleName || 'Module'} uncaught error:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorRefId: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public handleCopyDiagnostics = () => {
    const text = `HRIS Error Diagnostics\nRef ID: ${this.state.errorRefId}\nModule: ${this.props.moduleName || 'General'}\nTime: ${new Date().toISOString()}\nError: ${this.state.error?.toString()}\nStack: ${this.state.errorInfo?.componentStack || 'N/A'}`;
    navigator.clipboard.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-xl text-center max-w-xl mx-auto space-y-4">
          <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <AlertTriangle size={28} />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
              {this.props.moduleName ? `${this.props.moduleName} Module` : 'HRIS Protection Shield'}
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white pt-1">
              {this.props.fallbackTitle || 'HRIS Encountered an Unexpected Component Error'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {this.props.fallbackMessage || 'The system prevented a blank screen crash. Your database connection and other HR modules remain completely safe.'}
            </p>
          </div>

          {/* Database Safety Note */}
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
            <span className="flex items-center gap-1.5 font-bold">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              Database Protected: <code className="font-mono">E:\SHRM_HRIS\Database.db</code>
            </span>
            {this.state.errorRefId && (
              <span className="font-mono text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded font-bold">
                {this.state.errorRefId}
              </span>
            )}
          </div>

          {this.state.error && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 text-left rounded-xl text-[11px] font-mono text-rose-600 dark:text-rose-400 overflow-x-auto max-h-32 border border-slate-200 dark:border-slate-700">
              {this.state.error.toString()}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2.5 bg-primary hover:bg-primary-600 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Reload Module
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              <Home size={14} />
              Return to Dashboard
            </button>

            <button
              type="button"
              onClick={this.handleCopyDiagnostics}
              className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
            >
              {this.state.copied ? (
                <>
                  <Check size={13} className="text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy Diagnostics
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
