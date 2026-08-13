import React, { useState } from 'react';
import { X, Plus, Trash2, Check, Settings2 } from 'lucide-react';
import { SalaryBand } from '../../types/salaryAnalysis';

interface SalaryBandModalProps {
  isOpen: boolean;
  onClose: () => void;
  bands: SalaryBand[];
  onSave: (newBands: SalaryBand[]) => void;
}

export function SalaryBandModal({ isOpen, onClose, bands, onSave }: SalaryBandModalProps) {
  const [currentBands, setCurrentBands] = useState<SalaryBand[]>(bands);

  if (!isOpen) return null;

  const handleAddBand = () => {
    const newId = `b_${Date.now()}`;
    setCurrentBands([
      ...currentBands,
      { id: newId, label: 'Custom Band', min: 0, max: 50000 }
    ]);
  };

  const handleRemoveBand = (id: string) => {
    setCurrentBands(currentBands.filter(b => b.id !== id));
  };

  const handleUpdate = (id: string, field: keyof SalaryBand, value: any) => {
    setCurrentBands(currentBands.map(b => {
      if (b.id !== id) return b;
      return { ...b, [field]: value };
    }));
  };

  const handleSave = () => {
    onSave(currentBands);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Configure Custom Salary Bands</h3>
              <p className="text-xs text-slate-500">Define min and max thresholds for dynamic salary distribution analytics</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {currentBands.map((band, idx) => (
            <div key={band.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-400 w-6">#{idx + 1}</span>
              <input
                type="text"
                placeholder="Band Label"
                value={band.label}
                onChange={e => handleUpdate(band.id, 'label', e.target.value)}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={band.min}
                  onChange={e => handleUpdate(band.id, 'min', Number(e.target.value))}
                  className="w-24 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-right"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={band.max === Infinity ? '' : band.max}
                  onChange={e => handleUpdate(band.id, 'max', e.target.value === '' ? Infinity : Number(e.target.value))}
                  className="w-24 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-right"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveBand(band.id)}
                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                title="Delete Band"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleAddBand}
            className="px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl transition-all flex items-center gap-1.5"
          >
            <Plus size={16} />
            Add New Band
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Check size={16} />
              Apply Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
