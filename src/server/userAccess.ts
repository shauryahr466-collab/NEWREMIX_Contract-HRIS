import crypto from 'crypto';
import { getSqliteDb, saveSqliteDb, withSqliteWriteLock } from './sqliteDb.js';
import { timingSafeSecretCompare } from './authSession.js';
import {
  getDefaultPermissionsForRole,
  isEmployeeInUserScope,
  normalizeRoleName,
  normalizeSystemUser
} from '../lib/accessControl.js';
import type { SystemRole, SystemUser } from '../types.js';

export const OWNER_ADMIN_EMAIL = 'hr.sandiprajak466@gmail.com';
export const SUPER_ADMIN_EMAILS = [OWNER_ADMIN_EMAIL];

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

export async function getOwnerBootstrapStatus(): Promise<{
  setupRequired: boolean;
  envOverrideActive: boolean;
  hasOwnerPassword: boolean;
  ownerHint: string;
}> {
  const envPass = process.env.ADMIN_PASSCODE?.trim() || '';
  const envOverrideActive = envPass.length > 0;
  const rows = await readRawUsersFromDb();
  const ownerRow = rows.find(
    r => String(r.email || '').trim().toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase() && Boolean(r.passwordHash)
  );
  const hasOwnerPassword = Boolean(ownerRow?.passwordHash);
  const [localPart, domainPart] = OWNER_ADMIN_EMAIL.split('@');
  const ownerHint = `${localPart.slice(0, 4)}***@${domainPart}`;

  return {
    setupRequired: !envOverrideActive && !hasOwnerPassword,
    envOverrideActive,
    hasOwnerPassword,
    ownerHint
  };
}

