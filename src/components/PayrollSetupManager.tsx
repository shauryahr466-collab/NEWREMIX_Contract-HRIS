import React, { useState, useMemo } from 'react';
import { 
  Sliders, ShieldCheck, CreditCard, Table, CheckCircle2, AlertTriangle, 
  RotateCcw, Save, Plus, Trash2, Play, Activity, Check, Info, FileText, 
  HelpCircle, ChevronDown, ChevronRight, Layers, DollarSign, Calculator, Eye
} from 'lucide-react';
import { Card, Button, Input, Badge, NepaliRupeeIcon } from './ui';
import type { 
  PayrollConfig, 
  TaxSlabConfig, 
  TaxRuleItem, 
  DeductionRuleItem, 
  SalaryComponentConfig, 
  PayrollConfigAuditLog 
} from '../types';
import { 
  DEFAULT_PAYROLL_CONFIG, 
  DEFAULT_TAX_SLABS_FY2083, 
  DEFAULT_DEDUCTION_RULES, 
  DEFAULT_SALARY_COMPONENTS, 
  runTaxCheckpointsTest, 
  validateTaxSlabs, 
  calculateTaxAndDeductions,
  TaxTestResult 
} from '../lib/payrollEngine';
import { toast } from 'sonner';

interface PayrollSetupManagerProps {
  config: PayrollConfig;
  onSave: (updatedConfig: PayrollConfig) => Promise<void>;
  onReset: () => Promise<void>;
}

