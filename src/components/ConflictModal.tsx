import React from 'react';
import { ShieldAlert, RefreshCw, X, UserCheck, Clock } from 'lucide-react';
import { Card, Button } from './ui';
import { cn } from '../lib/utils';

export interface ConflictData {
  error: string;
  updatedBy?: string;
  updatedAt?: string;
  latestVersion?: number;
  latestRecord?: any;
  changedFields?: Array<{ field: string; label?: string; oldValue: any; newValue: any }>;
}

export interface ConflictModalProps {
  isOpen: boolean;
  conflictData: ConflictData | null;
  onRefreshLatest: () => void;
  onDismiss: () => void;
}

export function ConflictModal({ isOpen, conflictData, onRefreshLatest, onDismiss }: ConflictModalProps) {
  if (!isOpen || !conflictData) return null;

  const changedFields = Array.isArray(conflictData.changedFields) ? conflictData.changedFields : [];

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-6 shadow-2xl border-amber-200 dark:border-amber-900/50 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/20">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Concurrent Update Conflict (409)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Stale update prevented to protect database integrity.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-semibold leading-relaxed">
            {conflictData.error || 'This record has been updated by another user. Please refresh and review the latest information before saving.'}
          </p>
          {(conflictData.updatedBy || conflictData.updatedAt) && (
            <div className="flex items-center gap-4 text-[11px] text-amber-700 dark:text-amber-300 font-mono pt-1 border-t border-amber-200/50 dark:border-amber-800/50">
              {conflictData.updatedBy && (
                <span className="flex items-center gap-1">
                  <UserCheck size={13} /> Updated By: <strong>{conflictData.updatedBy}</strong>
                </span>
              )}
              {conflictData.updatedAt && (
                <span className="flex items-center gap-1">
                  <Clock size={13} /> Time: <strong>{new Date(conflictData.updatedAt).toLocaleTimeString()}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {changedFields.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Conflicting Fields Changed on Server
            </span>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 max-h-40 overflow-y-auto text-xs font-mono">
              {changedFields.map((field, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-slate-700/50 last:border-0">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{field.label || field.field}:</span>
                  <div className="text-right">
                    <span className="text-rose-600 line-through mr-2">{String(field.oldValue ?? '—')}</span>
                    <span className="text-emerald-600 font-bold">{String(field.newValue ?? '—')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 text-xs"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            className="flex-1 text-xs gap-2"
            onClick={onRefreshLatest}
          >
            <RefreshCw size={14} />
            Refresh Latest Data
          </Button>
        </div>
      </Card>
    </div>
  );
}
