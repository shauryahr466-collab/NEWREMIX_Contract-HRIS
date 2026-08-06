import React from 'react';
import { X, User, Building2, Clock, Search, MapPin, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee } from '../types';
import { cn } from '../lib/utils';

interface EmployeeListPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  employees: Employee[];
  status?: string;
  onEmployeeClick: (id: string) => void;
}

export function EmployeeListPopup({ isOpen, onClose, title, employees, status, onEmployeeClick }: EmployeeListPopupProps) {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filtered = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.designation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  <User className="text-indigo-600" size={24} />
                  {title}
                  <span className="text-xs font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full uppercase tracking-widest">
                    {employees.length} Records
                  </span>
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  Comprehensive list of {status ? `${status} employees` : 'manpower'}
                </p>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-white hover:shadow-lg rounded-2xl transition-all text-slate-400 hover:text-rose-500 group"
              >
                <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-8 py-4 bg-white border-b border-slate-50">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by name, ID, department or designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <Search size={64} className="opacity-10 mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest">No matching employees found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filtered.map((emp) => (
                    <motion.div
                      key={emp.id}
                      layout
                      onClick={() => onEmployeeClick(emp.id)}
                      className="p-5 bg-white border border-slate-100 rounded-[1.5rem] hover:shadow-xl hover:shadow-slate-200/50 hover:border-indigo-100 transition-all cursor-pointer group flex items-center gap-4"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shadow-sm border border-slate-100">
                        <User size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-900 truncate uppercase group-hover:text-indigo-600 transition-colors">
                            {emp.name}
                          </p>
                          <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                            {emp.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <Building2 size={10} />
                            {emp.department || 'N/A'}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <Clock size={10} />
                            {emp.designation || 'N/A'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {emp.accommodation && (
                            <div className="flex items-center gap-1">
                              <MapPin size={10} />
                              {emp.accommodation}
                            </div>
                          )}
                          {emp.phone || emp.contactNumber ? (
                            <div className="flex items-center gap-1">
                              <Phone size={10} />
                              {emp.phone || emp.contactNumber}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Enterprise Resource Planning • Global Identity Management
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
