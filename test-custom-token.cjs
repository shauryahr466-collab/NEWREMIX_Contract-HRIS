const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const config = require('./firebase-applet-config.json');
const app = initializeApp({
  credential: applicationDefault(),
  projectId: config.projectId
});
getAuth(app).createCustomToken('server-admin-uid')
  .then(token => console.log('Token:', token))
  .catch(e => console.error('Error:', e));
