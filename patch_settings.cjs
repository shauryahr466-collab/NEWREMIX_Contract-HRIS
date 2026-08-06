const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

code = code.replace(
  `<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                           <div className="md:col-span-1">`,
  `<div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                           <div className="md:col-span-3">`
);

code = code.replace(
  `<div className="md:col-span-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Start - End</label>`,
  `<div className="md:col-span-4">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Start - End</label>`
);

code = code.replace(
  `<div className="md:col-span-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Grace / Late (Min)</label>`,
  `<div className="md:col-span-3">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Grace / Late (Min)</label>`
);

code = code.replace(
  `<div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                              <label className="flex items-center gap-2 cursor-pointer group/label">`,
  `<div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                              <label className="flex items-center gap-2 cursor-pointer group/label">`
);

fs.writeFileSync('src/pages/Settings.tsx', code);