export async function claimOwnerAdminPassword(
  email: string,
  password: string
): Promise<{ success: true; user: SystemUser } | { success: false; error: string; statusCode: number }> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  if (!isBootstrapSuperAdminEmail(cleanEmail)) {
    return {
      success: false,
      error: 'Access Denied: Only the registered company owner account can complete first-time setup.',
      statusCode: 403
    };
  }

  const status = await getOwnerBootstrapStatus();
  if (!status.setupRequired) {
    return {
      success: false,
      error: 'Owner password is already configured. Sign in with your password.',
      statusCode: 403
    };
  }

  if (cleanPass.length < 6) {
    return {
      success: false,
      error: 'Owner password must be at least 6 characters long.',
      statusCode: 400
    };
  }

  const now = new Date().toISOString();
  const ownerId = `super_admin_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
  const passwordHash = hashPassword(cleanPass);

  const normalized = normalizeSystemUser({
    id: ownerId,
    username: cleanEmail.split('@')[0],
    email: cleanEmail,
    role: 'Super Admin',
    status: 'Active',
    assignedDepartments: [],
    assignedSections: [],
    permissions: getDefaultPermissionsForRole('Super Admin'),
    createdBy: 'Owner Bootstrap',
    createdAt: now,
    updatedAt: now
  });

  const storedPayload = {
    ...normalized,
    passwordHash
  };

  await withSqliteWriteLock(async () => {
    // Re-check inside lock to guarantee one-time atomic claim
    const db = await getSqliteDb();
    const check = db.exec('SELECT data FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    if (check.length > 0) {
      for (const row of check[0].values) {
        try {
          const parsed = JSON.parse(String(row[0] || '{}'));
          if (parsed?.passwordHash) {
            throw new Error('ALREADY_CLAIMED');
          }
        } catch (err: any) {
          if (err?.message === 'ALREADY_CLAIMED') throw err;
        }
      }
    }

    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

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
      now
    ]);
    stmt.free();

    db.run('COMMIT');
    saveSqliteDb();
  });

  return { success: true, user: normalized };
}

export async function listSystemUsers(): Promise<SystemUser[]> {
  const rows = await readRawUsersFromDb();
  const byEmail = new Map<string, any>();

  for (const r of rows) {
    const emailKey = String(r.email || r.id).trim().toLowerCase();
    const existing = byEmail.get(emailKey);
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
        createdBy: 'Owner',
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
    u =>
      u.email.toLowerCase() === target ||
      u.username.toLowerCase() === target ||
      u.id.toLowerCase() === target ||
      (u.linkedEmployeeId && u.linkedEmployeeId.toLowerCase() === target)
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
): Promise<{ success: true; user: SystemUser } | { success: false; error: string; statusCode: number; setupRequired?: boolean }> {
  const cleanId = String(identifier || '').trim().toLowerCase();
  const cleanPass = String(password || '');
  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Work Email / Login ID and Password are required', statusCode: 400 };
  }

  // 1. Owner Super Admin fast path (respects ADMIN_PASSCODE env var override first, else SQLite scrypt hash)
  if (isBootstrapSuperAdminEmail(cleanId)) {
    const envPass = process.env.ADMIN_PASSCODE?.trim() || '';
    if (envPass) {
      if (!timingSafeSecretCompare(cleanPass, envPass)) {
        return { success: false, error: 'Invalid credentials', statusCode: 401 };
      }
      const ownerProfile = await resolveSessionProfile(cleanId);
      if (ownerProfile) {
        return { success: true, user: ownerProfile };
      }
    }
  }

  const rows = await readRawUsersFromDb();
  const matchingRows = rows.filter(
    r =>
      String(r.email || '').trim().toLowerCase() === cleanId ||
      String(r.username || '').trim().toLowerCase() === cleanId ||
      (r.linkedEmployeeId && String(r.linkedEmployeeId).trim().toLowerCase() === cleanId)
  );

  const record = matchingRows.find(r => Boolean(r.passwordHash)) || matchingRows[0];

  if (!record) {
    if (isBootstrapSuperAdminEmail(cleanId)) {
      return {
        success: false,
        error: 'Complete First-Time Owner Setup to set your Super Admin password.',
        statusCode: 403,
        setupRequired: true
      };
    }
    return {
      success: false,
      error: 'Access Denied: Your account has not been provisioned by the Administrator.',
      statusCode: 403
    };
  }

  const normalized = sanitizeUser(record);
  if (normalized.status === 'Suspended' && !isBootstrapSuperAdminEmail(normalized.email)) {
    return {
      success: false,
      error: 'Access Denied: This account has been suspended by the Administrator.',
      statusCode: 403
    };
  }

  if (!record.passwordHash) {
    if (isBootstrapSuperAdminEmail(normalized.email)) {
      return {
        success: false,
        error: 'Complete First-Time Owner Setup to set your Super Admin password.',
        statusCode: 403,
        setupRequired: true
      };
    }
    return {
      success: false,
      error: 'Access Denied: No login credentials configured for this account. Contact Super Admin.',
      statusCode: 403
    };
  }

  if (!verifyPassword(cleanPass, record.passwordHash)) {
    return { success: false, error: 'Invalid password', statusCode: 401 };
  }

  if (isBootstrapSuperAdminEmail(normalized.email)) {
    return {
      success: true,
      user: {
        ...normalized,
        role: 'Super Admin',
        status: 'Active',
        permissions: getDefaultPermissionsForRole('Super Admin')
      }
    };
  }

  return { success: true, user: normalized };
}

export async function updateUserPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: true } | { success: false; error: string; statusCode: number }> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { success: false, error: 'Email is required', statusCode: 400 };
  if (String(newPassword || '').length < 6) {
    return { success: false, error: 'New password must be at least 6 characters long.', statusCode: 400 };
  }

  if (isBootstrapSuperAdminEmail(cleanEmail) && process.env.ADMIN_PASSCODE?.trim()) {
    return {
      success: false,
      error: 'Owner passcode is controlled by ADMIN_PASSCODE environment configuration.',
      statusCode: 400
    };
  }

  const rows = await readRawUsersFromDb();
  const record = rows.find(r => String(r.email || '').trim().toLowerCase() === cleanEmail && Boolean(r.passwordHash));

  if (record?.passwordHash) {
    if (!verifyPassword(currentPassword, record.passwordHash)) {
      return { success: false, error: 'Current password is incorrect.', statusCode: 401 };
    }
  } else if (!isBootstrapSuperAdminEmail(cleanEmail)) {
    return { success: false, error: 'Account not found.', statusCode: 404 };
  }

  const now = new Date().toISOString();
  const baseProfile = await resolveSessionProfile(cleanEmail);
  if (!baseProfile) {
    return { success: false, error: 'Account not found.', statusCode: 404 };
  }

  const payload = {
    ...baseProfile,
    updatedAt: now,
    passwordHash: hashPassword(newPassword)
  };

  await withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    const delDup = db.prepare('DELETE FROM users WHERE LOWER(email) = LOWER(?) AND id != ?');
    delDup.run([baseProfile.email, baseProfile.id]);
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
      baseProfile.id,
      baseProfile.email,
      baseProfile.role,
      JSON.stringify(payload),
      typeof baseProfile.createdAt === 'string' ? baseProfile.createdAt : now
    ]);
    stmt.free();

    db.run('COMMIT');
    saveSqliteDb();
  });

  return { success: true };
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
    throw new Error('Primary system Owner account cannot be deleted');
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
