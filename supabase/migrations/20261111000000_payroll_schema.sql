-- Payday 고객 포털 — Supabase 데이터베이스 구조
--
-- 원칙
-- * 모든 데이터 접근은 RLS(행 단위 보안)로 제한: 회계법인 직원 / 고객사 구성원 / 직원 본인
-- * 2단계 인증(MFA, JWT aal2)을 마친 세션만 데이터에 접근
-- * SSN·은행 계좌 전체 번호는 employee_secrets에 암호화(pgcrypto + Vault 키)해 따로 보관, 화면에는 뒤 4자리
-- * 제출된 급여는 고객이 고칠 수 없고(트리거), 상태 변경 규칙도 DB에서 강제
-- * 주요 테이블의 변경과 민감 정보 열람은 audit_log에 기록
--
-- 적용 전 준비 (Supabase SQL Editor에서 1회):
--   select vault.create_secret('<32자 이상 임의 문자열>', 'payroll_field_key');
-- 회계법인 직원 등록 (해당 사용자가 가입한 뒤):
--   insert into public.firm_staff (user_id, name, title)
--   select id, 'Jordan Lee', 'Payroll Manager' from auth.users where email = 'payroll@yourfirm.com';

create schema if not exists private;
grant usage on schema private to authenticated;

-- ───────────────────────── 테이블 ─────────────────────────

create table public.firm_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  title text,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) > 0),
  dba text not null default '',
  industry text not null check (industry in ('restaurant', 'service', 'retail', 'manufacturing')),
  tips_enabled boolean not null default false,
  ein text not null default '' check (ein = '' or ein ~ '^\d{2}-\d{7}$'),
  twc_account text not null default '',
  suta_rate numeric(7, 6) not null default 0.027 check (suta_rate >= 0 and suta_rate <= 0.1),
  deposit_schedule text not null default 'semiweekly' check (deposit_schedule in ('monthly', 'semiweekly')),
  street text not null default '',
  city text not null default '',
  state text not null default 'TX',
  zip text not null default '',
  owner_name text not null default '',
  owner_email text not null check (owner_email like '%_@_%'),
  phone text not null default '',
  cutoff_business_days int not null default 2 check (cutoff_business_days between 0 and 10),
  auth_form8655 text not null default 'pending' check (auth_form8655 in ('signed', 'pending')),
  auth_twc_agent text not null default 'pending' check (auth_twc_agent in ('signed', 'pending')),
  auth_bank_debit text not null default 'pending' check (auth_bank_debit in ('signed', 'pending')),
  -- 업로드한 회사 서류 기록 [{kind, fileName, path, uploadedAt, filled}]
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_owner_email_idx on public.companies (lower(owner_email));

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  middle_initial text check (middle_initial is null or middle_initial ~ '^[A-Z]$'),
  last_name text not null check (length(trim(last_name)) > 0),
  role text not null,
  job_title text,
  pay_type text not null check (pay_type in ('salary', 'hourly', 'tipped')),
  rate numeric(12, 2) not null check (rate >= 0),
  pretax_deferral_rate numeric(5, 4) not null default 0 check (pretax_deferral_rate between 0 and 1),
  active boolean not null default true,
  hire_date date not null,
  ssn_last4 text not null default '' check (ssn_last4 ~ '^(\d{4})?$'),
  date_of_birth date,
  email text,
  phone text,
  street text not null default '',
  city text not null default '',
  state text not null default 'TX',
  zip text not null default '',
  -- W-4 항목 {filingStatus, multipleJobs, dependentsAmount, otherIncome, deductions, extraWithholding, exempt, signedDate} (null = 미제출)
  w4 jsonb,
  -- I-9 항목과 서류 사본 기록 {citizenship, documentPath, documents:[{title, issuer, numberLast4, expires, copy:{fileName, path, uploadedAt}}], ...}
  i9 jsonb not null,
  pay_method text not null default 'client_check' check (pay_method in ('client_check', 'firm_check', 'direct_deposit')),
  bank_type text check (bank_type in ('checking', 'savings')),
  routing_last4 text not null default '',
  account_last4 text not null default '',
  -- 아래 둘은 set_employee_secrets()만 바꿈
  bank_on_file boolean not null default false,
  ssn_on_file boolean not null default false,
  e_consent boolean not null default false,
  documents jsonb not null default '[]'::jsonb,
  -- 직원 포털 로그인 계정 (claim_invites()가 연결)
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_company_idx on public.employees (company_id);
create index employees_user_idx on public.employees (user_id);
create index employees_email_idx on public.employees (lower(email));

