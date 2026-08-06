const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function inspect() {
  const empSnap = await getDocs(collection(db, 'employees'));
  console.log('Employees count:', empSnap.size);
  empSnap.docs.slice(0, 10).forEach(d => console.log('Emp:', d.id, d.data().name));

  const punchSnap = await getDocs(collection(db, 'punches'));
  console.log('Punches count:', punchSnap.size);
  punchSnap.docs.slice(0, 10).forEach(d => console.log('Punch:', d.id, d.data().employeeId, d.data().punchDatetime));

  const unmappedSnap = await getDocs(collection(db, 'zkUnmappedPunches'));
  console.log('Unmapped punches count:', unmappedSnap.size);
  unmappedSnap.docs.slice(0, 10).forEach(d => console.log('Unmapped:', d.id, d.data().deviceUserId, d.data().punchDateTime));

  const mappingSnap = await getDocs(collection(db, 'zkUserMappings'));
  console.log('User mappings count:', mappingSnap.size);
  mappingSnap.docs.forEach(d => console.log('Mapping:', d.id, d.data()));
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
