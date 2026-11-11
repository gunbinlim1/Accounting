-- RLS·권한 시험: 회계법인(F) / 고객 A·B 대표 / 직원 E / 외부인(S)
-- 실행: scripts/test-db.sh  (supabase_shim.sql + 마이그레이션 적용 후)
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema test;
grant usage on schema test to authenticated;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- sql이 실패해야 통과
create function test.denied(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: expected an error: %', msg;
end $$;

-- 로그인 흉내: JWT 클레임 설정 (role 전환은 SET ROLE로)
create function test.login(uid uuid, email text, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', aal, 'role', 'authenticated')::text, false)
$$;
grant execute on all functions in schema test to authenticated;

-- 사용자·키 준비 (관리자)
insert into vault.secrets (name, secret) values ('payroll_field_key', 'test-key-0123456789abcdef-0123456789');
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000f', 'payroll@firm.example', now()),
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@a.example', now()),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@b.example', now()),
  ('00000000-0000-0000-0000-00000000000e', 'emp@mail.example', now()),
  ('00000000-0000-0000-0000-000000000005', 'stranger@x.example', now());
insert into public.firm_staff (user_id, name, title) values ('00000000-0000-0000-0000-00000000000f', 'Jordan Lee', 'Payroll Manager');

-- ── 고객 A: 포털 생성
select test.login('00000000-0000-0000-0000-00000000000a', 'owner-a@a.example');
set role authenticated;
create temp table ids as select public.create_company('{"legal_name":"A Foods LLC","dba":"A Cafe","industry":"restaurant","tips_enabled":true,"ein":"12-3456789"}'::jsonb) as ca;
grant select on ids to authenticated;
select test.ok((select count(*) = 1 from public.companies), 'A sees only its own company');
select test.ok((select owner_email = 'owner-a@a.example' from public.companies), 'owner email comes from the login, not the form');
select test.ok((select count(*) = 1 from public.activity where kind = 'settings' and ko like '고객 포털 생성%'), 'portal creation is logged for the firm');
select test.ok((select firm_seen_at is null from public.companies), 'a new portal starts unseen by the firm');
update public.companies set firm_seen_at = now();
select test.ok((select firm_seen_at is null from public.companies), 'client cannot mark its own portal as seen');

-- MFA 전(aal1)에는 아무것도 못 봄
select test.login('00000000-0000-0000-0000-00000000000a', 'owner-a@a.example', 'aal1');
select test.ok((select count(*) = 0 from public.companies), 'no data before 2-step verification');
select test.denied($$select public.create_company('{"legal_name":"X","industry":"retail"}'::jsonb)$$, 'cannot create a company before 2-step verification');
select test.ok((select count(*) = 0 from public.firm_staff), 'A is not firm staff');
select test.login('00000000-0000-0000-0000-00000000000a', 'owner-a@a.example');

-- 직원 등록
insert into public.employees (id, company_id, first_name, last_name, role, pay_type, rate, hire_date, i9, email, e_consent, pay_method)
values ('00000000-0000-0000-0000-0000000000e1', (select ca from ids), 'Maria', 'Lopez', 'server', 'tipped', 2.13, '2026-01-05',
        '{"citizenship":"citizen","documentPath":"BC","documents":[]}', 'emp@mail.example', true, 'direct_deposit'),
       ('00000000-0000-0000-0000-0000000000e2', (select ca from ids), 'Tony', 'Vo', 'busser', 'tipped', 2.13, '2026-02-02',
        '{"citizenship":"citizen","documentPath":"BC","documents":[]}', null, false, 'client_check');
select test.ok((select count(*) = 2 from public.employees), 'A adds two employees');
select test.denied($$update public.employees set bank_on_file = true$$, 'A cannot set bank_on_file directly');
select test.denied($$update public.employees set user_id = auth.uid()$$, 'A cannot link employee accounts directly');

-- 민감 정보
select test.denied($$select public.set_employee_secrets('00000000-0000-0000-0000-0000000000e1', null, '111000026', '123456789')$$, 'bad routing checksum rejected');
select public.set_employee_secrets('00000000-0000-0000-0000-0000000000e1', '123-45-6789', '111000025', '4000123456');
select test.ok((select bank_on_file and ssn_on_file and routing_last4 = '0025' and account_last4 = '3456' and ssn_last4 = '6789'
                from public.employees where id = '00000000-0000-0000-0000-0000000000e1'), 'secrets saved, last 4 shown, flags set');
select test.denied($$select * from public.employee_secrets$$, 'A cannot read the encrypted table');
select test.denied($$select * from public.get_employee_secrets('00000000-0000-0000-0000-0000000000e1')$$, 'A cannot decrypt full numbers');

-- 근무 입력 → 제출 → 잠금
insert into public.time_entries (company_id, pay_date, employee_id, regular, overtime, cash_tips, card_tips)
values ((select ca from ids), '2026-11-13', '00000000-0000-0000-0000-0000000000e1', 60, 2, 300, 800);
insert into public.pay_runs (company_id, pay_date, status, submitted_by, snapshot)
values ((select ca from ids), '2026-11-13', 'submitted', 'Owner A', '{}');
select test.denied($$update public.time_entries set regular = 70$$, 'time entries locked after submit');
select test.denied($$update public.pay_runs set status = 'processed'$$, 'client cannot mark processed');
select test.denied($$update public.pay_runs set status = 'in_review'$$, 'client cannot start review');
select test.denied($$update public.pay_runs set approved_at = now()$$, 'client cannot approve');
update public.pay_runs set status = 'draft', snapshot = null;
select test.ok((select status = 'draft' from public.pay_runs), 'client can recall a submitted run');
update public.time_entries set regular = 72;
-- 앱은 upsert(INSERT … ON CONFLICT DO UPDATE)로 저장: 삽입·수정 트리거가 모두 통과해야 함
insert into public.time_entries (company_id, pay_date, employee_id, regular) values ((select ca from ids), '2026-11-13', '00000000-0000-0000-0000-0000000000e1', 73)
  on conflict (company_id, pay_date, employee_id) do update set regular = excluded.regular;
insert into public.pay_runs (company_id, pay_date, status, submitted_by, note) values ((select ca from ids), '2026-11-13', 'submitted', 'Owner A', null)
  on conflict (company_id, pay_date) do update set status = excluded.status, submitted_by = excluded.submitted_by, note = excluded.note;
select test.ok((select status = 'submitted' from public.pay_runs), 'client submits through upsert');
select test.denied($$insert into public.pay_runs (company_id, pay_date, status) values ((select ca from ids), '2026-11-13', 'processed') on conflict (company_id, pay_date) do update set status = excluded.status$$, 'client cannot upsert a processed run');

-- 활동 기록
select test.denied($$insert into public.activity (id, company_id, actor, actor_name, kind, ko, en) values ('x1', (select ca from ids), 'firm', 'A', 'submit', 'k', 'e')$$, 'client cannot log as firm');
insert into public.activity (id, company_id, actor, actor_name, kind, ko, en, at, user_id)
values ('a1', (select ca from ids), 'client', 'Owner A', 'submit', '제출', 'Submitted', '2000-01-01', '00000000-0000-0000-0000-000000000005');
select test.ok((select user_id = auth.uid() and at > '2020-01-01' from public.activity where id = 'a1'), 'activity author and time set by the server');

-- 파일 저장소
insert into storage.objects (bucket_id, name) values ('payroll-docs', (select ca from ids)::text || '/employees/e1/dl.pdf');
select test.denied($$insert into storage.objects (bucket_id, name) values ('payroll-docs', '11111111-1111-1111-1111-111111111111/x.pdf')$$, 'cannot upload into another company folder');
select test.denied($$insert into storage.objects (bucket_id, name) values ('payroll-docs', 'not-a-uuid/x.pdf')$$, 'cannot upload outside a company folder');
select test.ok((select count(*) = 0 from public.audit_log), 'A cannot read the audit log');
delete from public.companies;  -- RLS: 0행 (오류 없이 무시)
reset role;
select test.ok((select count(*) = 1 from public.companies), 'A could not delete its company');

-- ── 고객 B
select test.login('00000000-0000-0000-0000-00000000000b', 'owner-b@b.example');
set role authenticated;
insert into ids select public.create_company('{"legal_name":"B Parts Inc.","industry":"manufacturing"}'::jsonb);
select test.ok((select count(*) = 1 from public.companies), 'B sees only its own company');
select test.ok((select count(*) = 0 from public.employees), 'B sees none of A''s employees');
select test.ok((select count(*) = 0 from public.pay_runs), 'B sees none of A''s runs');
select test.denied($$insert into public.employees (company_id, first_name, last_name, role, pay_type, rate, hire_date, i9) values ((select ca from ids limit 1), 'X', 'Y', 'production', 'hourly', 16, '2026-01-01', '{}')$$, 'B cannot add employees to A');
select test.denied($$select public.set_employee_secrets('00000000-0000-0000-0000-0000000000e1', null, null, '999999999')$$, 'B cannot write A''s employee secrets');
reset role;

-- ── 외부인
select test.login('00000000-0000-0000-0000-000000000005', 'stranger@x.example');
set role authenticated;
select test.ok((select count(*) = 0 from public.companies) and (select count(*) = 0 from public.employees), 'a stranger sees nothing');
reset role;

-- ── 회계법인
select test.login('00000000-0000-0000-0000-00000000000f', 'payroll@firm.example');
set role authenticated;
select test.ok((select count(*) = 2 from public.companies), 'firm sees every client');
select test.ok((select count(*) = 2 from public.companies where firm_seen_at is null), 'firm sees both new clients as unseen');
update public.companies set firm_seen_at = now() where legal_name = 'A Foods LLC';
select test.ok((select firm_seen_at is not null from public.companies where legal_name = 'A Foods LLC'), 'firm marks a new client as seen');
update public.pay_runs set status = 'changes_requested', note = 'OT 확인', note_en = 'Check OT';
reset role;
select test.login('00000000-0000-0000-0000-00000000000a', 'owner-a@a.example');
set role authenticated;
select test.denied($$update public.pay_runs set note = 'hide it'$$, 'client cannot rewrite the firm''s note');
insert into public.pay_runs (company_id, pay_date, status, note, note_en) values ((select ca from ids limit 1), '2026-11-13', 'submitted', null, null)
  on conflict (company_id, pay_date) do update set status = excluded.status, note = excluded.note, note_en = excluded.note_en;
select test.ok((select status = 'submitted' and note is null from public.pay_runs), 'client resubmits after changes requested');
reset role;
select test.login('00000000-0000-0000-0000-00000000000f', 'payroll@firm.example');
set role authenticated;
update public.pay_runs set status = 'in_review';
update public.pay_runs set status = 'processed', approved_at = now();
insert into public.pay_results (company_id, pay_date, employee_id, entry, result, gross_pay, net_pay, federal_withholding, social_security, medicare, employer_taxes)
select (select ca from ids limit 1), '2026-11-13', id, '{}', '{}', 1000, 800, 50, 62, 14.5, 90 from public.employees where company_id = (select ca from ids limit 1);
insert into public.payments (company_id, pay_date, employee_id, method, amount, status)
values ((select ca from ids limit 1), '2026-11-13', '00000000-0000-0000-0000-0000000000e1', 'direct_deposit', 800, 'deposit_scheduled');
select test.ok((select ssn = '123456789' and routing_number = '111000025' and account_number = '4000123456'
                from public.get_employee_secrets('00000000-0000-0000-0000-0000000000e1')), 'firm decrypts full numbers');
select test.ok((select count(*) = 1 from public.audit_log where table_name = 'employee_secrets' and action = 'READ'), 'secret reads are logged');
select test.ok((select count(*) > 5 from public.audit_log), 'firm reads the audit log');
reset role;

-- ── 직원 E: 초대 연결 후 본인 것만
select test.login('00000000-0000-0000-0000-00000000000e', 'emp@mail.example');
set role authenticated;
select test.ok((select count(*) = 0 from public.employees), 'employee sees nothing before claiming');
select test.ok((select (public.claim_invites() ->> 'employees')::int = 1), 'employee account linked by email');
select test.ok((select count(*) = 1 from public.employees), 'employee sees only their own record');
select test.ok((select count(*) = 1 from public.pay_results), 'employee sees only their own pay results');
select test.ok((select count(*) = 1 from public.payments), 'employee sees their payment');
select test.ok((select count(*) = 0 from public.pay_runs), 'employee cannot see run snapshots (other people''s pay)');
select test.ok((select count(*) = 0 from public.time_entries), 'employee cannot see time entries');
select test.ok((select count(*) = 1 from public.companies), 'employee sees their employer only');
update public.employees set rate = 50;  -- RLS: 0행
reset role;
select test.ok((select rate = 2.13 from public.employees where id = '00000000-0000-0000-0000-0000000000e1'), 'employee pay unchanged');

-- ── 회계법인이 고객 삭제
select test.login('00000000-0000-0000-0000-00000000000f', 'payroll@firm.example');
set role authenticated;
delete from public.companies where legal_name = 'B Parts Inc.';
select test.ok((select count(*) = 1 from public.companies), 'firm deletes a client');
reset role;

select 'ALL RLS TESTS PASSED' as result;
