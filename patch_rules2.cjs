const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf-8');

// Find the last closing brace and insert the new rule before it
const insertionIndex = code.lastIndexOf('}');
if (insertionIndex !== -1) {
  const codeBefore = code.substring(0, insertionIndex);
  const codeAfter = code.substring(insertionIndex);
  
  const newRule = `  match /zkRawEvents/{eventId} {
      allow read, write: if isAdmin();
      allow create: if request.resource.data.secret == "ZKBio_Secret_2026";
    }\n`;
    
  // find the second to last closing brace
  const insertionIndex2 = codeBefore.lastIndexOf('}');
  const codeBefore2 = codeBefore.substring(0, insertionIndex2);
  const codeAfter2 = codeBefore.substring(insertionIndex2);
  
  fs.writeFileSync('firestore.rules', codeBefore2 + newRule + codeAfter2 + codeAfter);
}
