import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { getInMemorySessionToken } from '../lib/authSession';
import { toast } from 'sonner';

export type ConnectionStatus = 'Connected' | 'Reconnecting' | 'Disconnected';

export function useRealtimeSync() {
  const { 
    refreshPunchesFromSqlite, 
    user, 
    recalculate, 
    refreshCurrentUserProfile 
  } = useAppStore();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Disconnected');
  const [connectedUsersCount, setConnectedUsersCount] = useState<number>(1);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const reconcileFromServer = useCallback(async () => {
    try {
      await Promise.all([
        refreshPunchesFromSqlite(false),
        recalculate()
      ]);
    } catch {
      // ignore
    }
  }, [refreshPunchesFromSqlite, recalculate]);

  useEffect(() => {
    const token = getInMemorySessionToken();
    if (!user || !token) {
      setConnectionStatus('Disconnected');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const connectSse = () => {
      if (!isMounted) return;
      const currentAuthToken = getInMemorySessionToken();
      if (!currentAuthToken) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      setConnectionStatus(reconnectAttemptsRef.current === 0 ? 'Connected' : 'Reconnecting');

      const url = `/api/events?token=${encodeURIComponent(currentAuthToken)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isMounted) return;
        setConnectionStatus('Connected');
        reconnectAttemptsRef.current = 0;
        reconcileFromServer();
      };

      const handleGlobalEvent = async (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(e.data || '{}');
          if (data.connectedUsersCount !== undefined) {
            setConnectedUsersCount(Number(data.connectedUsersCount) || 1);
          }

          if (e.type === 'EmployeeUpdated' || e.type === 'EmployeeCreated' || e.type === 'EmployeeDeactivated') {
            await recalculate();
          } else if (e.type === 'PunchSnapshotUpdated' || e.type === 'AttendanceUpdated') {
            await refreshPunchesFromSqlite(false);
          } else if (e.type === 'PayrollUpdated' || e.type === 'OvertimeUpdated' || e.type === 'SblUpdated' || e.type === 'SettingsUpdated' || e.type === 'HolidaysUpdated') {
            await recalculate();
          } else if (e.type === 'UserPermissionsUpdated') {
            if (!data.email || data.email.toLowerCase() === String(user?.email || '').toLowerCase()) {
              await refreshCurrentUserProfile();
            }
          }
        } catch {
          // ignore parse error
        }
      };

      es.addEventListener('Connected', (e: any) => handleGlobalEvent(e));
      es.addEventListener('SystemHealthUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('EmployeeUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('EmployeeCreated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('EmployeeDeactivated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('MovementUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('SeparationRecorded', (e: any) => handleGlobalEvent(e));
      es.addEventListener('OvertimeUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('SupervisorOTUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('PayrollUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('LeaveUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('SblUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('RosterUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('SettingsUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('HolidaysUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('AttendanceUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('PunchSnapshotUpdated', (e: any) => handleGlobalEvent(e));
      es.addEventListener('UserPermissionsUpdated', (e: any) => handleGlobalEvent(e));

      es.onerror = () => {
        if (!isMounted) return;
        es.close();
        eventSourceRef.current = null;
        setConnectionStatus('Reconnecting');

        reconnectAttemptsRef.current += 1;
        const delay = Math.min(15000, 1000 * Math.pow(1.5, reconnectAttemptsRef.current));

        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          connectSse();
        }, delay);
      };
    };

    connectSse();

    // Fallback 30s poll digest check in case proxy/Caddy buffers SSE
    fallbackPollTimerRef.current = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          if (connectionStatus === 'Disconnected') {
            setConnectionStatus('Connected');
          }
        } else {
          setConnectionStatus('Reconnecting');
        }
      } catch {
        setConnectionStatus('Reconnecting');
      }
    }, 30000);

    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (fallbackPollTimerRef.current) clearInterval(fallbackPollTimerRef.current);
    };
  }, [user, refreshPunchesFromSqlite, recalculate, refreshCurrentUserProfile]);

  return {
    connectionStatus,
    connectedUsersCount,
    reconcileFromServer
  };
}
