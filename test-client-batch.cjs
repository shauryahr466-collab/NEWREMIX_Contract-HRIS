const { initializeApp } = require('firebase/app');
const { getFirestore, writeBatch, doc } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const batch = writeBatch(db);
batch.set(doc(db, 'test-server', '1'), { test: true });
batch.commit().then(() => console.log('Batch Success!')).catch(e => console.error('Batch Error:', e));
