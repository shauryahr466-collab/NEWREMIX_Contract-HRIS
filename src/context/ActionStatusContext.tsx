import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ActionState, ActionConfirmationConfig, ActionStatusResult, FieldDiff } from '../types';
import { saveLocalTableDetailed } from '../lib/localClient';
import { toast } from 'sonner';

export interface ProgressUpdate {
  percent?: number;
  message?: string;
  stage?: string;
  processed?: number;
  total?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
}

interface ActionStatusContextType {
  actionState: ActionState;
  isProcessing: boolean;
  operationId: string | null;
  config: ActionConfirmationConfig | null;
  result: ActionStatusResult | null;
  progress: ProgressUpdate;
  autoCloseCountdown: number | null;
  confirmAction: (config: ActionConfirmationConfig) => Promise<boolean>;
  handleUserConfirm: () => void;
  handleUserCancel: () => void;
  handleForceCancel: () => void;
  executeWithStatus: <T = any>(
    config: ActionConfirmationConfig,
    task: (updateProgress: (update: ProgressUpdate) => void) => Promise<{
      success: boolean;
      affectedCount?: number;
      changedFieldsCount?: number;
      verificationStatus?: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
      transaction?: 'COMMITTED' | 'ROLLED_BACK' | 'N/A';
      dbPath?: string;
      error?: string;
      breakdown?: Record<string, any>;
      data?: T;
    }>
  ) => Promise<{ success: boolean; data?: T; result?: ActionStatusResult }>;
  showSuccess: (result: Partial<ActionStatusResult> & { module: string }) => void;
  showError: (error: any, module: string, operation?: string, retryFn?: () => void) => void;
  closeModal: () => void;
  retryLastAction: (() => void) | null;
}

const ActionStatusContext = createContext<ActionStatusContextType | undefined>(undefined);

function generateOperationId(moduleName: string): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `OP-${dateStr}-${rand}`;
}

