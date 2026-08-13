const fs = require('fs');
let code = fs.readFileSync('src/pages/Employees.tsx', 'utf-8');

// I need to find the place to insert the Tax Profile form fields.
// Since Employees.tsx might be large, I'll append the fields at the end of the form, or before the save button.

const taxProfileUI = `
              {/* Income Tax Profile */}
              <div className="border-t border-slate-200 pt-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Income Tax Profile (FY 2083/84)</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Taxpayer Type</label>
                    <select 
                      value={formData.taxProfile?.taxpayerType || 'Resident'} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, taxpayerType: e.target.value as any }})} 
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="Resident">Resident Natural Person</option>
                      <option value="Non-Resident">Non-Resident</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Remote Area</label>
                    <select 
                      value={formData.taxProfile?.remoteAreaCategory || 'None'} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, remoteAreaCategory: e.target.value as any }})} 
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="None">None</option>
                      <option value="A">Category A (Rs. 50,000)</option>
                      <option value="B">Category B (Rs. 40,000)</option>
                      <option value="C">Category C (Rs. 30,000)</option>
                      <option value="D">Category D (Rs. 20,000)</option>
                      <option value="E">Category E (Rs. 10,000)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Female Rebate</h4>
                      <p className="text-[10px] text-slate-500">10% tax rebate</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.taxProfile?.femaleRebateEligible || false}
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, femaleRebateEligible: e.target.checked }})}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Disability</h4>
                      <p className="text-[10px] text-slate-500">+50% Exemption</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.taxProfile?.disabilityStatus || false}
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, disabilityStatus: e.target.checked }})}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">1% SST Waived</h4>
                      <p className="text-[10px] text-slate-500">Pension / SSF</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.taxProfile?.incomeFromPension || formData.taxProfile?.retirementFundContributor || formData.ssfEnrolled || false}
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, retirementFundContributor: e.target.checked }})}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Life Insurance Premium</label>
                    <input 
                      type="number" 
                      value={formData.taxProfile?.lifeInsurancePremium || ''} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, lifeInsurancePremium: Number(e.target.value) }})} 
                      placeholder="Actual Paid (Max 40k)"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Health Insurance Premium</label>
                    <input 
                      type="number" 
                      value={formData.taxProfile?.healthInsurancePremium || ''} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, healthInsurancePremium: Number(e.target.value) }})} 
                      placeholder="Actual Paid (Max 20k)"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" 
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Building Insurance Premium</label>
                    <input 
                      type="number" 
                      value={formData.taxProfile?.privateBuildingInsurance || ''} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, privateBuildingInsurance: Number(e.target.value) }})} 
                      placeholder="Actual Paid (Max 10k)"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Education Fee</label>
                    <input 
                      type="number" 
                      value={formData.taxProfile?.educationFee || ''} 
                      onChange={e => setFormData({...formData, taxProfile: { ...formData.taxProfile, educationFee: Number(e.target.value) }})} 
                      placeholder="Eligible Amount"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" 
                    />
                  </div>
                </div>
              </div>
`;

// Insert the code just before the submit button container.
code = code.replace(/(\{\/\*\s*Submit Buttons\s*\*\/\})/i, taxProfileUI + '\n$1');

fs.writeFileSync('src/pages/Employees.tsx', code);
