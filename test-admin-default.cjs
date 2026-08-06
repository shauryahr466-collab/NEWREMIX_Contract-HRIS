const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp({
  credential: applicationDefault(),
  projectId: config.projectId
});

const db = getFirestore(app);

db.collection('users').limit(1).get()
  .then(() => console.log('Admin SDK Default DB Success!'))
  .catch(e => console.error('Admin SDK Default DB Error:', e));
