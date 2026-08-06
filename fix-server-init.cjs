const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const regex = /\/\/ Initialize Firebase Admin[\s\S]*?const authAdmin = getAuth\(appAdmin\);/;
code = code.replace(regex, `// Initialize Firebase Client SDK for Server (Event pushing only)
const appConfig = initializeApp(firebaseConfig);
const db = getFirestore(appConfig, firebaseConfig.firestoreDatabaseId);
const SECRET = "ZKBio_Secret_2026";`);

fs.writeFileSync('server.ts', code);
