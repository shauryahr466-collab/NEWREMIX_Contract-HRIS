const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

initializeApp({
  projectId: firebaseConfig.projectId
});

const db = getFirestore(firebaseConfig.firestoreDatabaseId || '(default)');

async function inspect() {
  const empSnap = await db.collection('employees').get();
  console.log('Employees count:', empSnap.size);
  empSnap.docs.slice(0, 10).forEach(d => console.log('Emp:', d.id, '->', d.data().name));

  const punchSnap = await db.collection('punches').get();
  console.log('Punches count:', punchSnap.size);
  
  const sortedPunches = punchSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.punchDatetime).localeCompare(String(a.punchDatetime)));
  
  console.log('Latest 10 punches in DB:');
  sortedPunches.slice(0, 10).forEach(p => console.log('  Punch:', p.id, '| EmpId:', p.employeeId, '| Datetime:', p.punchDatetime));

  const unmappedSnap = await db.collection('zkUnmappedPunches').get();
  console.log('Unmapped punches count:', unmappedSnap.size);
  unmappedSnap.docs.slice(0, 10).forEach(d => console.log('  Unmapped:', d.id, '| DevUserId:', d.data().deviceUserId, '| Datetime:', d.data().punchDateTime));

  const mappingSnap = await db.collection('zkUserMappings').get();
  console.log('User mappings count:', mappingSnap.size);
  mappingSnap.docs.forEach(d => console.log('  Mapping:', d.id, '->', d.data()));
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
