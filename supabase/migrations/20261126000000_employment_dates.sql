-- 입사·퇴사일과 PTO 대기 기간
-- * employees.termination_date: 퇴사일 (마지막 근무일). 입사일보다 앞설 수 없음.
--   퇴사일이 있는 급여 기간까지는 마지막 급여가 나가고, 그 뒤 회차에서는 빠짐 (앱에서 판단)
-- * pto_policies.waiting_days: 입사 후 이 기간(일)에는 PTO가 적립되지 않음

alter table public.employees
  add column termination_date date,
  add constraint employees_termination_after_hire check (termination_date is null or termination_date >= hire_date);
grant insert (termination_date), update (termination_date) on public.employees to authenticated;

alter table public.pto_policies
  add column waiting_days integer not null default 0 check (waiting_days between 0 and 730);