export function PayrollSetupManager({ config, onSave, onReset }: PayrollSetupManagerProps) {
  const [setupConfig, setSetupConfig] = useState<PayrollConfig>(() => ({
    ...DEFAULT_PAYROLL_CONFIG,
    ...config,
    singleSlabs: config?.singleSlabs?.length ? config.singleSlabs : DEFAULT_TAX_SLABS_FY2083
  }));

  const [activeSubTab, setActiveSubTab] = useState<'slabs' | 'tests' | 'ssf' | 'deductions' | 'components' | 'simulator' | 'audit'>('slabs');
  
  // Test suite state
  const [testResults, setTestResults] = useState<TaxTestResult[] | null>(() => runTaxCheckpointsTest(setupConfig));
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Simulation scratchpad state
  const [simBasic, setSimBasic] = useState<number>(80000);
  const [simAllowances, setSimAllowances] = useState<number>(45000);
  const [simSsfEnrolled, setSimSsfEnrolled] = useState<boolean>(true);
  const [simMaritalStatus, setSimMaritalStatus] = useState<'Single' | 'Married'>('Single');
  const [simLifeIns, setSimLifeIns] = useState<number>(30000);
  const [simHealthIns, setSimHealthIns] = useState<number>(15000);

  // Validation
  const validation = useMemo(() => validateTaxSlabs(setupConfig.singleSlabs), [setupConfig.singleSlabs]);

  // Simulation calculation
  const simulationResult = useMemo(() => {
    const grossMonthly = simBasic + simAllowances;
    return calculateTaxAndDeductions(
      grossMonthly,
      simBasic,
      simMaritalStatus,
      simSsfEnrolled,
      setupConfig,
      {
        lifeInsurancePremium: simLifeIns,
        healthInsurancePremium: simHealthIns,
        retirementFundContributor: simSsfEnrolled
      }
    );
  }, [simBasic, simAllowances, simMaritalStatus, simSsfEnrolled, simLifeIns, simHealthIns, setupConfig]);

  const handleRunTests = () => {
    setIsRunningTests(true);
    setTimeout(() => {
      const results = runTaxCheckpointsTest(setupConfig);
      setTestResults(results);
      setIsRunningTests(false);
      const passedCount = results.filter(r => r.passed).length;
      if (passedCount === results.length) {
        toast.success(`All ${results.length} IRD statutory tax checkpoints passed successfully!`);
      } else {
        toast.error(`${results.length - passedCount} tax checkpoint(s) failed. Check your slab limits or rates.`);
      }
    }, 250);
  };

  const handleSave = async () => {
    if (!validation.valid) {
      toast.error(`Cannot save invalid configuration: ${validation.errors[0]}`);
      return;
    }

    const auditEntry: PayrollConfigAuditLog = {
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'HR / Payroll Administrator',
      fiscalYear: setupConfig.fiscalYear,
      ruleVersion: setupConfig.ruleVersion || '1.0',
      changesSummary: `Updated payroll & tax parameters. Active Slabs: ${setupConfig.singleSlabs.length}, SSF Employee: ${(setupConfig.ssfEmployeeRate * 100).toFixed(1)}%, SSF Employer: ${(setupConfig.ssfEmployerRate * 100).toFixed(1)}%`,
      reason: 'Admin configuration update'
    };

    const updatedConfig: PayrollConfig = {
      ...setupConfig,
      lastUpdated: new Date().toISOString(),
      auditLogs: [auditEntry, ...(setupConfig.auditLogs || [])]
    };

    await onSave(updatedConfig);
  };

  const passPercentage = testResults ? Math.round((testResults.filter(r => r.passed).length / testResults.length) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Top Header & Master Action Bar */}
      <Card className="p-6 space-y-6 border-l-4 border-l-indigo-600 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Sliders size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Nepal Payroll Rules & IRD Tax Configuration
              </h2>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 font-mono text-[11px]">
                {setupConfig.fiscalYear || 'FY 2083/84'} Active
              </Badge>
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 text-[11px]">
                Rule v{setupConfig.ruleVersion || '1.0'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Statutory configuration engine enforcing Inland Revenue Department (IRD) Finance Act tax brackets, 1% Social Security Tax exemption rules, Social Security Fund (SSF 31%) contributions, and deduction caps.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button 
              variant="outline" 
              onClick={handleRunTests}
              className="gap-2 text-xs border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
              disabled={isRunningTests}
            >
              <Play size={13} className={isRunningTests ? 'animate-spin' : ''} />
              {isRunningTests ? 'Testing...' : 'Run IRD Test Suite'}
            </Button>
            <Button 
              variant="outline" 
              onClick={onReset}
              className="gap-1.5 text-xs text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700"
            >
              <RotateCcw size={13} />
              Reset Defaults
            </Button>
            <Button 
              onClick={handleSave}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 px-5"
            >
              <Save size={15} />
              Save Rules & Apply
            </Button>
          </div>
        </div>

        {/* Validation Error Alert if any */}
        {!validation.valid && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
            <div className="space-y-1 text-xs text-rose-800 dark:text-rose-300">
              <span className="font-bold">Configuration Validation Error:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
          {[
            { id: 'slabs', label: '1. IRD Tax Slabs (Progressive)', icon: Table, count: setupConfig.singleSlabs.length },
            { id: 'tests', label: '2. Checkpoint Test Suite', icon: Activity, badge: `${passPercentage}% Pass` },
            { id: 'ssf', label: '3. SSF & 1% SST Waiver', icon: ShieldCheck },
            { id: 'deductions', label: '4. Statutory Deductions Caps', icon: CreditCard },
            { id: 'components', label: '5. Salary Components', icon: Layers },
            { id: 'simulator', label: '6. Live Tax Simulator', icon: Calculator },
            { id: 'audit', label: '7. Version & Audit Trail', icon: FileText }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 py-2.5 px-3.5 border-b-2 font-semibold text-xs whitespace-nowrap transition-all ${
                  isActive 
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-t-lg' 
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded-full text-[10px] font-mono">
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    passPercentage === 100 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* SUBTAB 1: IRD TAX SLABS EDITOR */}
        {activeSubTab === 'slabs' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Global Parameters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Fiscal Year Label</label>
                <Input 
                  value={setupConfig.fiscalYear}
                  onChange={(e) => setSetupConfig({ ...setupConfig, fiscalYear: e.target.value })}
                  placeholder="e.g. FY 2083/84"
                  className="text-xs h-8"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Official IRD tax year descriptor</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Effective BS Year</label>
                <Input 
                  type="number"
                  value={setupConfig.effectiveBsYear}
                  onChange={(e) => setSetupConfig({ ...setupConfig, effectiveBsYear: parseInt(e.target.value, 10) || 2083 })}
                  placeholder="2083"
                  className="text-xs h-8 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Bikram Sambat tax anchor year</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Standard Days / Month</label>
                <Input 
                  type="number"
                  value={setupConfig.standardDaysInMonth}
                  onChange={(e) => setSetupConfig({ ...setupConfig, standardDaysInMonth: parseInt(e.target.value, 10) || 31 })}
                  className="text-xs h-8 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Shrawan standard: 31 days</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Overtime Multiplier Rate</label>
                <Input 
                  type="number"
                  step="0.1"
                  value={setupConfig.overtimeMultiplier}
                  onChange={(e) => setSetupConfig({ ...setupConfig, overtimeMultiplier: parseFloat(e.target.value) || 1.5 })}
                  className="text-xs h-8 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Hourly OT multiplier (1.5x standard)</span>
              </div>
            </div>

            {/* Tax Slabs Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Table size={15} className="text-indigo-500" />
                    Unified Resident Individual Progressive Tax Slabs
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Progressive slices computed sequentially. Single and Married taxpayers follow unified brackets under the FY 2083/84 Finance Act.
                  </p>
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    const newSlab: TaxSlabConfig = {
                      id: `slab_${Date.now()}`,
                      label: `Custom Slab ${setupConfig.singleSlabs.length + 1}`,
                      limitSingle: 10000000,
                      limitMarried: 10000000,
                      rate: 0.35,
                      taxType: 'Income Tax',
                      description: 'Custom progressive bracket'
                    };
                    setSetupConfig({
                      ...setupConfig,
                      singleSlabs: [...setupConfig.singleSlabs, newSlab]
                    });
                  }}
                  className="gap-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-900 dark:hover:bg-indigo-950"
                >
                  <Plus size={14} />
                  Add Bracket Slab
                </Button>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Order</th>
                      <th className="py-2.5 px-3">Slab Label & Descriptor</th>
                      <th className="py-2.5 px-3">Tax Type</th>
                      <th className="py-2.5 px-3">Upper Limit (NPR)</th>
                      <th className="py-2.5 px-3">Tax Rate (%)</th>
                      <th className="py-2.5 px-3">Cumulative Checkpoint</th>
                      <th className="py-2.5 px-3 text-center w-16">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {setupConfig.singleSlabs.map((slab, index) => {
                      const isFirst = index === 0;
                      return (
                        <tr key={slab.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold text-slate-500 text-[11px]">
                            #{index + 1}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white min-w-[200px]">
                            <Input 
                              value={slab.label}
                              onChange={(e) => {
                                const updated = [...setupConfig.singleSlabs];
                                updated[index].label = e.target.value;
                                setSetupConfig({ ...setupConfig, singleSlabs: updated });
                              }}
                              className="text-xs h-8"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isFirst 
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' 
                                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                            }`}>
                              {isFirst ? 'Social Security Tax (1%)' : 'Income Tax'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono min-w-[150px]">
                            <Input 
                              type="number"
                              value={slab.limitSingle >= 999999999 ? '' : slab.limitSingle}
                              placeholder={slab.limitSingle >= 999999999 ? 'Above (No Cap)' : 'Upper Limit'}
                              onChange={(e) => {
                                const updated = [...setupConfig.singleSlabs];
                                const val = e.target.value === '' ? 999999999 : parseFloat(e.target.value) || 0;
                                updated[index].limitSingle = val;
                                updated[index].limitMarried = val;
                                setSetupConfig({ ...setupConfig, singleSlabs: updated });
                              }}
                              className="text-xs h-8 font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 min-w-[110px]">
                            <div className="relative">
                              <Input 
                                type="number"
                                step="0.1"
                                value={+(slab.rate * 100).toFixed(1)}
                                onChange={(e) => {
                                  const updated = [...setupConfig.singleSlabs];
                                  updated[index].rate = (parseFloat(e.target.value) || 0) / 100;
                                  setSetupConfig({ ...setupConfig, singleSlabs: updated });
                                }}
                                className="text-xs h-8 font-bold text-indigo-600 dark:text-indigo-400 font-mono"
                              />
                              <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                            {slab.cumulativeCheckpoint ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                रु. {slab.cumulativeCheckpoint.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button 
                              onClick={() => {
                                if (setupConfig.singleSlabs.length <= 1) {
                                  toast.error('Minimum 1 tax slab is required.');
                                  return;
                                }
                                const updated = setupConfig.singleSlabs.filter((_, i) => i !== index);
                                setSetupConfig({ ...setupConfig, singleSlabs: updated });
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                              title="Delete Bracket"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: IRD CHECKPOINT TEST SUITE */}
        {activeSubTab === 'tests' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-indigo-600" />
                  <h3 className="font-bold text-slate-900 dark:text-white text-xs">
                    Automated Nepal IRD Tax Checkpoint Verification Suite
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tests active configuration against all official statutory tax liability checkpoints (Finance Act 2083 unified resident schedule).
                </p>
              </div>

              <Button 
                onClick={handleRunTests}
                className="gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                disabled={isRunningTests}
              >
                <Play size={13} className={isRunningTests ? 'animate-spin' : ''} />
                Re-Run Verification Suite
              </Button>
            </div>

            {/* Test Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {testResults?.map((test) => (
                <div 
                  key={test.testId}
                  className={`p-4 rounded-2xl border transition-all ${
                    test.passed 
                      ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50' 
                      : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono font-bold text-slate-400">{test.testId}</span>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">{test.testName}</h4>
                    </div>
                    <Badge variant="outline" className={test.passed ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold' : 'bg-rose-100 text-rose-800 text-[10px] font-bold'}>
                      {test.passed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 font-sans block">Expected Tax:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        रु. {test.expectedTax.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-sans block">Computed Tax:</span>
                      <span className={`font-bold ${test.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                        रु. {test.calculatedTax.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] text-slate-500 font-sans leading-relaxed">
                    {test.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBTAB 3: SSF & 1% SST WAIVER */}
        {activeSubTab === 'ssf' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* SSF Waiver Card */}
            <div className="p-5 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-bold text-xs text-emerald-950 dark:text-emerald-200">
                    Slab 1 Social Security Tax (1% SST) 100% Exemption Waiver
                  </h3>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 max-w-2xl">
                  According to the statutory Nepal Finance Act and Social Security Fund guidelines, employees contributing to SSF are entitled to a 100% exemption on the 1% Social Security Tax on the first NPR 10,00,000 assessable income (NPR 0 SST).
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input 
                  type="checkbox"
                  checked={setupConfig.ssfSlab1SstWaiver}
                  onChange={(e) => setSetupConfig({ ...setupConfig, ssfSlab1SstWaiver: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* SSF Contribution Percentages */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Employee SSF Share (%)
                </label>
                <div className="relative">
                  <Input 
                    type="number"
                    step="0.1"
                    value={+(setupConfig.ssfEmployeeRate * 100).toFixed(1)}
                    onChange={(e) => setSetupConfig({ ...setupConfig, ssfEmployeeRate: (parseFloat(e.target.value) || 0) / 100 })}
                    className="font-bold font-mono"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                </div>
                <span className="text-[10px] text-slate-400 block">Statutory standard: 11% of Basic Salary</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Employer SSF Share (%)
                </label>
                <div className="relative">
                  <Input 
                    type="number"
                    step="0.1"
                    value={+(setupConfig.ssfEmployerRate * 100).toFixed(1)}
                    onChange={(e) => setSetupConfig({ ...setupConfig, ssfEmployerRate: (parseFloat(e.target.value) || 0) / 100 })}
                    className="font-bold font-mono"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                </div>
                <span className="text-[10px] text-slate-400 block">Statutory standard: 20% of Basic Salary (CTC)</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Non-SSF Staff Provident Fund (%)
                </label>
                <div className="relative">
                  <Input 
                    type="number"
                    step="0.1"
                    value={+(setupConfig.pfNonSsfRate * 100).toFixed(1)}
                    onChange={(e) => setSetupConfig({ ...setupConfig, pfNonSsfRate: (parseFloat(e.target.value) || 0) / 100 })}
                    className="font-bold font-mono"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                </div>
                <span className="text-[10px] text-slate-400 block">For non-enrolled staff: 10% EPF</span>
              </div>
            </div>

            {/* SSF Statutory Breakdown Info */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Info size={14} className="text-sky-500" />
                Statutory Social Security Fund (SSF 31%) Composition
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-slate-600 dark:text-slate-400 pt-1">
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Medical Scheme</span>
                  <span>1.00% (Employer)</span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Accident Scheme</span>
                  <span>1.40% (Employer)</span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Old Age / Pension</span>
                  <span>28.33% (10% Emp + 18.33% Empr)</span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Dependent / Disability</span>
                  <span>0.27% (Employer)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: STATUTORY DEDUCTION CAPS */}
        {activeSubTab === 'deductions' && (
          <div className="space-y-4 animate-in fade-in duration-150 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Retirement Contribution Annual Cap (NPR)
                </label>
                <Input 
                  type="number"
                  value={setupConfig.retirementFundMaxCap || 500000}
                  onChange={(e) => setSetupConfig({ ...setupConfig, retirementFundMaxCap: parseFloat(e.target.value) || 500000 })}
                  className="font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block">Lower of NPR 5,00,000, actual deposit, or 1/3 assessable income</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Life Insurance Premium Cap (NPR)
                </label>
                <Input 
                  type="number"
                  value={setupConfig.lifeInsuranceAnnualLimit || 40000}
                  onChange={(e) => setSetupConfig({ ...setupConfig, lifeInsuranceAnnualLimit: parseFloat(e.target.value) || 40000 })}
                  className="font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block">Finance Act statutory cap: NPR 40,000 / year</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Health / Medical Insurance Cap (NPR)
                </label>
                <Input 
                  type="number"
                  value={setupConfig.healthInsuranceAnnualLimit || 20000}
                  onChange={(e) => setSetupConfig({ ...setupConfig, healthInsuranceAnnualLimit: parseFloat(e.target.value) || 20000 })}
                  className="font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block">Finance Act statutory cap: NPR 20,000 / year</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Private Building Insurance Cap (NPR)
                </label>
                <Input 
                  type="number"
                  value={setupConfig.privateBuildingInsuranceLimit || 10000}
                  onChange={(e) => setSetupConfig({ ...setupConfig, privateBuildingInsuranceLimit: parseFloat(e.target.value) || 10000 })}
                  className="font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block">Statutory cap: NPR 10,000 / year</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Female Tax Rebate (10%)
                  </label>
                  <input 
                    type="checkbox"
                    checked={setupConfig.femaleRebateEnabled || false}
                    onChange={(e) => setSetupConfig({ ...setupConfig, femaleRebateEnabled: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">10% tax rebate on annual tax liability for resident female individuals</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Disability First Slab Expansion Rate
                </label>
                <Input 
                  type="number"
                  step="0.1"
                  value={setupConfig.disabilityFirstSlabExpansionRate || 0.5}
                  onChange={(e) => setSetupConfig({ ...setupConfig, disabilityFirstSlabExpansionRate: parseFloat(e.target.value) || 0.5 })}
                  className="font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block">+50% (NPR 5,00,000) expansion to 1st band threshold</span>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 5: SALARY COMPONENTS */}
        {activeSubTab === 'components' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl text-xs">
              <table className="w-full text-left divide-y divide-slate-100 dark:divide-slate-800">
                <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Component Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Taxable</th>
                    <th className="py-2.5 px-3">SSF Wage Base</th>
                    <th className="py-2.5 px-3">CTC Applicable</th>
                    <th className="py-2.5 px-3">Statutory Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {DEFAULT_SALARY_COMPONENTS.map((comp) => (
                    <tr key={comp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {comp.name}
                        <span className="block text-[10px] font-mono text-slate-400">{comp.code}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className={comp.type === 'Earning' ? 'bg-emerald-50 text-emerald-700' : comp.type === 'EmployerCost' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}>
                          {comp.type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${comp.taxable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {comp.taxable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${comp.ssfApplicable ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>
                          {comp.ssfApplicable ? 'Yes (Wage Base)' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${comp.ctcApplicable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {comp.ctcApplicable ? 'Included' : 'Excluded'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {comp.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 6: LIVE TAX SIMULATOR */}
        {activeSubTab === 'simulator' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Input Column */}
              <div className="lg:col-span-5 space-y-4 p-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calculator size={16} className="text-indigo-600" />
                  Real-Time Salary & Tax Scratchpad
                </h3>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Monthly Basic Salary (NPR)</label>
                    <Input 
                      type="number"
                      value={simBasic}
                      onChange={(e) => setSimBasic(parseFloat(e.target.value) || 0)}
                      className="font-mono font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Monthly Allowances (DA + Other) (NPR)</label>
                    <Input 
                      type="number"
                      value={simAllowances}
                      onChange={(e) => setSimAllowances(parseFloat(e.target.value) || 0)}
                      className="font-mono font-bold text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Marital Status</label>
                      <select 
                        value={simMaritalStatus}
                        onChange={(e) => setSimMaritalStatus(e.target.value as any)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold"
                      >
                        <option value="Single">Single (Resident)</option>
                        <option value="Married">Married (Resident)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">SSF Enrolled?</label>
                      <select 
                        value={simSsfEnrolled ? 'yes' : 'no'}
                        onChange={(e) => setSimSsfEnrolled(e.target.value === 'yes')}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold"
                      >
                        <option value="yes">Yes (11% SSF + 1% SST Waived)</option>
                        <option value="no">No (10% PF + 1% SST Full)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Annual Life Insurance</label>
                      <Input 
                        type="number"
                        value={simLifeIns}
                        onChange={(e) => setSimLifeIns(parseFloat(e.target.value) || 0)}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Annual Health Insurance</label>
                      <Input 
                        type="number"
                        value={simHealthIns}
                        onChange={(e) => setSimHealthIns(parseFloat(e.target.value) || 0)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Output Column */}
              <div className="lg:col-span-7 space-y-4">
                {/* Result KPI Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                    <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 block">Monthly Gross</span>
                    <span className="text-sm font-black text-indigo-950 dark:text-white font-mono">
                      रु. {(simBasic + simAllowances).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-sky-50 dark:bg-sky-950/40 rounded-2xl border border-sky-100 dark:border-sky-900/50">
                    <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 block">Monthly SSF (11%)</span>
                    <span className="text-sm font-black text-sky-950 dark:text-white font-mono">
                      रु. {simulationResult.socialSecurity.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-100 dark:border-rose-900/50">
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 block">Monthly TDS</span>
                    <span className="text-sm font-black text-rose-950 dark:text-white font-mono">
                      रु. {simulationResult.incomeTaxTDS.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 block">Monthly Net Pay</span>
                    <span className="text-sm font-black text-emerald-950 dark:text-white font-mono">
                      रु. {(simBasic + simAllowances - simulationResult.totalDeductions).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Progressive Slab Breakdown Table */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Progressive IRD Tax Slab Breakdown
                    </h4>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      Annual Tax: रु. {simulationResult.annualTaxLiability.toLocaleString()}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2 px-3">Slab Name</th>
                          <th className="py-2 px-3">Taxable Slice</th>
                          <th className="py-2 px-3">Rate</th>
                          <th className="py-2 px-3 text-right">Tax Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                        {simulationResult.taxSlabBreakdown?.map((slab, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                              {slab.slabName}
                              {i === 0 && simSsfEnrolled && (
                                <span className="ml-2 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                                  100% SSF Waived
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              रु. {slab.taxableAmount.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 font-bold text-indigo-600">
                              {(slab.rate * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">
                              रु. {slab.taxAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 7: VERSION & AUDIT TRAIL */}
        {activeSubTab === 'audit' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Configuration Version & Statutory Source
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">
                  {setupConfig.sourceReference || 'Nepal Finance Act 2083 & IRD Unified Resident Individual Guidelines'}
                </p>
              </div>
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 font-mono text-xs">
                Version {setupConfig.ruleVersion || '1.0'}
              </Badge>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl text-xs">
              <table className="w-full text-left divide-y divide-slate-100 dark:divide-slate-800">
                <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">User / Admin</th>
                    <th className="py-2.5 px-3">Fiscal Year</th>
                    <th className="py-2.5 px-3">Rule Version</th>
                    <th className="py-2.5 px-3">Summary of Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {setupConfig.auditLogs?.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {log.user}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {log.fiscalYear}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                        v{log.ruleVersion}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 text-[11px]">
                        {log.changesSummary}
                      </td>
                    </tr>
                  ))}
                  {(!setupConfig.auditLogs || setupConfig.auditLogs.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                        No previous audit log entries recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
