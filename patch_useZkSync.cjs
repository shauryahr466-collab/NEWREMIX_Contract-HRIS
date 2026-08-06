const fs = require('fs');
let code = fs.readFileSync('src/hooks/useZkSync.ts', 'utf-8');

code = code.replace(
  `import { useStore } from '../store';`,
  `import { useAppStore } from '../store';`
);

code = code.replace(
  `  const { user, profile } = useStore();
  const isAdmin = user && profile && (profile.role === 'Admin' || profile.role === 'SuperAdmin' || profile.role === 'Editor');`,
  `  const { isAdmin } = useAppStore();`
);

fs.writeFileSync('src/hooks/useZkSync.ts', code);