-- SSN·계좌 전체 번호 (암호화). 직접 읽기·쓰기 불가 — 함수로만 접근
create table public.employee_secrets (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  ssn_enc bytea,
  routing_enc bytea,
  account_enc bytea,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 급여 기간별 근무·팁 입력 (고객 작성 중인 값)
create table public.time_entries (
  company_id uuid not null references public.companies (id) on delete cascade,
  pay_date date not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  regular numeric(8, 2) not null default 0 check (regular >= 0),
  overtime numeric(8, 2) not null default 0 check (overtime >= 0),
  cash_tips numeric(12, 2) not null default 0 check (cash_tips >= 0),
  card_tips numeric(12, 2) not null default 0 check (card_tips >= 0),
  -- 이번 회차만 적용하는 시급/회당 급여 (null = 직원 기본값)
  rate numeric(12, 2) check (rate is null or rate >= 0),
  fringes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, pay_date, employee_id)
);

-- 급여 회차 (상태·제출 고정본)
create table public.pay_runs (
  company_id uuid not null references public.companies (id) on delete cascade,
  pay_date date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'changes_requested', 'processed')),
  submitted_at timestamptz,
  submitted_by text,
  note text,
  note_en text,
  -- 제출 시점 고정본 {employees, time, results}
  snapshot jsonb,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, pay_date)
);

-- 처리된 회차의 직원별 계산 결과
create table public.pay_results (
  company_id uuid not null,
  pay_date date not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  entry jsonb not null,
  result jsonb not null,
  gross_pay numeric(12, 2) not null,
  net_pay numeric(12, 2) not null,
  federal_withholding numeric(12, 2) not null,
  social_security numeric(12, 2) not null,
  medicare numeric(12, 2) not null,
  employer_taxes numeric(12, 2) not null,
  primary key (company_id, pay_date, employee_id),
  foreign key (company_id, pay_date) references public.pay_runs (company_id, pay_date) on delete cascade
);
create index pay_results_employee_idx on public.pay_results (employee_id);

-- 직원별 지급 처리
create table public.payments (
  company_id uuid not null,
  pay_date date not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  method text not null check (method in ('client_check', 'firm_check', 'direct_deposit')),
  amount numeric(12, 2) not null,
  status text not null check (status in ('ready_for_client', 'check_printed', 'deposit_scheduled')),
  stub_emailed boolean not null default false,
  primary key (company_id, pay_date, employee_id),
  foreign key (company_id, pay_date) references public.pay_runs (company_id, pay_date) on delete cascade
);

-- 세금 예치·납부 기록
create table public.tax_deposits (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('federal', 'futa', 'twc')),
  period text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  status text not null check (status in ('scheduled', 'paid')),
  paid_at date,
  primary key (company_id, id)
);

-- 화면에 보이는 활동 기록
create table public.activity (
  id text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null check (actor in ('client', 'firm')),
  actor_name text not null,
  kind text not null,
  ko text not null,
  en text not null,
  user_id uuid default auth.uid()
);
create index activity_company_idx on public.activity (company_id, at desc);

-- 감사 로그 (변경·민감 정보 열람). 회계법인만 읽음
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  action text not null,
  company_id uuid,
  row_key text,
  old_row jsonb,
  new_row jsonb
);
create index audit_log_company_idx on public.audit_log (company_id, at desc);

-- ───────────────────────── 권한 판단 함수 ─────────────────────────

-- 2단계 인증을 마친 세션인지
create or replace function private.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function private.is_firm() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_aal2() and exists (select 1 from public.firm_staff f where f.user_id = auth.uid())
$$;

create or replace function private.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_aal2() and exists (
    select 1 from public.company_members m where m.company_id = cid and m.user_id = auth.uid()
  )
$$;

