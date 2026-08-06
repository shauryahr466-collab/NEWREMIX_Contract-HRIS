const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf-8');

const newRule = `    match /zkRawEvents/{eventId} {
      allow read, write: if isAdmin();
      allow create: if request.resource.data.secret == "ZKBio_Secret_2026";
    }
  }
}
`;

code = code.replace(/  \}\n\}$/, newRule);
fs.writeFileSync('firestore.rules', code);
