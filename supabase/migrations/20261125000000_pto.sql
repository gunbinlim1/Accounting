-- PTO(유급 휴가) 관리
-- * pto_policies: 회사별 휴가 규칙 (적립 방식·최대 잔액·적용 급여 형태)
-- * pto_adjustments: 잔액 조정 기록 (시작 잔액·수동 조정). 수정·삭제 불가 — 바로잡을 때는 반대 조정을 추가
-- * pto_requests: 휴가 신청·기록. 직원은 본인 신청(대기)·취소만, 고객사·회계법인은 등록·승인·거절
-- * time_entries.time_off: 회차별 사용한 휴가 시간 {정책 ID: 시간} — 급여 계산에 들어감
-- * 적립·사용 잔액은 처리된 회차(pay_results.entry)와 조정 기록으로 앱에서 계산

create table public.pto_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'pto' check (kind in ('pto', 'sick', 'vacation', 'other')),
  -- per_hour: 근무 per_hours시간당 amount시간 / per_period: 회차마다 amount시간 / annual: 매년 amount시간 / none: 적립 없음(사용만 기록)
  accrual text not null check (accrual in ('per_hour', 'per_period', 'annual', 'none')),
  amount numeric(8, 4) not null default 0 check (amount >= 0 and amount <= 2000),
  per_hours numeric(8, 2) not null default 30 check (per_hours > 0),
  max_balance numeric(8, 2) check (max_balance is null or max_balance >= 0),
  applies_to text[] not null default '{hourly,tipped,salary}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index pto_policies_company_idx on public.pto_policies (company_id);

create table public.pto_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  policy_id uuid not null references public.pto_policies (id) on delete cascade,
  hours numeric(8, 2) not null check (hours <> 0 and abs(hours) <= 2000),
  effective_date date not null default current_date,
  reason text not null default '' check (char_length(reason) <= 200),
  created_by uuid default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index pto_adjustments_company_idx on public.pto_adjustments (company_id, employee_id);

create table public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  policy_id uuid not null references public.pto_policies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  hours numeric(8, 2) not null check (hours > 0 and hours <= 500),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  requested_by text not null default 'employee' check (requested_by in ('employee', 'client', 'firm')),
  decided_by_name text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 92)
);
create index pto_requests_company_idx on public.pto_requests (company_id, start_date);

alter table public.time_entries add column time_off jsonb not null default '{}'::jsonb check (jsonb_typeof(time_off) = 'object');

alter table public.pto_policies enable row level security;
alter table public.pto_adjustments enable row level security;
alter table public.pto_requests enable row level security;
revoke all on public.pto_policies, public.pto_adjustments, public.pto_requests from anon;
revoke truncate on public.pto_policies, public.pto_adjustments, public.pto_requests from authenticated;
grant select, insert, update, delete on public.pto_policies to authenticated;
revoke update, delete on public.pto_adjustments from authenticated;
grant select, insert on public.pto_adjustments to authenticated;
revoke delete on public.pto_requests from authenticated;
grant select, insert, update on public.pto_requests to authenticated;

create policy pto_policies_read on public.pto_policies for select to authenticated
  using (private.is_staff_of(company_id) or private.is_employee_of(company_id));
create policy pto_policies_write on public.pto_policies for all to authenticated
  using (private.is_staff_of(company_id)) with check (private.is_staff_of(company_id));

create policy pto_adjustments_read on public.pto_adjustments for select to authenticated
  using (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));
create policy pto_adjustments_insert on public.pto_adjustments for insert to authenticated
  with check (private.is_staff_of(company_id));

create policy pto_requests_read on public.pto_requests for select to authenticated
  using (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));
create policy pto_requests_insert on public.pto_requests for insert to authenticated
  with check (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));
create policy pto_requests_update on public.pto_requests for update to authenticated
  using (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()))
  with check (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));

-- 직원·정책이 같은 회사인지
create or replace function private.pto_same_company(p_company uuid, p_employee uuid, p_policy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees e where e.id = p_employee and e.company_id = p_company)
     and exists (select 1 from public.pto_policies p where p.id = p_policy and p.company_id = p_company)
$$;

-- 누가 쓴 이름 (회계법인 직원 이름 또는 회사 대표 이름)
create or replace function private.actor_name(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select f.name from public.firm_staff f where f.user_id = auth.uid()),
    (select nullif(c.owner_name, '') from public.companies c where c.id = p_company and private.is_member(p_company)),
    (select e.first_name || ' ' || e.last_name from public.employees e where e.user_id = auth.uid() and e.company_id = p_company limit 1),
    auth.jwt() ->> 'email',
    ''
  )
$$;

create or replace function private.guard_pto_adjustment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.pto_same_company(new.company_id, new.employee_id, new.policy_id) then
    raise exception 'employee and policy must belong to the company' using errcode = 'P0001';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.created_by_name := private.actor_name(new.company_id);
  return new;
end $$;
create trigger pto_adjustments_guard before insert on public.pto_adjustments
for each row execute function private.guard_pto_adjustment();

-- 신청 규칙: 직원은 본인 것만 '대기'로 신청하고, 대기 중인 것만 취소. 결정(승인·거절)은 고객사·회계법인만
create or replace function private.guard_pto_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  staff boolean := private.is_staff_of(new.company_id);
begin
  if tg_op = 'INSERT' then
    if not private.pto_same_company(new.company_id, new.employee_id, new.policy_id) then
      raise exception 'employee and policy must belong to the company' using errcode = 'P0001';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    if staff then
      new.requested_by := case when private.is_firm() then 'firm' else 'client' end;
      if new.status not in ('pending', 'approved') then
        raise exception 'new requests start pending or approved' using errcode = 'P0001';
      end if;
      if new.status = 'approved' then
        new.decided_at := now();
        new.decided_by_name := private.actor_name(new.company_id);
      else
        new.decided_at := null;
        new.decided_by_name := null;
      end if;
    else
      new.requested_by := 'employee';
      new.status := 'pending';
      new.decided_at := null;
      new.decided_by_name := null;
      new.decision_note := null;
    end if;
    return new;
  end if;

  -- UPDATE: 누가 언제 만들었는지·누구 것인지는 바뀌지 않음
  new.company_id := old.company_id;
  new.employee_id := old.employee_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.requested_by := old.requested_by;
  if not staff then
    if not (old.status = 'pending' and new.status = 'cancelled'
            and new.policy_id = old.policy_id and new.start_date = old.start_date and new.end_date = old.end_date
            and new.hours = old.hours and new.note = old.note) then
      raise exception 'employees can only cancel a pending request' using errcode = 'P0001';
    end if;
    new.decided_at := old.decided_at;
    new.decided_by_name := old.decided_by_name;
    new.decision_note := old.decision_note;
    return new;
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'denied', 'cancelled'))
            or (old.status = 'approved' and new.status = 'cancelled')) then
      raise exception 'status change % -> % not allowed', old.status, new.status using errcode = 'P0001';
    end if;
    new.decided_at := now();
    new.decided_by_name := private.actor_name(new.company_id);
  else
    new.decided_at := old.decided_at;
    new.decided_by_name := old.decided_by_name;
  end if;
  return new;
end $$;
create trigger pto_requests_guard before insert or update on public.pto_requests
for each row execute function private.guard_pto_request();

create trigger pto_policies_audit after insert or update or delete on public.pto_policies for each row execute function private.audit();
create trigger pto_adjustments_audit after insert on public.pto_adjustments for each row execute function private.audit();
create trigger pto_requests_audit after insert or update on public.pto_requests for each row execute function private.audit();
