const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(
  `<h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="text-amber-500" size={18} />
                  Nepal IRD Progressive Tax (TDS) Slabs - FY 83/84
                </h3>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-bold">
                  <button
                    onClick={() => setTaxSlabStatus('Single')}
                    className={\`px-3 py-1 rounded-md transition-all \${taxSlabStatus === 'Single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}\`}
                  >
                    Single / Unmarried
                  </button>
                  <button
                    onClick={() => setTaxSlabStatus('Married')}
                    className={\`px-3 py-1 rounded-md transition-all \${taxSlabStatus === 'Married' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}\`}
                  >
                    Married Couple
                  </button>
                </div>`,
  `<h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="text-amber-500" size={18} />
                  Nepal IRD Individual Income Tax Slabs - FY 83/84
                </h3>`
);

code = code.replace(
  `const limit = taxSlabStatus === 'Married' ? slab.limitMarried : slab.limitSingle;`,
  `const limit = slab.limitSingle;`
);

code = code.replace(
  `{limit >= 10000000 ? '5,000,000+' : limit.toLocaleString()}`,
  `{limit >= 10000000 ? '4,000,000+' : limit.toLocaleString()}`
);

fs.writeFileSync('src/pages/Payroll.tsx', code);
