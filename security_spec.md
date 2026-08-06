# Security Specification for Attendance Management System

## 1. Data Invariants
- Only Admins and HR can modify employee data and global settings.
- Supervisors can assign shifts and view records for their department (simplified to all for now or role-based).
- Users can only see data if authenticated.
- Document IDs must follow the `isValidId` regex.

## 2. Invariants
- `employees`: ID must be unique (enforced by doc ID).
- `punches`: Must reference an existing employee ID.
- `settings`: Only one active global config (usually doc ID 'config').

## 3. Dirty Dozen Payloads

### P1: Unauthorized Settings Modification
- **Target**: `settings/config`
- **Actor**: Non-authenticated user
- **Action**: `set`
- **Expectation**: `PERMISSION_DENIED`

### P2: Role Escalation
- **Target**: `users/attacker_uid`
- **Payload**: `{ "role": "Admin" }`
- **Expectation**: `PERMISSION_DENIED` (unless actor is existing Admin)

### P3: Resource Poisoning (Giant ID)
- **Target**: `punches/very_long_id_exceeding_128_chars_...`
- **Expectation**: `PERMISSION_DENIED` (isValidId failure)

### P4: Identity Spoofing in Punches
- **Target**: `punches/p1`
- **Actor**: User A
- **Payload**: `{ "employeeId": "USER_B_ID" }`
- **Expectation**: Verified against valid employee ID list or Admin/HR only.

### P5: Invalid Enum for Employee Status
- **Target**: `employees/e1`
- **Payload**: `{ "status": "Deceased" }`
- **Expectation**: `PERMISSION_DENIED` (only Active/Inactive allowed)

### P6: Negative Working Hours
- **Target**: `attendance/a1`
- **Payload**: `{ "workingHours": -5 }`
- **Expectation**: `PERMISSION_DENIED`

### P7: State Shortcutting (Assignment Log)
- **Target**: `assignmentLogs/l1`
- **Payload**: Missing required `timestamp`
- **Expectation**: `PERMISSION_DENIED`

### P8: PII Leak (Reading User Emails)
- **Target**: `users/any_uid`
- **Actor**: Editor role
- **Expectation**: `PERMISSION_DENIED` (Only Admin/HR or self can read full user doc if PII present)

### P9: Shadow Field Injection
- **Target**: `employees/e1`
- **Payload**: `{ "name": "Test", "extraField": "malicious" }`
- **Expectation**: `PERMISSION_DENIED` (Strict schema Size check)

### P10: Unauthorized Data Purge
- **Target**: `employees` collection (batch delete)
- **Actor**: Editor
- **Expectation**: `PERMISSION_DENIED`

### P11: Orphaned Audit Log
- **Target**: `assignmentLogs/l1`
- **Payload**: Reference to non-existent `shiftId`
- **Expectation**: `PERMISSION_DENIED` (exists check on shifts)

### P12: Backdated Processed Record
- **Target**: `attendance/a1`
- **Payload**: `updatedAt` set to 1970
- **Expectation**: `PERMISSION_DENIED` (request.time check)

## 4. Test Runner (Draft)
A comprehensive `firestore.rules.test.ts` will be created to verify these.