create or replace function private.is_staff_of(cid uuid) returns boolean
language sql stable set search_path = '' as $$
  select private.is_firm() or private.is_member(cid)
$$;

-- 직원 본인 계정의 직원 ID들
create or replace function private.my_employee_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e where private.is_aal2() and e.user_id = auth.uid()
$$;

create or replace function private.is_employee_of(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_aal2() and exists (select 1 from public.employees e where e.company_id = cid and e.user_id = auth.uid())
$$;

create or replace function private.try_uuid(v text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return v::uuid;
exception when others then
  return null;
end $$;

grant execute on all functions in schema private to authenticated;

-- ───────────────────────── 트리거 ─────────────────────────

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger companies_touch before update on public.companies for each row execute function private.touch_updated_at();
create trigger employees_touch before update on public.employees for each row execute function private.touch_updated_at();
create trigger time_entries_touch before update on public.time_entries for each row execute function private.touch_updated_at();
create trigger pay_runs_touch before update on public.pay_runs for each row execute function private.touch_updated_at();

-- 제출된 회차의 근무 입력은 고객이 바꿀 수 없음 (회계법인은 가능)
create or replace function private.guard_time_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record := coalesce(new, old);
begin
  if private.is_firm() then
    return coalesce(new, old);
  end if;
  if exists (
    select 1 from public.pay_runs p
    where p.company_id = r.company_id and p.pay_date = r.pay_date and p.status in ('submitted', 'in_review', 'processed')
  ) then
    raise exception 'pay run % is locked', r.pay_date using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger time_entries_guard before insert or update or delete on public.time_entries
for each row execute function private.guard_time_entry();

-- 급여 회차 상태 규칙: 고객은 작성 중 ↔ 제출만, 나머지는 회계법인
create or replace function private.guard_pay_run() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_firm() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') or new.approved_at is not null or new.note is not null then
      raise exception 'clients can only create draft or submitted runs' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- UPDATE
  if new.approved_at is distinct from old.approved_at then
    raise exception 'clients cannot approve runs' using errcode = 'P0001';
  end if;
  if (new.note is distinct from old.note and new.note is not null) or (new.note_en is distinct from old.note_en and new.note_en is not null) then
    raise exception 'clients cannot write review notes' using errcode = 'P0001';
  end if;
  if not (
    (old.status = new.status and old.status in ('draft', 'changes_requested'))
    or (old.status in ('draft', 'changes_requested') and new.status = 'submitted')
    or (old.status in ('submitted', 'changes_requested') and new.status = 'draft')
  ) then
    raise exception 'status change % -> % not allowed', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger pay_runs_guard before insert or update on public.pay_runs
for each row execute function private.guard_pay_run();

-- 활동 기록: 작성자 계정·시각은 서버가 정함, 고객은 'client'로만 기록
create or replace function private.guard_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.at := now();
  if not private.is_firm() and new.actor <> 'client' then
    raise exception 'clients can only log client activity' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger activity_guard before insert on public.activity
for each row execute function private.guard_activity();

-- 감사 로그
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  insert into public.audit_log (user_id, table_name, action, company_id, row_key, old_row, new_row)
  values (
    auth.uid(), tg_table_name, tg_op,
    coalesce(private.try_uuid(r ->> 'company_id'), case when tg_table_name = 'companies' then private.try_uuid(r ->> 'id') end),
    coalesce(r ->> 'id', r ->> 'employee_id', r ->> 'pay_date', r ->> 'user_id'),
    o - 'snapshot', n - 'snapshot'
  );
  return coalesce(new, old);
end $$;

create trigger companies_audit after insert or update or delete on public.companies for each row execute function private.audit();
create trigger company_members_audit after insert or update or delete on public.company_members for each row execute function private.audit();
create trigger employees_audit after insert or update or delete on public.employees for each row execute function private.audit();
create trigger pay_runs_audit after insert or update or delete on public.pay_runs for each row execute function private.audit();
create trigger pay_results_audit after insert or update or delete on public.pay_results for each row execute function private.audit();
create trigger tax_deposits_audit after insert or update or delete on public.tax_deposits for each row execute function private.audit();

-- ───────────────────────── RLS ─────────────────────────

alter table public.firm_staff enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.employees enable row level security;
alter table public.employee_secrets enable row level security;
alter table public.time_entries enable row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_results enable row level security;
alter table public.payments enable row level security;
alter table public.tax_deposits enable row level security;
alter table public.activity enable row level security;
alter table public.audit_log enable row level security;

-- Supabase 기본 권한을 지우고 필요한 것만 다시 줌
revoke all on all tables in schema public from anon, authenticated;

-- 회계법인 직원 명단: 본인 행은 MFA 전에도 읽을 수 있음 (로그인 후 역할 판단용)
grant select on public.firm_staff to authenticated;
create policy firm_staff_read on public.firm_staff for select to authenticated
  using (user_id = auth.uid() or private.is_firm());

grant select, insert, update, delete on public.companies to authenticated;
create policy companies_read on public.companies for select to authenticated
  using (private.is_staff_of(id) or private.is_employee_of(id));
create policy companies_insert on public.companies for insert to authenticated with check (private.is_firm());
create policy companies_update on public.companies for update to authenticated
  using (private.is_staff_of(id)) with check (private.is_staff_of(id));
create policy companies_delete on public.companies for delete to authenticated using (private.is_firm());

grant select, insert, delete on public.company_members to authenticated;
create policy members_read on public.company_members for select to authenticated
  using (user_id = auth.uid() or private.is_staff_of(company_id));
create policy members_insert on public.company_members for insert to authenticated with check (private.is_firm());
create policy members_delete on public.company_members for delete to authenticated using (private.is_firm());

-- 직원: bank_on_file·ssn_on_file·user_id는 함수만 바꿈 (열 단위 권한)
grant select, delete on public.employees to authenticated;
grant insert (
  id, company_id, first_name, middle_initial, last_name, role, job_title, pay_type, rate, pretax_deferral_rate, active,
  hire_date, ssn_last4, date_of_birth, email, phone, street, city, state, zip, w4, i9, pay_method, bank_type,
  routing_last4, account_last4, e_consent, documents
) on public.employees to authenticated;
grant update (
  first_name, middle_initial, last_name, role, job_title, pay_type, rate, pretax_deferral_rate, active,
  hire_date, ssn_last4, date_of_birth, email, phone, street, city, state, zip, w4, i9, pay_method, bank_type,
  routing_last4, account_last4, e_consent, documents
) on public.employees to authenticated;
create policy employees_read on public.employees for select to authenticated
  using (private.is_staff_of(company_id) or id in (select private.my_employee_ids()));
create policy employees_insert on public.employees for insert to authenticated with check (private.is_staff_of(company_id));
create policy employees_update on public.employees for update to authenticated
  using (private.is_staff_of(company_id)) with check (private.is_staff_of(company_id));
create policy employees_delete on public.employees for delete to authenticated using (private.is_firm());

-- employee_secrets: 권한 없음 (함수로만)

grant select, insert, update, delete on public.time_entries to authenticated;
create policy time_rw on public.time_entries for all to authenticated
  using (private.is_staff_of(company_id)) with check (private.is_staff_of(company_id));

grant select, insert, update, delete on public.pay_runs to authenticated;
create policy runs_read on public.pay_runs for select to authenticated using (private.is_staff_of(company_id));
create policy runs_insert on public.pay_runs for insert to authenticated with check (private.is_staff_of(company_id));
create policy runs_update on public.pay_runs for update to authenticated
  using (private.is_staff_of(company_id)) with check (private.is_staff_of(company_id));
create policy runs_delete on public.pay_runs for delete to authenticated using (private.is_firm());

grant select, insert, update, delete on public.pay_results to authenticated;
create policy results_read on public.pay_results for select to authenticated
  using (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));
create policy results_write on public.pay_results for all to authenticated
  using (private.is_firm()) with check (private.is_firm());

grant select, insert, update, delete on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (private.is_staff_of(company_id) or employee_id in (select private.my_employee_ids()));
create policy payments_write on public.payments for all to authenticated
  using (private.is_firm()) with check (private.is_firm());

grant select, insert, update, delete on public.tax_deposits to authenticated;
create policy deposits_read on public.tax_deposits for select to authenticated using (private.is_staff_of(company_id));
create policy deposits_write on public.tax_deposits for all to authenticated
  using (private.is_firm()) with check (private.is_firm());

grant select, insert on public.activity to authenticated;
create policy activity_read on public.activity for select to authenticated using (private.is_staff_of(company_id));
create policy activity_insert on public.activity for insert to authenticated with check (private.is_staff_of(company_id));

grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (private.is_firm());

-- ───────────────────────── 함수 (RPC) ─────────────────────────

-- 로그인한 대표가 자기 회사 포털을 만듦 → 회사 + 대표 구성원
create or replace function public.create_company(company jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  my_email text := auth.jwt() ->> 'email';
begin
  if auth.uid() is null or not private.is_aal2() then
    raise exception '2-step verification required' using errcode = '42501';
  end if;
  insert into public.companies (
    legal_name, dba, industry, tips_enabled, ein, twc_account, suta_rate, deposit_schedule,
    street, city, state, zip, owner_name, owner_email, phone, documents
  ) values (
    company ->> 'legal_name', coalesce(company ->> 'dba', ''), company ->> 'industry',
    coalesce((company ->> 'tips_enabled')::boolean, false), coalesce(company ->> 'ein', ''), coalesce(company ->> 'twc_account', ''),
    coalesce((company ->> 'suta_rate')::numeric, 0.027), coalesce(company ->> 'deposit_schedule', 'semiweekly'),
    coalesce(company ->> 'street', ''), coalesce(company ->> 'city', ''), coalesce(company ->> 'state', 'TX'), coalesce(company ->> 'zip', ''),
    coalesce(company ->> 'owner_name', ''), my_email, coalesce(company ->> 'phone', ''), coalesce(company -> 'documents', '[]'::jsonb)
  ) returning id into new_id;
  insert into public.company_members (company_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

-- 로그인 시 초대 연결: 대표 이메일이 같은 고객사 → 구성원, 직원 이메일이 같은 직원 → 직원 포털 계정
create or replace function public.claim_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_email text;
  n_companies int := 0;
  n_employees int := 0;
begin
  if me is null or not private.is_aal2() then
    raise exception '2-step verification required' using errcode = '42501';
  end if;
  select lower(u.email) into my_email from auth.users u where u.id = me and u.email_confirmed_at is not null;
  if my_email is null then
    return jsonb_build_object('companies', 0, 'employees', 0);
  end if;
  insert into public.company_members (company_id, user_id, role)
  select c.id, me, 'owner' from public.companies c
  where lower(c.owner_email) = my_email
  on conflict do nothing;
  get diagnostics n_companies = row_count;
  update public.employees e set user_id = me
  where lower(e.email) = my_email and e.user_id is null and e.e_consent and e.active;
  get diagnostics n_employees = row_count;
  return jsonb_build_object('companies', n_companies, 'employees', n_employees);
end $$;

-- 암호화 키 (Vault)
create or replace function private.field_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'payroll_field_key' limit 1
$$;
revoke execute on function private.field_key() from authenticated, public;

create or replace function private.is_valid_routing(r text) returns boolean
language sql immutable set search_path = '' as $$
  select r ~ '^\d{9}$' and (
    3 * (substr(r, 1, 1)::int + substr(r, 4, 1)::int + substr(r, 7, 1)::int)
    + 7 * (substr(r, 2, 1)::int + substr(r, 5, 1)::int + substr(r, 8, 1)::int)
    + (substr(r, 3, 1)::int + substr(r, 6, 1)::int + substr(r, 9, 1)::int)
  ) % 10 = 0
$$;

-- SSN·계좌 전체 번호 저장 (고객 또는 회계법인). null = 그대로 두기, '' = 지우기
create or replace function public.set_employee_secrets(
  p_employee_id uuid, p_ssn text default null, p_routing text default null, p_account text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  k text := private.field_key();
  ssn text := regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g');
  routing text := regexp_replace(coalesce(p_routing, ''), '\D', '', 'g');
  account text := regexp_replace(coalesce(p_account, ''), '[\s-]', '', 'g');
begin
  select e.company_id into cid from public.employees e where e.id = p_employee_id;
  if cid is null or not private.is_staff_of(cid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if k is null or length(k) < 16 then
    raise exception 'payroll_field_key is not set in Vault' using errcode = 'P0001';
  end if;
  if p_ssn is not null and p_ssn <> '' and ssn !~ '^\d{9}$' then
    raise exception 'SSN must be 9 digits' using errcode = '22023';
  end if;
  if p_routing is not null and p_routing <> '' and not private.is_valid_routing(routing) then
    raise exception 'invalid routing number' using errcode = '22023';
  end if;
  if p_account is not null and p_account <> '' and account !~ '^\d{4,17}$' then
    raise exception 'account number must be 4-17 digits' using errcode = '22023';
  end if;

  insert into public.employee_secrets (employee_id) values (p_employee_id) on conflict do nothing;
  update public.employee_secrets s set
    ssn_enc = case when p_ssn is null then s.ssn_enc when p_ssn = '' then null else extensions.pgp_sym_encrypt(ssn, k) end,
    routing_enc = case when p_routing is null then s.routing_enc when p_routing = '' then null else extensions.pgp_sym_encrypt(routing, k) end,
    account_enc = case when p_account is null then s.account_enc when p_account = '' then null else extensions.pgp_sym_encrypt(account, k) end,
    updated_at = now(),
    updated_by = auth.uid()
  where s.employee_id = p_employee_id;

  update public.employees e set
    ssn_last4 = case when p_ssn is null then e.ssn_last4 when p_ssn = '' then '' else right(ssn, 4) end,
    ssn_on_file = (select s.ssn_enc is not null from public.employee_secrets s where s.employee_id = p_employee_id),
    routing_last4 = case when p_routing is null then e.routing_last4 when p_routing = '' then '' else right(routing, 4) end,
    account_last4 = case when p_account is null then e.account_last4 when p_account = '' then '' else right(account, 4) end,
    bank_on_file = (select s.routing_enc is not null and s.account_enc is not null from public.employee_secrets s where s.employee_id = p_employee_id)
  where e.id = p_employee_id;
end $$;

-- 전체 번호 읽기: 회계법인만 (직접입금 파일·W-2 작성용), 열람 기록 남김
create or replace function public.get_employee_secrets(p_employee_id uuid)
returns table (ssn text, routing_number text, account_number text)
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  k text := private.field_key();
begin
  select e.company_id into cid from public.employees e where e.id = p_employee_id;
  if cid is null or not private.is_firm() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (user_id, table_name, action, company_id, row_key)
  values (auth.uid(), 'employee_secrets', 'READ', cid, p_employee_id::text);
  return query
    select
      case when s.ssn_enc is not null then extensions.pgp_sym_decrypt(s.ssn_enc, k) end,
      case when s.routing_enc is not null then extensions.pgp_sym_decrypt(s.routing_enc, k) end,
      case when s.account_enc is not null then extensions.pgp_sym_decrypt(s.account_enc, k) end
    from public.employee_secrets s where s.employee_id = p_employee_id;
end $$;

revoke execute on function public.create_company(jsonb), public.claim_invites(),
  public.set_employee_secrets(uuid, text, text, text), public.get_employee_secrets(uuid) from public, anon;
grant execute on function public.create_company(jsonb), public.claim_invites(),
  public.set_employee_secrets(uuid, text, text, text), public.get_employee_secrets(uuid) to authenticated;

-- ───────────────────────── 파일 저장소 ─────────────────────────
-- 비공개 버킷. 경로 첫 폴더 = 고객사 ID  (예: <company_id>/employees/<employee_id>/<파일>)

insert into storage.buckets (id, name, public) values ('payroll-docs', 'payroll-docs', false)
on conflict (id) do nothing;

create policy payroll_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'payroll-docs' and private.is_staff_of(private.try_uuid((storage.foldername(name))[1])));
create policy payroll_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payroll-docs' and private.is_staff_of(private.try_uuid((storage.foldername(name))[1])));
create policy payroll_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'payroll-docs' and private.is_staff_of(private.try_uuid((storage.foldername(name))[1])));
create policy payroll_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'payroll-docs' and private.is_firm());
