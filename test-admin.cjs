const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp({
  credential: applicationDefault(),
  projectId: config.projectId
});

const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

db.collection('test').limit(1).get()
  .then(() => console.log('Success!'))
  .catch(e => console.error('Error:', e));
