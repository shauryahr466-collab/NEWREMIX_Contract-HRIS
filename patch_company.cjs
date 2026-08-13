const fs = require('fs');
let code = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

const companyUI = `
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Company Type</label>
                    <select 
                      value={formData.companyType || 'SCIL'} 
                      onChange={e => setFormData({...formData, companyType: e.target.value as any})} 
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="SCIL">SCIL (Internal)</option>
                      <option value="ISTS">ISTS (Outsourced)</option>
                    </select>
                  </div>
`;

// Insert it somewhere near Employment Type
code = code.replace(/(<label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Employment Type<\/label>)/, companyUI + '\n                  $1');

fs.writeFileSync('src/pages/Employees.tsx', code);
