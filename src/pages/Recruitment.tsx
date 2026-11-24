import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase, Plus, Users, Calendar, Video, CheckCircle2, ArrowRight,
  Trash2, Search, X, Sparkles, UserPlus
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { emitInAppNotification } from '../lib/notifications';
import { generateId, cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { JobOpening, CandidateApplication, CandidateStage, LifecycleChecklistItem } from '../types';

const STAGES: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

export default function Recruitment() {
  const { employees, setEmployees, settings } = useAppStore();
  const [activeTab, setActiveTab] = useState<'pipeline' | 'jobs'>('pipeline');
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [candidates, setCandidates] = useState<CandidateApplication[]>([]);
  const [stageFilter, setStageFilter] = useState<CandidateStage | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: '',
    department: '',
    location: 'Kathmandu HQ',
    employmentType: 'Full-Time' as JobOpening['employmentType'],
    vacancies: 1,
    salaryRange: '',
    closingDate: '',
    description: '',
  });

  const [isCandModalOpen, setIsCandModalOpen] = useState(false);
  const [candForm, setCandForm] = useState({
    jobId: '',
    name: '',
    email: '',
    phone: '',
    experienceYears: 1,
    expectedSalary: '',
    source: 'Direct Referral',
    interviewDate: '',
    meetLink: settings.platformConfig?.googleMeetDefaultRoom || '',
    notes: '',
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [j, c] = await Promise.all([
        fetchLocalTable<JobOpening>('hr_jobs'),
        fetchLocalTable<CandidateApplication>('hr_candidates'),
      ]);
      setJobs(j.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setCandidates(c.sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || '')));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title.trim() || !jobForm.department.trim()) {
      toast.error('Job title and department are required.');
      return;
    }
    const newJob: JobOpening = {
      id: `job_${generateId()}`,
      title: jobForm.title.trim(),
      department: jobForm.department.trim(),
      location: jobForm.location.trim() || 'Head Office',
      employmentType: jobForm.employmentType,
      vacancies: Math.max(1, Number(jobForm.vacancies) || 1),
      salaryRange: jobForm.salaryRange.trim(),
      closingDate: jobForm.closingDate,
      status: 'Open',
      description: jobForm.description.trim(),
      createdAt: new Date().toISOString(),
    };
    const ok = await saveLocalTable('hr_jobs', [newJob]);
    if (ok) {
      setJobs((prev) => [newJob, ...prev]);
      setIsJobModalOpen(false);
      setJobForm({
        title: '',
        department: '',
        location: 'Kathmandu HQ',
        employmentType: 'Full-Time',
        vacancies: 1,
        salaryRange: '',
        closingDate: '',
        description: '',
      });
      toast.success(`Job opening "${newJob.title}" published.`);
    }
  };

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    const job = jobs.find((j) => j.id === candForm.jobId);
    if (!candForm.name.trim()) {
      toast.error('Candidate name is required.');
      return;
    }
    const newCand: CandidateApplication = {
      id: `cand_${generateId()}`,
      jobId: job?.id || '',
      jobTitle: job?.title || 'General Application',
      department: job?.department || 'Operations',
      name: candForm.name.trim(),
      email: candForm.email.trim(),
      phone: candForm.phone.trim(),
      experienceYears: Number(candForm.experienceYears) || 0,
      expectedSalary: candForm.expectedSalary.trim(),
      source: candForm.source.trim(),
      stage: 'Applied',
      interviewDate: candForm.interviewDate,
      meetLink: candForm.meetLink.trim(),
      notes: candForm.notes.trim(),
      appliedAt: format(new Date(), 'yyyy-MM-dd'),
    };
    const ok = await saveLocalTable('hr_candidates', [newCand]);
    if (ok) {
      setCandidates((prev) => [newCand, ...prev]);
      setIsCandModalOpen(false);
      setCandForm({
        jobId: '',
        name: '',
        email: '',
        phone: '',
        experienceYears: 1,
        expectedSalary: '',
        source: 'Direct Referral',
        interviewDate: '',
        meetLink: settings.platformConfig?.googleMeetDefaultRoom || '',
        notes: '',
      });
      toast.success(`Applicant "${newCand.name}" added to recruitment pipeline.`);
    }
  };

  const handleUpdateStage = async (cand: CandidateApplication, nextStage: CandidateStage) => {
    const updated = { ...cand, stage: nextStage };
    const ok = await saveLocalTable('hr_candidates', [updated]);
    if (ok) {
      setCandidates((prev) => prev.map((c) => (c.id === cand.id ? updated : c)));
      toast.success(`${cand.name} moved to ${nextStage}.`);
    }
  };

  const handleHireAndOnboard = async (cand: CandidateApplication) => {
    if (cand.hiredEmployeeId) {
      toast.info(`Already hired as Employee ID ${cand.hiredEmployeeId}.`);
      return;
    }
    const numericIds = employees
      .map((e) => Number(String(e.id).replace(/[^0-9]/g, '')))
      .filter((n) => !isNaN(n) && n > 0);
    const nextNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1001;
    const newEmpId = String(nextNum);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const newEmployee = {
      id: newEmpId,
      bioId: newEmpId,
      name: cand.name,
      department: cand.department || 'Operations',
      designation: cand.jobTitle || 'Staff',
      shiftId: settings.shifts?.[0]?.id || 'shift-1',
      joiningDate: todayStr,
      status: 'Active' as const,
      weeklyOff: settings.defaultWeeklyOff || 'Saturday',
      otEligible: true,
      targetWorkingHours: 8,
      email: cand.email,
      phone: cand.phone,
    };

    await setEmployees([...employees, newEmployee]);

    const onboardingTasks: LifecycleChecklistItem[] = [
      { title: 'Collect citizenship/ID & signed appointment letter', ownerRole: 'HR' as const },
      { title: 'Enroll fingerprint / face ID on ZKTeco biometric terminal', ownerRole: 'IT' as const },
      { title: 'Issue employee badge, workstation & PPE kit', ownerRole: 'Admin' as const },
      { title: 'Configure bank account & SSF/PAN payroll profile', ownerRole: 'Payroll' as const },
      { title: 'Department induction & shift schedule briefing', ownerRole: 'Manager' as const },
    ].map((t) => ({
      id: `onb_${generateId()}`,
      employeeId: newEmpId,
      employeeName: cand.name,
      department: cand.department || 'Operations',
      workflowType: 'Onboarding' as const,
      title: t.title,
      ownerRole: t.ownerRole,
      dueDate: todayStr,
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
    }));

    await saveLocalTable('hr_onboarding_tasks', onboardingTasks);
    const updatedCand: CandidateApplication = {
      ...cand,
      stage: 'Hired',
      hiredEmployeeId: newEmpId,
    };
    await saveLocalTable('hr_candidates', [updatedCand]);
    setCandidates((prev) => prev.map((c) => (c.id === cand.id ? updatedCand : c)));

    await emitInAppNotification(
      {
        title: 'Candidate Hired & Onboarding Initiated',
        message: `${cand.name} (${cand.jobTitle}) hired as Employee #${newEmpId} with 5 onboarding tasks.`,
        category: 'Recruitment',
        severity: 'success',
        link: '/onboarding',
        eventKey: 'employee.lifecycle',
      },
      settings
    );

    toast.success(`Hired ${cand.name} (#${newEmpId}) and created Onboarding checklist!`);
  };

  const handleDeleteJob = async (id: string) => {
    if (await deleteLocalTableRecords('hr_jobs', [id])) {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success('Job posting removed.');
    }
  };

  const handleDeleteCandidate = async (id: string) => {
    if (await deleteLocalTableRecords('hr_candidates', [id])) {
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      toast.success('Candidate removed.');
    }
  };

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesStage = stageFilter === 'All' || c.stage === stageFilter;
      const q = searchTerm.trim().toLowerCase();
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q);
      return matchesStage && matchesQuery;
    });
  }, [candidates, stageFilter, searchTerm]);

  const openJobsCount = jobs.filter((j) => j.status === 'Open').length;
  const totalVacancies = jobs.filter((j) => j.status === 'Open').reduce((s, j) => s + (j.vacancies || 1), 0);
  const interviewCount = candidates.filter((c) => c.stage === 'Interview' || c.stage === 'Offer').length;
  const hiredCount = candidates.filter((c) => c.stage === 'Hired').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment & Talent Pipeline"
        description="End-to-end hiring workflow from job requisitions to interview scheduling and automated onboarding"
        icon={Briefcase}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsJobModalOpen(true)}>
              <Plus size={15} /> Post Job Opening
            </Button>
            <Button onClick={() => setIsCandModalOpen(true)}>
              <UserPlus size={15} /> Add Candidate
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Open Requisitions" value={openJobsCount} icon={Briefcase} trendValue={`${totalVacancies} Vacancies`} trend="up" />
        <KPICard label="Total Applicants" value={candidates.length} icon={Users} trendValue="Pipeline Pool" trend="neutral" />
        <KPICard label="Interview & Offer" value={interviewCount} icon={Calendar} trendValue="Active Evaluation" trend="up" color="warning" />
        <KPICard label="Hired Candidates" value={hiredCount} icon={CheckCircle2} trendValue="Converted to Staff" trend="up" color="success" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={cn(
              'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
              activeTab === 'pipeline'
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            Candidate Pipeline ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('jobs')}
            className={cn(
              'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
              activeTab === 'jobs'
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            Job Requisitions ({jobs.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search candidate or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {activeTab === 'pipeline' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(['All', ...STAGES] as const).map((st) => {
              const count = st === 'All' ? candidates.length : candidates.filter((c) => c.stage === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStageFilter(st)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors tabular-nums',
                    stageFilter === st
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary/40'
                  )}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>

          <Card>
            {isLoading ? (
              <p className="text-xs text-slate-400 py-8 text-center">Loading recruitment records from SQLite...</p>
            ) : filteredCandidates.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No candidates in this stage</p>
                <Button size="sm" onClick={() => setIsCandModalOpen(true)}>
                  <UserPlus size={14} /> Add First Applicant
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Applicant</th>
                      <th className="px-4 py-3">Position & Dept</th>
                      <th className="px-4 py-3">Applied (AD / BS)</th>
                      <th className="px-4 py-3">Interview / Meet</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-5 py-3 text-right">Workflow Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCandidates.map((c) => {
                      const nextIdx = STAGES.indexOf(c.stage) + 1;
                      const nextStage = nextIdx > 0 && nextIdx < STAGES.length - 1 ? STAGES[nextIdx] : null;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-5 py-3.5">
                            <p className="font-bold text-slate-900 dark:text-white text-[13px]">{c.name}</p>
                            <p className="text-[11px] text-slate-500">{c.email || c.phone || 'No contact'}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{c.jobTitle}</p>
                            <p className="text-[11px] text-slate-500">{c.department} · {c.experienceYears} yrs exp</p>
                          </td>
                          <td className="px-4 py-3.5 tabular-nums">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{c.appliedAt}</p>
                            <p className="text-[10px] text-primary">BS {getNepaliDate(c.appliedAt)}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            {c.interviewDate ? (
                              <span className="text-slate-700 dark:text-slate-300 tabular-nums block">{c.interviewDate}</span>
                            ) : (
                              <span className="text-slate-400">Not scheduled</span>
                            )}
                            {c.meetLink && (
                              <a
                                href={c.meetLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline mt-0.5"
                              >
                                <Video size={11} /> Join Meet
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge
                              variant={
                                c.stage === 'Hired'
                                  ? 'success'
                                  : c.stage === 'Rejected'
                                    ? 'danger'
                                    : c.stage === 'Offer' || c.stage === 'Interview'
                                      ? 'warning'
                                      : 'info'
                              }
                            >
                              {c.stage}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {nextStage && c.stage !== 'Hired' && (
                                <Button size="sm" variant="outline" onClick={() => handleUpdateStage(c, nextStage)}>
                                  Move to {nextStage} <ArrowRight size={12} />
                                </Button>
                              )}
                              {c.stage !== 'Hired' && c.stage !== 'Rejected' && (
                                <Button size="sm" variant="success" onClick={() => handleHireAndOnboard(c)}>
                                  <Sparkles size={12} /> Hire & Onboard
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteCandidate(c.id)}
                                className="text-rose-600 px-2"
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.length === 0 ? (
            <Card className="md:col-span-3 text-center py-12">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">
                No active job requisitions created yet
              </p>
              <Button onClick={() => setIsJobModalOpen(true)}>
                <Plus size={14} /> Create Job Opening
              </Button>
            </Card>
          ) : (
            jobs.map((job) => {
              const applicantCount = candidates.filter((c) => c.jobId === job.id).length;
              return (
                <Card
                  key={job.id}
                  title={job.title}
                  subtitle={`${job.department} · ${job.location}`}
                  actions={
                    <Badge variant={job.status === 'Open' ? 'success' : job.status === 'On Hold' ? 'warning' : 'muted'}>
                      {job.status}
                    </Badge>
                  }
                >
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Vacancies</span>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">{job.vacancies}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Applicants</span>
                        <span className="font-bold text-primary tabular-nums">{applicantCount}</span>
                      </div>
                    </div>
                    {job.salaryRange && (
                      <p className="text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">Compensation:</span> {job.salaryRange}
                      </p>
                    )}
                    {job.description && (
                      <p className="text-slate-500 dark:text-slate-400 line-clamp-2">{job.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCandForm((prev) => ({ ...prev, jobId: job.id }));
                          setIsCandModalOpen(true);
                        }}
                      >
                        <UserPlus size={12} /> Add Applicant
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteJob(job.id)}
                        className="text-rose-600 px-2"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Job Opening Modal */}
      {isJobModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Post Job Requisition</h3>
              <button type="button" onClick={() => setIsJobModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <Input
                label="Job Title"
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                placeholder="e.g., Shift Supervisor / Lab Analyst"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Department"
                  value={jobForm.department}
                  onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })}
                  placeholder="Production / Bio"
                  required
                />
                <Input
                  label="Location"
                  value={jobForm.location}
                  onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Type</label>
                  <select
                    value={jobForm.employmentType}
                    onChange={(e) => setJobForm({ ...jobForm, employmentType: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>
                <Input
                  label="Vacancies"
                  type="number"
                  min={1}
                  value={jobForm.vacancies}
                  onChange={(e) => setJobForm({ ...jobForm, vacancies: Number(e.target.value) })}
                />
                <Input
                  label="Salary Range"
                  value={jobForm.salaryRange}
                  onChange={(e) => setJobForm({ ...jobForm, salaryRange: e.target.value })}
                  placeholder="NPR 35k-50k"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Role Summary</label>
                <textarea
                  rows={3}
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white"
                  placeholder="Key responsibilities & shift requirements..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsJobModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Publish Opening</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Candidate Modal */}
      {isCandModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Candidate Application</h3>
              <button type="button" onClick={() => setIsCandModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateCandidate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Job Opening</label>
                <select
                  value={candForm.jobId}
                  onChange={(e) => setCandForm({ ...candForm, jobId: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">General Talent Pool</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.department})
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Candidate Full Name"
                value={candForm.name}
                onChange={(e) => setCandForm({ ...candForm, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Email"
                  type="email"
                  value={candForm.email}
                  onChange={(e) => setCandForm({ ...candForm, email: e.target.value })}
                />
                <Input
                  label="Phone"
                  value={candForm.phone}
                  onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Experience (Years)"
                  type="number"
                  step="0.5"
                  value={candForm.experienceYears}
                  onChange={(e) => setCandForm({ ...candForm, experienceYears: Number(e.target.value) })}
                />
                <Input
                  label="Interview Date"
                  type="date"
                  value={candForm.interviewDate}
                  onChange={(e) => setCandForm({ ...candForm, interviewDate: e.target.value })}
                />
              </div>
              <Input
                label="Google Meet / Video Interview URL"
                value={candForm.meetLink}
                onChange={(e) => setCandForm({ ...candForm, meetLink: e.target.value })}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCandModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add to Pipeline</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
