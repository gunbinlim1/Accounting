-- 고객이 직접 회사 포털을 만들면 회계법인에 알림 (회계법인 초대 방식은 쓰지 않음)
-- * companies.firm_seen_at: 회계법인이 새 고객사를 확인한 시각 (null = 확인 전 → 대기열에 "새 고객사"로 표시)
-- * create_company(): 회사를 만들 때 활동 기록 "고객 포털 생성"을 남김
-- * 고객은 firm_seen_at을 바꿀 수 없음 (트리거)

alter table public.companies add column if not exists firm_seen_at timestamptz;

create or replace function private.guard_company() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_firm() then
    new.firm_seen_at := old.firm_seen_at;
  end if;
  return new;
end $$;

drop trigger if exists companies_guard on public.companies;
create trigger companies_guard before update on public.companies
for each row execute function private.guard_company();

create or replace function public.create_company(company jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  my_email text := auth.jwt() ->> 'email';
  owner text := coalesce(nullif(trim(company ->> 'owner_name'), ''), auth.jwt() ->> 'email');
  label text;
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

  select coalesce(nullif(c.dba, ''), c.legal_name) into label from public.companies c where c.id = new_id;
  insert into public.activity (id, company_id, actor, actor_name, kind, ko, en)
  values (
    'ev-portal-created-' || new_id, new_id, 'client', owner, 'settings',
    '고객 포털 생성 — 회계법인 확인 대기 (' || label || ')',
    'Client portal created — awaiting CPA review (' || label || ')'
  );
  return new_id;
end $$;

revoke execute on function public.create_company(jsonb) from public, anon;
grant execute on function public.create_company(jsonb) to authenticated;
