const { initializeApp } = require('firebase/app');
const { getFirestore, collection, limit, getDocs, query } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

getDocs(query(collection(db, 'users'), limit(1)))
  .then(() => console.log('Client SDK Success!'))
  .catch(e => console.error('Client SDK Error:', e));
