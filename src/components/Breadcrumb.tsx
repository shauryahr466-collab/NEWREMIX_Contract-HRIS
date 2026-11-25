import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useAppStore } from '../store';
import { NAV_GROUPS } from '../lib/navigation';
import { formatUserScopeSummary } from '../lib/accessControl';
import { getNepaliDate } from '../utils/dateHelper';
import { cn } from '../lib/utils';

interface CrumbItem {
  label: string;
  to?: string;
  isCurrent?: boolean;
  icon?: any;
}

export function Breadcrumb({ className }: { className?: string }) {
  const location = useLocation();
  const {
    canAccessModule,
    effectiveUserProfile,
    selectedEmployeeId,
    employees,
  } = useAppStore();

  const selectedEmployee = useMemo(
    () => (selectedEmployeeId ? employees.find((e) => e.id === selectedEmployeeId) : undefined),
    [selectedEmployeeId, employees]
  );

  const isEmployeeRole = effectiveUserProfile?.role === 'Employee';

  const crumbs = useMemo<CrumbItem[]>(() => {
    const visibleGroups = NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .filter((item) => canAccessModule(item.moduleKey))
        .map((item) => ({
          ...item,
          label: isEmployeeRole && item.employeeLabel ? item.employeeLabel : item.label,
        })),
    })).filter((g) => g.items.length > 0);

    const activeGroup = visibleGroups.find((g) =>
      g.items.some((item) => item.to === location.pathname)
    );
    const activeItem = activeGroup?.items.find((item) => item.to === location.pathname);

    const params = new URLSearchParams(location.search);
    const filterDate = params.get('date');
    const filterStatus = params.get('status');
    const filterTab = params.get('tab');

    const hasSubContext = Boolean(filterDate || filterStatus || filterTab || selectedEmployee);

    const items: CrumbItem[] = [
      {
        label: 'Home',
        to: location.pathname === '/' && !hasSubContext ? undefined : '/',
        isCurrent: location.pathname === '/' && !hasSubContext,
        icon: Home,
      },
    ];

    if (activeGroup && activeGroup.id !== 'overview') {
      const groupLanding = activeGroup.items[0]?.to;
      items.push({
        label: activeGroup.label,
        to: groupLanding && groupLanding !== location.pathname ? groupLanding : undefined,
      });
    }

    if (activeItem && activeItem.to !== '/') {
      items.push({
        label: activeItem.label,
        to: hasSubContext ? activeItem.to : undefined,
        isCurrent: !hasSubContext,
      });
    } else if (!activeItem && location.pathname !== '/') {
      const fallbackSegment = location.pathname
        .replace(/^\//, '')
        .split('/')[0]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      items.push({
        label: fallbackSegment || 'Workspace',
        isCurrent: !hasSubContext,
      });
    }

    const TAB_LABELS: Record<string, string> = {
      reconciliation: 'Attendance Reconciliation',
      muster: 'Monthly Muster',
      calendar: 'Attendance Calendar',
      audit: 'Fresh Attendance Audit',
    };

    if (filterDate || filterStatus || filterTab) {
      const parts: string[] = [];
      if (filterDate) {
        const bs = getNepaliDate(filterDate);
        parts.push(bs !== '0000-00-00' ? `${filterDate} (BS ${bs})` : filterDate);
      }
      if (filterStatus) parts.push(filterStatus);
      if (filterTab) parts.push(TAB_LABELS[filterTab] || filterTab);
      items.push({
        label: parts.join(' · '),
        isCurrent: !selectedEmployee,
      });
    }

    if (selectedEmployee) {
      items.push({
        label: `${selectedEmployee.name} (${selectedEmployee.id})`,
        isCurrent: true,
      });
    }

    return items;
  }, [location.pathname, location.search, canAccessModule, selectedEmployee, isEmployeeRole]);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('hidden sm:flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 min-w-0', className)}
    >
      <ol className="flex items-center gap-1.5 min-w-0 flex-wrap">
        {crumbs.map((crumb, idx) => {
          const Icon = crumb.icon;
          const isLast = idx === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5 min-w-0">
              {idx > 0 && (
                <ChevronRight
                  size={12}
                  className="text-slate-300 dark:text-slate-600 shrink-0"
                  aria-hidden="true"
                />
              )}
              {crumb.to && !crumb.isCurrent ? (
                <NavLink
                  to={crumb.to}
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors font-medium truncate max-w-[170px]"
                >
                  {Icon && <Icon size={12} className="shrink-0" />}
                  <span className="truncate">{crumb.label}</span>
                </NavLink>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1 truncate max-w-[240px]',
                    isLast
                      ? 'font-bold text-slate-900 dark:text-white'
                      : 'text-slate-400 dark:text-slate-500 font-medium'
                  )}
                  title={crumb.label}
                >
                  {Icon && <Icon size={12} className="shrink-0" />}
                  <span className="truncate">{crumb.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {effectiveUserProfile && effectiveUserProfile.role !== 'Super Admin' && (
        <>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700 shrink-0">
            ·
          </span>
          <span
            className="text-slate-500 dark:text-slate-400 truncate max-w-[180px]"
            title={formatUserScopeSummary(effectiveUserProfile)}
          >
            {formatUserScopeSummary(effectiveUserProfile)}
          </span>
        </>
      )}
    </nav>
  );
}