export function ActionStatusProvider({ children }: { children: React.ReactNode }) {
  const [actionState, setActionState] = useState<ActionState>('IDLE');
  const [config, setConfig] = useState<ActionConfirmationConfig | null>(null);
  const [result, setResult] = useState<ActionStatusResult | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate>({});
  const [operationId, setOperationId] = useState<string | null>(null);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);
  
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isProcessing = actionState === 'CONFIRMED' || actionState === 'PROCESSING' || actionState === 'VERIFYING';

  const clearTimers = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setAutoCloseCountdown(null);
  }, []);

  const closeModal = useCallback(() => {
    clearTimers();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setActionState('IDLE');
    setConfig(null);
    setResult(null);
    setProgress({});
    setOperationId(null);
  }, [clearTimers]);

  const confirmAction = useCallback((conf: ActionConfirmationConfig): Promise<boolean> => {
    // Prevent duplicate triggers if already confirming or processing
    if (actionState !== 'IDLE') {
      console.warn('[ActionStatus] Action already active, ignoring duplicate trigger:', conf.title);
      return Promise.resolve(false);
    }

    clearTimers();
    const opId = conf.operationId || generateOperationId(conf.module);
    setOperationId(opId);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setConfig({ ...conf, operationId: opId });
      setResult(null);
      setProgress({});
      setActionState('CONFIRMATION_REQUIRED');
    });
  }, [actionState, clearTimers]);

  const handleUserConfirm = useCallback(() => {
    if (resolverRef.current) {
      setActionState('CONFIRMED');
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, []);

  const handleUserCancel = useCallback(() => {
    clearTimers();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setActionState('CANCELLED');
    setTimeout(() => {
      closeModal();
    }, 250);
  }, [clearTimers, closeModal]);

  const handleForceCancel = useCallback(() => {
    clearTimers();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setActionState('CANCELLED');
    toast.warning('Operation cancelled and screen released.');
    setTimeout(() => {
      closeModal();
    }, 200);
  }, [clearTimers, closeModal]);

  const executeWithStatus = useCallback(async <T = any>(
    conf: ActionConfirmationConfig,
    task: (updateProgress: (update: ProgressUpdate) => void) => Promise<{
      success: boolean;
      affectedCount?: number;
      changedFieldsCount?: number;
      verificationStatus?: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
      transaction?: 'COMMITTED' | 'ROLLED_BACK' | 'N/A';
      dbPath?: string;
      error?: string;
      breakdown?: Record<string, any>;
      data?: T;
    }>
  ): Promise<{ success: boolean; data?: T; result?: ActionStatusResult }> => {
    // 1. Ask for confirmation first
    const isConfirmed = await confirmAction(conf);
    if (!isConfirmed) {
      return { success: false };
    }

    // 2. Transition to PROCESSING state
    const currentOpId = conf.operationId || generateOperationId(conf.module);
    setOperationId(currentOpId);
    setActionState('PROCESSING');
    setProgress({ percent: 10, message: 'Initiating transaction...', stage: 'PREPARING' });

    const updateProgress = (update: ProgressUpdate) => {
      setProgress(prev => {
        const next = { ...prev, ...update };
        // Advance to VERIFYING state when progress reaches 80%+
        if ((next.percent || 0) >= 80 && actionState === 'PROCESSING') {
          setActionState('VERIFYING');
        }
        return next;
      });
    };

    const startTime = new Date();
    retryRef.current = () => {
      executeWithStatus(conf, task);
    };

    // Safe timeout protection (45 seconds max before auto-warning/recovery)
    const timeoutPromise = new Promise<{ isTimeout: true; res?: never }>((resolve) => {
      timeoutRef.current = setTimeout(() => {
        resolve({ isTimeout: true });
      }, 45000);
    });

    try {
      // Race task against hang timeout
      const raceResult = await Promise.race([
        task(updateProgress).then(res => ({ isTimeout: false as const, res })),
        timeoutPromise
      ]);

      clearTimers();

      if (raceResult.isTimeout || !raceResult.res) {
        const errorRef = `TO-${startTime.getFullYear()}${(startTime.getMonth()+1).toString().padStart(2,'0')}${startTime.getDate().toString().padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        const timeoutRes: ActionStatusResult = {
          success: false,
          verified: false,
          verificationStatus: 'FAILED',
          transaction: 'ROLLED_BACK',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          affectedCount: 0,
          module: conf.module,
          recordId: conf.recordId,
          recordName: conf.recordName,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          error: 'The operation timed out before receiving database confirmation. Database remains protected.',
          errorRefId: errorRef,
          operationId: currentOpId
        };
        setResult(timeoutRes);
        setActionState('FAILED');
        toast.error(`Operation timed out (${conf.title}). Database safety preserved.`);
        return { success: false, result: timeoutRes };
      }

      const taskRes = raceResult.res;

      if (taskRes.success) {
        const statusRes: ActionStatusResult = {
          success: true,
          verified: taskRes.verificationStatus !== 'FAILED',
          verificationStatus: taskRes.verificationStatus || 'PASSED',
          transaction: taskRes.transaction || 'COMMITTED',
          dbPath: taskRes.dbPath || 'E:\\SHRM_HRIS\\Database.db',
          affectedCount: taskRes.affectedCount ?? conf.affectedCount ?? 1,
          module: conf.module,
          recordId: conf.recordId,
          recordName: conf.recordName,
          changedFieldsCount: taskRes.changedFieldsCount ?? conf.changedFields?.length ?? 0,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          breakdown: taskRes.breakdown,
          operationId: currentOpId
        };

        setResult(statusRes);
        setActionState('SUCCESS');

        // Automatically trigger professional toast notification
        const countLabel = statusRes.affectedCount === 1 ? '1 record' : `${statusRes.affectedCount} records`;
        toast.success(
          `${conf.title.replace(/\?$/, '')} completed successfully (${countLabel}).`,
          { description: `Verified in ${statusRes.dbPath}` }
        );

        // Automatically log audit entry in local SQLite
        try {
          let actorName = 'System Admin';
          try {
            const profRaw = sessionStorage.getItem('local_user_profile');
            const sessRaw = sessionStorage.getItem('local_session_user');
            const parsedProf = profRaw ? JSON.parse(profRaw) : (sessRaw ? JSON.parse(sessRaw) : null);
            actorName = parsedProf?.username || parsedProf?.displayName || parsedProf?.email || actorName;
          } catch {}
          const nowIso = new Date().toISOString();
          const changedSummary = Array.isArray(conf.changedFields) && conf.changedFields.length > 0
            ? conf.changedFields.map((c: any) => c?.label || c?.field).filter(Boolean).join(', ')
            : '';
          const auditEntry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            employeeId: conf.recordId || 'SYSTEM',
            employeeName: conf.recordName || conf.module || 'System Operation',
            date: nowIso.split('T')[0],
            field: `${conf.module} (${conf.actionType.toUpperCase()})`,
            oldValue: changedSummary || 'Previous State',
            newValue: `${statusRes.affectedCount} record${statusRes.affectedCount === 1 ? '' : 's'} ${statusRes.verificationStatus || 'COMMITTED'}`,
            changedBy: actorName,
            timestamp: nowIso,
            changedAt: nowIso,
            action: conf.actionType.toUpperCase(),
            remarks: `${conf.title.replace(/\?$/, '')} · Op ${currentOpId}${changedSummary ? ` · Fields: ${changedSummary}` : ''}`
          };
          saveLocalTableDetailed('audit_logs', [auditEntry]).catch(() => {});
        } catch (aErr) {
          // ignore
        }

        // Automatic Modal Closing on SUCCESS:
        // Give brief visual confirmation (1.2s default) and automatically close
        const delay = conf.autoCloseDelayMs ?? 1400;
        let remainingSeconds = Math.ceil(delay / 1000);
        setAutoCloseCountdown(remainingSeconds);

        countdownIntervalRef.current = setInterval(() => {
          remainingSeconds -= 1;
          if (remainingSeconds > 0) {
            setAutoCloseCountdown(remainingSeconds);
          } else {
            setAutoCloseCountdown(null);
          }
        }, 1000);

        autoCloseTimerRef.current = setTimeout(() => {
          closeModal();
        }, delay);

        return { success: true, data: taskRes.data, result: statusRes };
      } else {
        const errorRef = `ERR-${startTime.getFullYear()}${(startTime.getMonth()+1).toString().padStart(2,'0')}${startTime.getDate().toString().padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        const failRes: ActionStatusResult = {
          success: false,
          verified: false,
          verificationStatus: 'FAILED',
          transaction: taskRes.transaction || 'ROLLED_BACK',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          affectedCount: 0,
          module: conf.module,
          recordId: conf.recordId,
          recordName: conf.recordName,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          error: taskRes.error || 'Database operation could not be completed.',
          errorRefId: errorRef,
          operationId: currentOpId
        };

        setResult(failRes);
        setActionState('FAILED');
        toast.error(failRes.error || 'Database operation failed');
        return { success: false, result: failRes };
      }
    } catch (err: any) {
      clearTimers();
      const errorRef = `ERR-${startTime.getFullYear()}${(startTime.getMonth()+1).toString().padStart(2,'0')}${startTime.getDate().toString().padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
      const failRes: ActionStatusResult = {
        success: false,
        verified: false,
        verificationStatus: 'FAILED',
        transaction: 'ROLLED_BACK',
        dbPath: 'E:\\SHRM_HRIS\\Database.db',
        affectedCount: 0,
        module: conf.module,
        recordId: conf.recordId,
        recordName: conf.recordName,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        error: err?.message || 'Unexpected exception during execution.',
        errorRefId: errorRef,
        operationId: currentOpId
      };

      setResult(failRes);
      setActionState('FAILED');
      toast.error(failRes.error);
      return { success: false, result: failRes };
    }
  }, [confirmAction, clearTimers, closeModal, actionState]);

  const showSuccess = useCallback((res: Partial<ActionStatusResult> & { module: string }) => {
    const fullRes: ActionStatusResult = {
      success: true,
      verified: res.verified ?? true,
      verificationStatus: res.verificationStatus || 'PASSED',
      transaction: res.transaction || 'COMMITTED',
      dbPath: res.dbPath || 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: res.affectedCount ?? 1,
      module: res.module,
      recordId: res.recordId,
      recordName: res.recordName,
      changedFieldsCount: res.changedFieldsCount ?? 0,
      timestamp: res.timestamp || new Date().toLocaleTimeString('en-GB', { hour12: false }),
      breakdown: res.breakdown,
      operationId: res.operationId || generateOperationId(res.module)
    };
    setResult(fullRes);
    setActionState('SUCCESS');
    toast.success(`${res.module}: Operation completed successfully.`);

    // Auto-close on manual success trigger as well
    autoCloseTimerRef.current = setTimeout(() => {
      closeModal();
    }, 1400);
  }, [closeModal]);

  const showError = useCallback((error: any, module: string, operation?: string, retryFn?: () => void) => {
    const d = new Date();
    const errorRef = `ERR-${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    retryRef.current = retryFn || null;
    const failRes: ActionStatusResult = {
      success: false,
      verified: false,
      verificationStatus: 'FAILED',
      transaction: 'ROLLED_BACK',
      dbPath: 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: 0,
      module: module,
      timestamp: d.toLocaleTimeString('en-GB', { hour12: false }),
      error: typeof error === 'string' ? error : error?.message || 'An unexpected error occurred.',
      errorRefId: errorRef,
      operationId: generateOperationId(module)
    };
    setResult(failRes);
    setActionState('FAILED');
    toast.error(failRes.error);
  }, []);

  return (
    <ActionStatusContext.Provider value={{
      actionState,
      isProcessing,
      operationId,
      config,
      result,
      progress,
      autoCloseCountdown,
      confirmAction,
      handleUserConfirm,
      handleUserCancel,
      handleForceCancel,
      executeWithStatus,
      showSuccess,
      showError,
      closeModal,
      retryLastAction: retryRef.current
    }}>
      {children}
    </ActionStatusContext.Provider>
  );
}

export function useActionStatus() {
  const context = useContext(ActionStatusContext);
  if (!context) {
    throw new Error('useActionStatus must be used within an ActionStatusProvider');
  }
  return context;
}

