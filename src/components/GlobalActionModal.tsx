import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  Database, 
  ShieldCheck, 
  Trash2, 
  Save, 
  FileUp, 
  Calculator, 
  Check, 
  X, 
  ArrowRight, 
  RefreshCw, 
  Clock, 
  AlertCircle,
  Copy,
  Hash
} from 'lucide-react';
import { useActionStatus } from '../context/ActionStatusContext';

export function GlobalActionModal() {
  const { 
    actionState, 
    config, 
    result, 
    progress, 
    operationId,
    autoCloseCountdown,
    isProcessing,
    confirmAction, 
    handleUserConfirm, 
    handleUserCancel, 
    handleForceCancel,
    closeModal, 
    retryLastAction 
  } = useActionStatus();

  if (actionState === 'IDLE') return null;

  const currentOpId = operationId || config?.operationId || result?.operationId;

  const handleCopyError = () => {
    if (result?.errorRefId || result?.error) {
      const text = `Operation ID: ${currentOpId || 'N/A'}\nError Ref: ${result?.errorRefId || 'N/A'}\nModule: ${result?.module}\nError: ${result?.error}\nTime: ${result?.timestamp}`;
      navigator.clipboard.writeText(text);
    }
  };

  const getActionIcon = () => {
    switch (config?.actionType) {
      case 'delete':
      case 'bulk_delete':
        return <Trash2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />;
      case 'import':
        return <FileUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />;
      case 'payroll_run':
      case 'payroll_approve':
      case 'payroll_lock':
        return <Calculator className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />;
      case 'save':
      default:
        return <Save className="w-6 h-6 text-primary dark:text-primary-400" />;
    }
  };

  const isWorking = actionState === 'PROCESSING' || actionState === 'VERIFYING' || actionState === 'CONFIRMED';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8"
        >
          {/* Header Banner */}
          <div className={`p-5 flex items-start gap-4 border-b ${
            actionState === 'CONFIRMATION_REQUIRED' && config?.isDestructive
              ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40'
              : actionState === 'SUCCESS'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40'
              : actionState === 'FAILED'
              ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40'
              : isWorking
              ? 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40'
              : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              actionState === 'CONFIRMATION_REQUIRED' && config?.isDestructive
                ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                : actionState === 'SUCCESS'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                : actionState === 'FAILED'
                ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                : isWorking
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>
              {isWorking ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
              ) : actionState === 'SUCCESS' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              ) : actionState === 'FAILED' ? (
                <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              ) : (
                getActionIcon()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {config?.module || result?.module || 'System Action'}
                </span>
                {currentOpId && (
                  <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                    <Hash size={10} /> {currentOpId}
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  {isWorking ? (actionState === 'VERIFYING' ? 'Verifying Integrity...' : 'In Progress') : actionState === 'SUCCESS' ? 'Verified & Saved' : actionState === 'FAILED' ? 'Execution Error' : 'Action Confirmation'}
                </span>
              </div>

              <h3 className="text-base font-black text-slate-900 dark:text-white mt-1 truncate">
                {isWorking
                  ? progress.message || (actionState === 'VERIFYING' ? 'Verifying records in SQLite...' : 'Processing transaction...')
                  : actionState === 'SUCCESS'
                  ? `✓ ${config?.title || 'Action Completed Successfully'}`
                  : actionState === 'FAILED'
                  ? '✕ Operation Failed'
                  : config?.title || 'Save Changes?'}
              </h3>

              {config?.subtitle && actionState === 'CONFIRMATION_REQUIRED' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {config.subtitle}
                </p>
              )}
            </div>

            {!isWorking && (
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* 1. CONFIRMATION REQUIRED STATE */}
            {actionState === 'CONFIRMATION_REQUIRED' && (
              <div className="space-y-4">
                {/* Target Record Card */}
                {(config?.recordId || config?.recordName || config?.affectedCount) && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
                        Target Record
                      </span>
                      <span className="font-black text-slate-800 dark:text-slate-200">
                        {config?.recordId ? `${config.recordId} ${config.recordName ? `— ${config.recordName}` : ''}` : `${config?.affectedCount || 1} records`}
                      </span>
                    </div>
                    {config?.affectedCount && (
                      <span className="px-2 py-1 bg-slate-200 dark:bg-slate-700 font-bold rounded-md text-slate-700 dark:text-slate-300">
                        {config.affectedCount} {config.affectedCount === 1 ? 'Record' : 'Records'}
                      </span>
                    )}
                  </div>
                )}

                {/* Changed Fields Diff Table */}
                {config?.changedFields && config.changedFields.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Changed Fields ({config.changedFields.length})
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        Old → New
                      </span>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-xs">
                      {config.changedFields.map((field, idx) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <span className="font-bold text-slate-700 dark:text-slate-300 min-w-[100px]">
                            {field.label || field.field}
                          </span>
                          <div className="flex items-center gap-2 font-mono text-[11px] overflow-hidden">
                            <span className="text-slate-400 dark:text-slate-500 line-through truncate max-w-[120px]" title={String(field.oldValue ?? 'None')}>
                              {String(field.oldValue ?? 'None')}
                            </span>
                            <ArrowRight size={12} className="text-slate-300 dark:text-slate-600 shrink-0" />
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded truncate max-w-[140px]" title={String(field.newValue ?? 'None')}>
                              {String(field.newValue ?? 'None')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Details Breakdown (e.g. for Payroll Run or Roster) */}
                {config?.details && Object.keys(config.details).length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                    {Object.entries(config.details).map(([key, val]) => (
                      <div key={key} className="flex justify-between py-0.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{key}:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Target Database Location */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  <Database size={13} className="text-slate-400 shrink-0" />
                  <span>Target: <strong className="font-mono text-slate-700 dark:text-slate-300">E:\SHRM_HRIS\Database.db</strong></span>
                </div>
              </div>
            )}

            {/* 2. PROCESSING / VERIFYING STATE */}
            {isWorking && (
              <div className="space-y-4 py-3 text-center">
                <div className="space-y-2">
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
                    <motion.div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress.percent || 45}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>{progress.message || 'Executing SQLite transaction...'}</span>
                    <span>{progress.percent ? `${Math.round(progress.percent)}%` : 'Processing'}</span>
                  </div>
                </div>

                {/* Counter statistics if available */}
                {(progress.total !== undefined || progress.processed !== undefined) && (
                  <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <span className="text-[10px] text-slate-400 block font-bold">TOTAL</span>
                      <span className="font-black text-slate-800 dark:text-slate-100">{progress.total ?? 0}</span>
                    </div>
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                      <span className="text-[10px] text-emerald-600 block font-bold">INSERTED</span>
                      <span className="font-black text-emerald-600">{progress.inserted ?? 0}</span>
                    </div>
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg">
                      <span className="text-[10px] text-indigo-600 block font-bold">UPDATED</span>
                      <span className="font-black text-indigo-600">{progress.updated ?? 0}</span>
                    </div>
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                      <span className="text-[10px] text-rose-600 block font-bold">ERRORS</span>
                      <span className="font-black text-rose-600">{progress.errors ?? 0}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-2">
                  <Database size={12} />
                  <span>Persisting to <code className="font-mono font-bold">E:\SHRM_HRIS\Database.db</code></span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleForceCancel}
                    className="text-[11px] text-slate-400 hover:text-rose-600 underline font-medium transition-colors"
                  >
                    Taking too long? Click here to release screen
                  </button>
                </div>
              </div>
            )}

            {/* 3. SUCCESS STATE */}
            {actionState === 'SUCCESS' && result && (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                      <ShieldCheck size={16} className="text-emerald-600" />
                      <span>Database Transaction Committed & Verified</span>
                    </div>
                    {autoCloseCountdown !== null && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        Closing in {autoCloseCountdown}s...
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">Record</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {result.recordId ? `${result.recordId} ${result.recordName ? `(${result.recordName})` : ''}` : `${result.affectedCount} records`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">Affected</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {result.affectedCount} {result.affectedCount === 1 ? 'Record' : 'Records'} ({result.changedFieldsCount || 0} fields)
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">Database</span>
                      <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate block" title={result.dbPath}>
                        {result.dbPath}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">Verification Status</span>
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <Check size={12} /> {result.verificationStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Breakdown details if present */}
                {result.breakdown && Object.keys(result.breakdown).length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-1 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Operation Summary
                    </span>
                    {Object.entries(result.breakdown).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">{k}:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock size={12} /> {result.timestamp}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ Saved to Local SQLite
                  </span>
                </div>
              </div>
            )}

            {/* 4. FAILED STATE */}
            {actionState === 'FAILED' && result && (
              <div className="space-y-3">
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-black">
                    <AlertTriangle size={16} className="text-rose-600" />
                    <span>Transaction Failed & Rolled Back</span>
                  </div>
                  <p className="text-rose-700 dark:text-rose-400 font-mono text-[11px] bg-rose-100/50 dark:bg-rose-900/30 p-2.5 rounded-lg break-words">
                    {result.error || 'The SQLite database could not complete the operation.'}
                  </p>
                  {result.errorRefId && (
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 font-mono">
                        Ref ID: <strong>{result.errorRefId}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyError}
                        className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 font-bold underline"
                      >
                        <Copy size={11} /> Copy Diagnostics
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
                  <p><strong>Database Safety:</strong> The transaction was safely rolled back. No corrupted or partial data was saved to <code className="font-mono font-bold">E:\SHRM_HRIS\Database.db</code>.</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            {actionState === 'CONFIRMATION_REQUIRED' && (
              <>
                <button
                  type="button"
                  onClick={handleUserCancel}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all"
                >
                  {config?.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (config?.onConfirm) {
                      config.onConfirm();
                    }
                    handleUserConfirm();
                  }}
                  className={`px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-sm transition-all flex items-center gap-2 ${
                    config?.isDestructive
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-primary hover:bg-primary-600'
                  }`}
                >
                  {config?.isDestructive ? (
                    <>
                      <Trash2 size={14} />
                      {config?.confirmText || 'Delete Permanently'}
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      {config?.confirmText || 'Confirm & Save'}
                    </>
                  )}
                </button>
              </>
            )}

            {isWorking && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                <span>{actionState === 'VERIFYING' ? 'Verifying SQLite integrity...' : 'Writing to Local Database...'}</span>
              </div>
            )}

            {actionState === 'SUCCESS' && (
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all flex items-center gap-2"
              >
                <Check size={14} />
                {autoCloseCountdown !== null ? `Done (${autoCloseCountdown}s)` : 'Done'}
              </button>
            )}

            {actionState === 'FAILED' && (
              <>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all"
                >
                  Close
                </button>
                {retryLastAction && (
                  <button
                    type="button"
                    onClick={retryLastAction}
                    className="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Try Again
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

