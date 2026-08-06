const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const config = require('./firebase-applet-config.json');
const app = initializeApp(config);
const auth = getAuth(app);
signInAnonymously(auth).then(user => console.log('Anon Success!', user.user.uid)).catch(e => console.error('Anon Error:', e));
