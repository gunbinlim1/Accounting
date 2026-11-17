-- 신고서 보관함: 회계법인이 실제 제출한 신고서 PDF(941·C-3·940·W-2·W-3 등)를 올리고 고객이 내려받음
-- * filings: 회사별 신고서 목록. 파일은 payroll-docs/<company_id>/filings/… 에 보관
-- * 회계법인만 올리기·삭제, 고객사(대표·사무 직원)는 보기·내려받기만
-- * 고객은 filings 폴더에 파일을 올리거나 덮어쓸 수 없음 (저장소 정책)
-- * 올리면 활동 기록에 "신고서 등록"이 남아 고객 홈에 보임

create table public.filings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  form text not null check (form in ('941', 'C-3', '940', 'W-2', 'W-3', '8027', 'other')),
  -- 'YYYY-Qn' (분기 신고) 또는 'YYYY' (연간 신고)
  period text not null check (period ~ '^\d{4}(-Q[1-4])?$'),
  title text not null default '',
  file_name text not null,
  path text not null,
  filed_on date,
  employee_id uuid references public.employees (id) on delete set null,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index filings_company_idx on public.filings (company_id, period desc);

alter table public.filings enable row level security;
revoke all on public.filings from anon;
revoke update, truncate on public.filings from authenticated;
grant select, insert, delete on public.filings to authenticated;

create policy filings_read on public.filings for select to authenticated using (private.is_staff_of(company_id));
create policy filings_insert on public.filings for insert to authenticated with check (private.is_firm());
create policy filings_delete on public.filings for delete to authenticated using (private.is_firm());

-- 등록자·시각은 서버가 정하고, 파일은 그 회사의 filings 폴더에 있어야 함. 고객 활동 기록에 남김
create or replace function private.guard_filing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  label text;
begin
  if not private.is_firm() then
    raise exception 'only the CPA firm can add filings' using errcode = '42501';
  end if;
  new.uploaded_by := auth.uid();
  new.created_at := now();
  if new.path not like new.company_id::text || '/filings/%' then
    raise exception 'filing file must be in the company filings folder' using errcode = 'P0001';
  end if;
  label := 'Form ' || new.form || ' ' || replace(new.period, '-', ' ');
  insert into public.activity (id, company_id, actor, actor_name, kind, ko, en)
  values (
    'ev-filing-' || new.id, new.company_id, 'firm',
    coalesce((select f.name from public.firm_staff f where f.user_id = auth.uid()), 'CPA'), 'filing',
    label || ' 신고서를 등록했어요 — 세금·신고에서 내려받을 수 있어요',
    label || ' filed — download it under Taxes'
  );
  return new;
end $$;

create trigger filing_guard before insert on public.filings
for each row execute function private.guard_filing();

create trigger filings_audit after insert or delete on public.filings
for each row execute function private.audit();

-- 저장소: filings 폴더는 회계법인만 올리기·덮어쓰기
drop policy if exists payroll_docs_insert on storage.objects;
drop policy if exists payroll_docs_update on storage.objects;
create policy payroll_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payroll-docs'
    and private.is_staff_of(private.try_uuid((storage.foldername(name))[1]))
    and (coalesce((storage.foldername(name))[2], '') <> 'filings' or private.is_firm())
  );
create policy payroll_docs_update on storage.objects for update to authenticated
  using (
    bucket_id = 'payroll-docs'
    and private.is_staff_of(private.try_uuid((storage.foldername(name))[1]))
    and (coalesce((storage.foldername(name))[2], '') <> 'filings' or private.is_firm())
  );
