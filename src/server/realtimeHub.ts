import express from 'express';
import crypto from 'crypto';
import { isEmployeeInUserScope } from '../lib/accessControl.js';
import type { SystemUser } from '../types.js';

export type SseEventType =
  | 'Connected'
  | 'EmployeeUpdated'
  | 'EmployeeCreated'
  | 'EmployeeDeactivated'
  | 'MovementUpdated'
  | 'SeparationRecorded'
  | 'OvertimeUpdated'
  | 'SupervisorOTUpdated'
  | 'PayrollUpdated'
  | 'LeaveUpdated'
  | 'SblUpdated'
  | 'RosterUpdated'
  | 'SettingsUpdated'
  | 'HolidaysUpdated'
  | 'AttendanceUpdated'
  | 'PunchSnapshotUpdated'
  | 'UserPermissionsUpdated'
  | 'AuditLogAppended'
  | 'ApprovalAuditUpdated'
  | 'SystemHealthUpdated';

export type RealtimeEventType = SseEventType;

interface SseClient {
  id: string;
  userId: string;
  email: string;
  username: string;
  role: SystemUser['role'];
  assignedDepartments: string[];
  assignedSections: string[];
  linkedEmployeeId?: string;
  permissions: SystemUser['permissions'];
  sourceIp: string;
  connectedAt: string;
  res: express.Response;
}

export interface BroadcastScopeHint {
  table?: string;
  recordId?: string;
  employeeId?: string;
  department?: string;
  section?: string;
  affectedEmployeeIds?: string[];
  adminOnly?: boolean;
  salarySensitive?: boolean;
  actorEmail?: string;
}

const clients = new Map<string, SseClient>();
let eventSeq = 1;

// Idempotency key store (operationId -> cached server response) with 10-minute TTL
const operationCache = new Map<string, { expiresAt: number; response: any }>();
const OPERATION_TTL_MS = 10 * 60 * 1000;

export function getCachedOperationResult(operationId?: string): any | null {
  if (!operationId) return null;
  const entry = operationCache.get(operationId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    operationCache.delete(operationId);
    return null;
  }
  return entry.response;
}

export function cacheOperationResult(operationId: string | undefined, response: any): void {
  if (!operationId) return;
  const now = Date.now();
  operationCache.set(operationId, { expiresAt: now + OPERATION_TTL_MS, response });
  if (operationCache.size > 500) {
    for (const [k, v] of operationCache.entries()) {
      if (now > v.expiresAt) operationCache.delete(k);
    }
  }
}

export function registerSseClient(user: SystemUser, res: express.Response, sourceIp: string): string {
  const clientId = `sse_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const connectedAt = new Date().toISOString();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const client: SseClient = {
    id: clientId,
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    assignedDepartments: user.assignedDepartments || [],
    assignedSections: user.assignedSections || [],
    linkedEmployeeId: user.linkedEmployeeId,
    permissions: user.permissions,
    sourceIp: String(sourceIp || '').replace(/^::ffff:/, ''),
    connectedAt,
    res
  };
  clients.set(clientId, client);

  try {
    const seq = eventSeq++;
    const payload = {
      clientId,
      connectedAt,
      connectedUsersCount: getUniqueConnectedUserCount()
    };
    res.write(`id: ${seq}\nevent: Connected\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch {
    clients.delete(clientId);
  }

  const heartbeat = setInterval(() => {
    const current = clients.get(clientId);
    if (!current) {
      clearInterval(heartbeat);
      return;
    }
    try {
      current.res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(clientId);
    }
  }, 20000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    broadcastSystemPresence();
  });

  broadcastSystemPresence();
  return clientId;
}

export function getUniqueConnectedUserCount(): number {
  const emails = new Set<string>();
  for (const c of clients.values()) {
    emails.add(c.email.toLowerCase());
  }
  return emails.size;
}

export function getConnectedClientsSummary(includeDetails = true) {
  const uniqueEmails = new Set<string>();
  const sessions: Array<{
    username: string;
    email: string;
    role: string;
    sourceIp: string;
    connectedAt: string;
  }> = [];

  for (const c of clients.values()) {
    uniqueEmails.add(c.email.toLowerCase());
    sessions.push({
      username: c.username,
      email: c.email,
      role: c.role,
      sourceIp: c.sourceIp,
      connectedAt: c.connectedAt
    });
  }

  return {
    count: clients.size,
    clients: sessions,
    activeConnections: clients.size,
    uniqueUsers: uniqueEmails.size,
    sessions
  };
}

function clientCanReceiveEvent(client: SseClient, eventType: SseEventType, hint?: BroadcastScopeHint): boolean {
  if (client.role === 'Super Admin') return true;
  if (hint?.adminOnly || eventType === 'SystemHealthUpdated') return false;

  if (hint?.employeeId || hint?.department || hint?.section) {
    return isEmployeeInUserScope(
      {
        id: hint.employeeId,
        department: hint.department,
        section: hint.section
      },
      {
        id: client.userId,
        username: client.username,
        email: client.email,
        role: client.role,
        status: 'Active',
        assignedDepartments: client.assignedDepartments,
        assignedSections: client.assignedSections,
        linkedEmployeeId: client.linkedEmployeeId,
        permissions: client.permissions
      }
    );
  }

  if (hint?.salarySensitive && !client.permissions?.canViewSalary) {
    return false;
  }

  if (eventType === 'PayrollUpdated' && !client.permissions?.modules?.payroll) {
    return false;
  }

  return true;
}

function broadcastSystemPresence() {
  const count = getUniqueConnectedUserCount();
  const seq = eventSeq++;
  const msg = `id: ${seq}\nevent: SystemHealthUpdated\ndata: ${JSON.stringify({
    connectedUsersCount: count,
    activeConnections: clients.size,
    timestamp: new Date().toISOString()
  })}\n\n`;

  for (const [id, client] of clients.entries()) {
    try {
      client.res.write(msg);
    } catch {
      clients.delete(id);
    }
  }
}

export function broadcastSseEvent(
  eventType: SseEventType,
  payload: Record<string, any>,
  scopeHint?: BroadcastScopeHint
): number {
  const seq = eventSeq++;
  let sentCount = 0;

  for (const [id, client] of clients.entries()) {
    if (!clientCanReceiveEvent(client, eventType, scopeHint)) {
      continue;
    }

    let safePayload = payload;
    if (
      client.role !== 'Super Admin' &&
      !client.permissions?.canViewSalary &&
      payload &&
      typeof payload === 'object'
    ) {
      safePayload = { ...payload };
      delete safePayload.totalGrossSalary;
      delete safePayload.totalNetSalary;
      delete safePayload.basicSalary;
      delete safePayload.grossSalary;
    }

    const body = {
      ...safePayload,
      eventType,
      timestamp: safePayload.timestamp || new Date().toISOString(),
      connectedUsersCount: getUniqueConnectedUserCount()
    };

    try {
      client.res.write(`id: ${seq}\nevent: ${eventType}\ndata: ${JSON.stringify(body)}\n\n`);
      sentCount++;
    } catch {
      clients.delete(id);
    }
  }

  return sentCount;
}
