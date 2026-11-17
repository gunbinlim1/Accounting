-- 회사별 급여 스케줄 (여러 개 가능) · 회차별 날짜 변경 · 직원 W-2 PDF 열람
-- * pay_schedules: 회사마다 기본 스케줄 1개(격주) + 추가 스케줄. 주기(매주·격주·월 2회·매월)와 첫 지급일.
--   overrides: 회차별 날짜 변경 {"원래 지급일": {"payDate": 실제 지급일, "start": 급여 기간 시작, "end": 끝}}
-- * employees.schedule_id: 직원이 속한 스케줄 (null = 기본 스케줄)
-- * pay_runs.period_start/period_end: 회차의 실제 급여 기간 (명세서·내역 표시용)
-- * move_open_run: 회차 지급일을 바꿀 때, 아직 제출 전인 근무 입력을 새 날짜로 옮김
-- * 직원(employee 역할)은 본인에게 지정된 W-2 신고서만 보고 내려받음

create table public.pay_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  frequency text not null check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  first_pay_date date not null,
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index pay_schedules_one_default on public.pay_schedules (company_id) where is_default;
create index pay_schedules_company_idx on public.pay_schedules (company_id);

alter table public.pay_schedules enable row level security;
revoke all on public.pay_schedules from anon;
revoke truncate on public.pay_schedules from authenticated;
grant select, insert, update, delete on public.pay_schedules to authenticated;

create policy schedules_read on public.pay_schedules for select to authenticated
  using (private.is_staff_of(company_id) or private.is_employee_of(company_id));
create policy schedules_insert on public.pay_schedules for insert to authenticated
  with check (private.is_staff_of(company_id) and not is_default);
create policy schedules_update on public.pay_schedules for update to authenticated
  using (private.is_staff_of(company_id)) with check (private.is_staff_of(company_id));
create policy schedules_delete on public.pay_schedules for delete to authenticated
  using (private.is_staff_of(company_id) and not is_default);

-- 기본 스케줄 여부와 소속 회사는 바꿀 수 없음
create or replace function private.guard_pay_schedule() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.is_default := old.is_default;
  new.company_id := old.company_id;
  if new.is_default and not new.active then
    raise exception 'the default schedule cannot be turned off' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger pay_schedules_guard before update on public.pay_schedules
for each row execute function private.guard_pay_schedule();
create trigger pay_schedules_audit after insert or update or delete on public.pay_schedules
for each row execute function private.audit();

-- 직원 ↔ 스케줄 (같은 회사의 스케줄만)
alter table public.employees add column schedule_id uuid references public.pay_schedules (id) on delete set null;
grant insert (schedule_id), update (schedule_id) on public.employees to authenticated;

create or replace function private.guard_employee_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.schedule_id is not null and not exists (
    select 1 from public.pay_schedules s where s.id = new.schedule_id and s.company_id = new.company_id
  ) then
    raise exception 'schedule belongs to another company' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger employees_schedule_guard before insert or update of schedule_id on public.employees
for each row execute function private.guard_employee_schedule();

-- 회차 급여 기간
alter table public.pay_runs add column period_start date, add column period_end date;

-- 기존 회사: 지금까지 쓰던 격주(기준일 2026-01-09) 스케줄을 기본으로
insert into public.pay_schedules (company_id, name, frequency, first_pay_date, is_default)
select c.id, '', 'biweekly', '2026-01-09', true from public.companies c
where not exists (select 1 from public.pay_schedules s where s.company_id = c.id and s.is_default);

-- 새 회사: 기본 스케줄 자동 생성
create or replace function private.add_default_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pay_schedules (company_id, name, frequency, first_pay_date, is_default)
  values (new.id, '', 'biweekly', '2026-01-09', true);
  return new;
end $$;
create trigger companies_default_schedule after insert on public.companies
for each row execute function private.add_default_schedule();

-- 회차 지급일 변경: 해당 스케줄 직원들의 근무 입력을 새 날짜로 옮김 (제출 전 회차만)
create or replace function public.move_open_run(p_schedule_id uuid, p_from date, p_to date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.pay_schedules;
begin
  select * into s from public.pay_schedules where id = p_schedule_id;
  if s.id is null or not private.is_staff_of(s.company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from = p_to then
    return;
  end if;
  if exists (select 1 from public.pay_runs r where r.company_id = s.company_id and r.pay_date in (p_from, p_to) and r.status <> 'draft') then
    raise exception 'pay date can only change before the payroll is submitted' using errcode = 'P0001';
  end if;
  update public.time_entries t set pay_date = p_to
  where t.company_id = s.company_id and t.pay_date = p_from
    and t.employee_id in (
      select e.id from public.employees e
      where e.company_id = s.company_id
        and (e.schedule_id = s.id or (e.schedule_id is null and s.is_default))
    )
    and not exists (
      select 1 from public.time_entries x where x.company_id = t.company_id and x.pay_date = p_to and x.employee_id = t.employee_id
    );
end $$;
revoke execute on function public.move_open_run(uuid, date, date) from public, anon;
grant execute on function public.move_open_run(uuid, date, date) to authenticated;

-- 직원: 본인에게 지정된 W-2 신고서 보기·내려받기
create or replace function private.is_my_filing(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.filings f
    where f.path = p_path and f.form = 'W-2' and f.employee_id in (select private.my_employee_ids())
  )
$$;

create policy filings_read_employee on public.filings for select to authenticated
  using (form = 'W-2' and employee_id in (select private.my_employee_ids()));
create policy payroll_docs_read_own_w2 on storage.objects for select to authenticated
  using (bucket_id = 'payroll-docs' and private.is_my_filing(name));
