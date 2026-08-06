import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  label?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select options', label }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (option === 'All') {
      onChange(['All']);
      return;
    }

    let nextSelected = selected.filter(s => s !== 'All');
    if (nextSelected.includes(option)) {
      nextSelected = nextSelected.filter(s => s !== option);
    } else {
      nextSelected = [...nextSelected, option];
    }

    if (nextSelected.length === 0) {
      onChange(['All']);
    } else {
      onChange(nextSelected);
    }
  };

  const isSelected = (option: string) => selected.includes(option);

  const displayValue = () => {
    if (selected.includes('All')) return placeholder;
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    return `${selected.length} selected`;
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 h-9 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-[13px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
      >
        <span className="truncate">{displayValue()}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-1">
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => toggleOption(option)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
              >
                <span className="truncate">{option === 'All' ? `All ${label || ''}` : option}</span>
                {isSelected(option) && <Check className="w-4 h-4 text-indigo-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
