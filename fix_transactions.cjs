const fs = require('fs');
let code = fs.readFileSync('src/server/localApi.ts', 'utf-8');

// The issue is that the SQLite instance is shared. If an error is thrown during a transaction,
// the transaction is never rolled back, leading to "cannot start a transaction within a transaction"
// for all subsequent endpoints that try to start a transaction.
// We can wrap all "try { const db = await getSqliteDb(); db.run('BEGIN TRANSACTION'); ... } catch(e) { ... }"
// to rollback on error.

// Actually, the simplest fix is to rollback before BEGIN TRANSACTION if one is active, or use a savepoint,
// or just catch the error and execute a rollback.

// Since there is no "inTransaction" property exposed by sql.js easily, we can just do:
code = code.replace(/try {\n\s*const db = await getSqliteDb\(\);\n\s*db\.run\('BEGIN TRANSACTION'\);/g, 
  `try {\n    const db = await getSqliteDb();\n    try { db.run('ROLLBACK'); } catch (e) {}\n    db.run('BEGIN TRANSACTION');`);
  
code = code.replace(/try {\n\s*const db = await getSqliteDb\(\);\n\s*const now = new Date\(\)\.toISOString\(\);\n\n\s*db\.run\('BEGIN TRANSACTION'\);/g,
  `try {\n    const db = await getSqliteDb();\n    const now = new Date().toISOString();\n    try { db.run('ROLLBACK'); } catch(e) {}\n    db.run('BEGIN TRANSACTION');`);
  
code = code.replace(/try {\n\s*const db = await getSqliteDb\(\);\n\s*const now = new Date\(\)\.toISOString\(\);\n\s*let importedCount = 0;\n\n\s*db\.run\('BEGIN TRANSACTION'\);/g,
  `try {\n    const db = await getSqliteDb();\n    const now = new Date().toISOString();\n    let importedCount = 0;\n    try { db.run('ROLLBACK'); } catch(e) {}\n    db.run('BEGIN TRANSACTION');`);

// For the persistence test:
code = code.replace(/try {\n\s*db\.run\('BEGIN TRANSACTION;'\);/g,
  `try {\n      try { db.run('ROLLBACK'); } catch(e) {}\n      db.run('BEGIN TRANSACTION;');`);
  
fs.writeFileSync('src/server/localApi.ts', code);
