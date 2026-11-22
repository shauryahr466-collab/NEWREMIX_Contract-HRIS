import crypto from 'crypto';
import { getSqliteDb, saveSqliteDb, withSqliteWriteLock } from './sqliteDb.js';
import {
  getDefaultPermissionsForRole,
  isEmployeeInUserScope,
  normalizeRoleName,
  normalizeSystemUser
} from '../lib/accessControl.js';
import type { SystemRole, SystemUser } from '../types.js';

export const SUPER_ADMIN_EMAILS = [
  'hr.sandiprajak466@gmail.com',
  'shauryahr466@gmail.com'
];

export function isBootstrapSuperAdminEmail(email: string): boolean {
  const norm = String(email || '').trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === norm);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(String(password), salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

function sanitizeUser(raw: any): SystemUser {
  const clean = { ...raw };
  delete clean.passwordHash;
  delete clean.password;
  return normalizeSystemUser(clean);
}

async function readRawUsersFromDb(): Promise<any[]> {
  const db = await getSqliteDb();
  const res = db.exec('SELECT id, email, role, data, created_at FROM users ORDER BY created_at DESC');
  if (!res.length) return [];
  return res[0].values
    .map(row => {
      try {
        const parsed = JSON.parse(String(row[3] || '{}'));
        return {
          ...parsed,
          id: String(row[0] || parsed.id || ''),
          email: String(row[1] || parsed.email || '').trim().toLowerCase(),
          role: parsed.role || row[2] || 'Supervisor',
          createdAt: parsed.createdAt || row[4]
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function listSystemUsers(): Promise<SystemUser[]> {
  const rows = await readRawUsersFromDb();
  const byEmail = new Map<string, any>();

  for (const r of rows) {
    const emailKey = String(r.email || r.id).trim().toLowerCase();
    const existing = byEmail.get(emailKey);
    // Prefer richer records (with permissions / passwordHash / newer updatedAt)
    if (!existing) {
      byEmail.set(emailKey, r);
    } else {
      const existingScore = (existing.permissions ? 2 : 0) + (existing.passwordHash ? 2 : 0) + (existing.updatedAt ? 1 : 0);
      const nextScore = (r.permissions ? 2 : 0) + (r.passwordHash ? 2 : 0) + (r.updatedAt ? 1 : 0);
      if (nextScore >= existingScore) {
        byEmail.set(emailKey, r);
      }
    }
  }

  for (const adminEmail of SUPER_ADMIN_EMAILS) {
    const key = adminEmail.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        id: `super_admin_${key.replace(/[^a-z0-9]/g, '_')}`,
        username: adminEmail.split('@')[0],
        email: key,
        role: 'Super Admin',
        status: 'Active',
        assignedDepartments: [],
        assignedSections: [],
        permissions: getDefaultPermissionsForRole('Super Admin'),
        createdBy: 'System',
        createdAt: new Date().toISOString()
      });
    } else {
      const cur = byEmail.get(key);
      cur.role = 'Super Admin';
      cur.status = 'Active';
    }
  }

  return Array.from(byEmail.values()).map(sanitizeUser);
}

export async function resolveSessionProfile(identifier: string): Promise<SystemUser | null> {
  const target = String(identifier || '').trim().toLowerCase();
  if (!target) return null;

  const users = await listSystemUsers();
  const matched = users.find(
    u => u.email.toLowerCase() === target || u.username.toLowerCase() === target || u.id.toLowerCase() === target
  );
  if (matched) {
    if (isBootstrapSuperAdminEmail(matched.email)) {
      return {
        ...matched,
        role: 'Super Admin',
        status: 'Active',
        permissions: getDefaultPermissionsForRole('Super Admin')
      };
    }
    return matched;
  }

  if (isBootstrapSuperAdminEmail(target)) {
    return normalizeSystemUser({
      id: `super_admin_${target.replace(/[^a-z0-9]/g, '_')}`,
      username: target.split('@')[0],
      email: target,
      role: 'Super Admin',
      status: 'Active',
      assignedDepartments: [],
      assignedSections: [],
      permissions: getDefaultPermissionsForRole('Super Admin')
    });
  }

  return null;
}

export async function authenticateLocalUser(
  identifier: string,
  password: string
): Promise<{ success: true; user: SystemUser } | { success: false; error: string; statusCode: number }> {
  const cleanId = String(identifier || '').trim().toLowerCase();
  const cleanPass = String(password || '');
  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Email/Login ID and password are required', statusCode: 400 };
  }

  const rows = await readRawUsersFromDb();
  const matchingRows = rows.filter(
    r =>
      String(r.email || '').trim().toLowerCase() === cleanId ||
      String(r.username || '').trim().toLowerCase() === cleanId
  );

  // Pick row with passwordHash if multiple legacy rows share email
  const record = matchingRows.find(r => Boolean(r.passwordHash)) || matchingRows[0];

  if (!record) {
    return { success: false, error: 'Account not found in local user directory', statusCode: 404 };
  }

  const normalized = sanitizeUser(record);
  if (normalized.status === 'Suspended') {
    return { success: false, error: 'This user account is suspended. Contact Super Admin.', statusCode: 403 };
  }

  if (!record.passwordHash) {
    return {
      success: false,
      error: 'No local password set for this account. Sign in with Google/Instant Admin Access or ask Super Admin to set a password.',
      statusCode: 401
    };
  }

  if (!verifyPassword(cleanPass, record.passwordHash)) {
    return { success: false, error: 'Invalid password', statusCode: 401 };
  }

  return { success: true, user: normalized };
}

export interface UpsertSystemUserInput {
  id?: string;
  username: string;
  email: string;
  password?: string;
  role: SystemRole | string;
  status?: 'Active' | 'Suspended';
  assignedDepartments?: string[];
  assignedSections?: string[];
  linkedEmployeeId?: string;
  permissions?: any;
  notes?: string;
  createdBy?: string;
}

export async function createOrUpdateSystemUser(
  input: UpsertSystemUserInput,
  explicitId?: string
): Promise<{ user: SystemUser; created: boolean }> {
  const email = String(input.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Email / Login ID is required');
  }

  const role = normalizeRoleName(input.role);
  const username = String(input.username || email.split('@')[0] || 'User').trim();
  const status = String(input.status || 'Active').toLowerCase() === 'suspended' ? 'Suspended' : 'Active';
  const assignedDepartments = Array.isArray(input.assignedDepartments)
    ? Array.from(new Set(input.assignedDepartments.map(s => String(s || '').trim()).filter(Boolean)))
    : [];
  const assignedSections = Array.isArray(input.assignedSections)
    ? Array.from(new Set(input.assignedSections.map(s => String(s || '').trim()).filter(Boolean)))
    : [];
  const linkedEmployeeId = input.linkedEmployeeId ? String(input.linkedEmployeeId).trim() : undefined;

  if (role === 'Department Head' && assignedDepartments.length === 0) {
    throw new Error('Department Head must have at least one assigned Department');
  }
  if (role === 'Supervisor' && assignedDepartments.length === 0 && assignedSections.length === 0) {
    throw new Error('Supervisor must have at least one assigned Department or Section');
  }
  if (role === 'Section Incharge' && assignedSections.length === 0) {
    throw new Error('Section Incharge must have at least one assigned Section');
  }
  if (role === 'Employee' && !linkedEmployeeId) {
    throw new Error('Employee user must be linked to an Employee ID from the directory');
  }

  const existingRows = await readRawUsersFromDb();
  const targetId = explicitId || input.id || '';
  const existingById = targetId ? existingRows.find(r => r.id === targetId) : undefined;
  const existingByEmail = existingRows.find(r => String(r.email || '').trim().toLowerCase() === email);
  const existingRecord = existingById || (explicitId ? undefined : existingByEmail);

  if (!explicitId && !existingById && existingByEmail && input.password && !input.id) {
    // Allow intentional update or reject duplicate creation if another id wasn't passed
    // Wait: bootstrap admin sync from App.tsx calls /api/admin/create-user without password.
    // When Super Admin explicitly creates a new user with a password and email already exists, enforce clear duplicate message unless updating.
    if (existingByEmail.passwordHash || existingByEmail.permissions) {
      throw new Error(`A user account with email "${email}" already exists. Edit the existing user instead.`);
    }
  }

  if (explicitId && existingByEmail && existingByEmail.id !== explicitId) {
    throw new Error(`Another user already uses "${email}".`);
  }

  const now = new Date().toISOString();
  const userId = explicitId || existingRecord?.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  let passwordHash = existingRecord?.passwordHash;
  if (input.password && String(input.password).trim().length > 0) {
    if (String(input.password).trim().length < 4) {
      throw new Error('Password must be at least 4 characters long');
    }
    passwordHash = hashPassword(String(input.password).trim());
  } else if (!existingRecord && !isBootstrapSuperAdminEmail(email)) {
    throw new Error('Password is required when creating a new user account');
  }

  const normalized = normalizeSystemUser({
    id: userId,
    username,
    email,
    role: isBootstrapSuperAdminEmail(email) ? 'Super Admin' : role,
    status: isBootstrapSuperAdminEmail(email) ? 'Active' : status,
    assignedDepartments: role === 'Super Admin' ? [] : assignedDepartments,
    assignedSections: role === 'Super Admin' ? [] : assignedSections,
    linkedEmployeeId: role === 'Employee' ? linkedEmployeeId : undefined,
    permissions: input.permissions,
    notes: input.notes ?? existingRecord?.notes ?? '',
    createdBy: input.createdBy || existingRecord?.createdBy || 'Super Admin',
    createdAt: existingRecord?.createdAt || now,
    updatedAt: now
  });

  const storedPayload = {
    ...normalized,
    ...(passwordHash ? { passwordHash } : {})
  };

  await withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    // Remove older duplicate rows with same email if consolidating legacy records
    const delDup = db.prepare('DELETE FROM users WHERE LOWER(email) = LOWER(?) AND id != ?');
    delDup.run([normalized.email, normalized.id]);
    delDup.free();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, role, data, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email=excluded.email,
        role=excluded.role,
        data=excluded.data
    `);
    stmt.run([
      normalized.id,
      normalized.email,
      normalized.role,
      JSON.stringify(storedPayload),
      typeof normalized.createdAt === 'string' ? normalized.createdAt : now
    ]);
    stmt.free();

    db.run('COMMIT');
    saveSqliteDb();
  });

  return { user: normalized, created: !existingRecord };
}

export async function deleteSystemUser(id: string, requesterEmail?: string): Promise<void> {
  const users = await listSystemUsers();
  const target = users.find(u => u.id === id);
  if (!target) {
    throw new Error('User not found');
  }
  if (isBootstrapSuperAdminEmail(target.email)) {
    throw new Error('Primary system Super Admin account cannot be deleted');
  }
  if (requesterEmail && target.email.toLowerCase() === requesterEmail.toLowerCase()) {
    throw new Error('You cannot delete your own active account');
  }
  if (target.role === 'Super Admin') {
    const otherActiveAdmins = users.filter(
      u => u.id !== id && u.role === 'Super Admin' && u.status === 'Active'
    );
    if (otherActiveAdmins.length === 0) {
      throw new Error('Cannot delete the last active Super Admin');
    }
  }

  await withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('DELETE FROM users WHERE id = ? OR LOWER(email) = LOWER(?)');
    stmt.run([target.id, target.email]);
    stmt.free();
    db.run('COMMIT');
    saveSqliteDb();
  });
}

export async function getSystemScopeOptions() {
  const db = await getSqliteDb();
  const empRes = db.exec('SELECT id, name, department, designation, status, data FROM employees');

  const deptMap = new Map<string, { name: string; totalCount: number; activeCount: number }>();
  const secMap = new Map<string, { name: string; departments: Set<string>; totalCount: number; activeCount: number }>();
  const employeesList: Array<{
    id: string;
    name: string;
    department: string;
    section: string;
    designation: string;
    email: string;
    status: string;
  }> = [];

  if (empRes.length > 0) {
    for (const row of empRes[0].values) {
      const id = String(row[0] || '').trim();
      if (!id) continue;
      let name = String(row[1] || 'Unnamed').trim();
      let department = String(row[2] || '').trim();
      let designation = String(row[3] || '').trim();
      let status = String(row[4] || 'Active').trim();
      let section = '';
      let email = '';

      if (row[5]) {
        try {
          const parsed = JSON.parse(String(row[5]));
          if (parsed.name) name = String(parsed.name).trim();
          if (parsed.department) department = String(parsed.department).trim();
          if (parsed.designation) designation = String(parsed.designation).trim();
          if (parsed.status) status = String(parsed.status).trim();
          if (parsed.section) section = String(parsed.section).trim();
          if (parsed.email) email = String(parsed.email).trim();
        } catch {}
      }

      const isActive = !status || status.toLowerCase() === 'active';

      if (department) {
        const cur = deptMap.get(department) || { name: department, totalCount: 0, activeCount: 0 };
        cur.totalCount += 1;
        if (isActive) cur.activeCount += 1;
        deptMap.set(department, cur);
      }

      if (section) {
        const cur = secMap.get(section) || { name: section, departments: new Set<string>(), totalCount: 0, activeCount: 0 };
        if (department) cur.departments.add(department);
        cur.totalCount += 1;
        if (isActive) cur.activeCount += 1;
        secMap.set(section, cur);
      }

      employeesList.push({
        id,
        name,
        department,
        section,
        designation,
        email,
        status: isActive ? 'Active' : 'Inactive'
      });
    }
  }

  return {
    departments: Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    sections: Array.from(secMap.values())
      .map(s => ({
        name: s.name,
        departments: Array.from(s.departments).sort(),
        totalCount: s.totalCount,
        activeCount: s.activeCount
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    employees: employeesList.sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function countMatchingEmployeesForUser(user: SystemUser): Promise<number> {
  const { employees } = await getSystemScopeOptions();
  return employees.filter(e => e.status === 'Active' && isEmployeeInUserScope(e, user)).length;
}
