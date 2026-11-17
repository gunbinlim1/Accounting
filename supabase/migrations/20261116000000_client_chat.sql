-- 고객 ↔ 회계법인 채팅 (처음 답변은 AI, 필요하면 회계법인 담당자에게 넘김)
-- * chat_messages: 회사별 대화. sender = client(고객) / firm(회계법인) / ai(자동 답변)
-- * chat_threads: 회사별 대화 상태 (담당자 연결 요청, 읽음 표시)
-- * 고객은 client로만, 회계법인은 firm으로만 쓸 수 있음. ai 메시지는 서버(Edge Function, service_role)만 작성
-- * 메시지는 수정·삭제 불가 (기록 보존). 회사가 삭제되면 함께 삭제
-- * 상태 변경은 RPC로만: chat_request_human / chat_return_to_ai / chat_mark_read

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sender text not null check (sender in ('client', 'firm', 'ai')),
  user_id uuid default auth.uid(),
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index chat_messages_company_idx on public.chat_messages (company_id, created_at);

create table public.chat_threads (
  company_id uuid primary key references public.companies (id) on delete cascade,
  -- 고객 또는 AI가 담당자 연결을 요청한 시각 (null = AI가 응답)
  handoff_at timestamptz,
  handoff_reason text,
  last_message_at timestamptz,
  last_sender text,
  client_read_at timestamptz,
  firm_read_at timestamptz
);

alter table public.chat_messages enable row level security;
alter table public.chat_threads enable row level security;

grant select, insert on public.chat_messages to authenticated;
grant select on public.chat_threads to authenticated;
grant select, insert on public.chat_messages to service_role;
grant select, insert, update on public.chat_threads to service_role;

create policy chat_read on public.chat_messages for select to authenticated using (private.is_staff_of(company_id));
create policy chat_insert on public.chat_messages for insert to authenticated with check (private.is_staff_of(company_id));
create policy chat_threads_read on public.chat_threads for select to authenticated using (private.is_staff_of(company_id));

-- 작성자·시각은 서버가 정함. 역할에 맞는 sender만 허용
create or replace function private.guard_chat_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  if current_user = 'service_role' then
    if new.sender <> 'ai' then
      raise exception 'server can only post ai messages' using errcode = 'P0001';
    end if;
    new.user_id := null;
    return new;
  end if;
  new.user_id := auth.uid();
  if private.is_firm() then
    if new.sender <> 'firm' then raise exception 'firm staff post as firm' using errcode = 'P0001'; end if;
    new.author_name := coalesce((select f.name from public.firm_staff f where f.user_id = auth.uid()), new.author_name);
  elsif new.sender <> 'client' then
    raise exception 'clients post as client' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger chat_message_guard before insert on public.chat_messages
for each row execute function private.guard_chat_message();

-- 새 메시지 → 대화 상태 갱신 (회계법인이 답하면 담당자 응대 중으로 유지)
create or replace function private.touch_chat_thread() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_threads (company_id, last_message_at, last_sender, client_read_at, firm_read_at)
  values (
    new.company_id, new.created_at, new.sender,
    case when new.sender = 'client' then new.created_at end,
    case when new.sender = 'firm' then new.created_at end
  )
  on conflict (company_id) do update set
    last_message_at = excluded.last_message_at,
    last_sender = excluded.last_sender,
    client_read_at = case when new.sender = 'client' then new.created_at else public.chat_threads.client_read_at end,
    firm_read_at = case when new.sender = 'firm' then new.created_at else public.chat_threads.firm_read_at end,
    handoff_at = case when new.sender = 'firm' then coalesce(public.chat_threads.handoff_at, new.created_at) else public.chat_threads.handoff_at end;
  return new;
end $$;

create trigger chat_message_touch after insert on public.chat_messages
for each row execute function private.touch_chat_thread();

-- 고객(또는 서버의 AI 판단): 회계법인 담당자 연결 요청
create or replace function public.chat_request_human(p_company_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff_of(p_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.chat_threads (company_id, handoff_at, handoff_reason)
  values (p_company_id, now(), left(p_reason, 500))
  on conflict (company_id) do update set
    handoff_at = coalesce(public.chat_threads.handoff_at, now()),
    handoff_reason = coalesce(left(p_reason, 500), public.chat_threads.handoff_reason);
end $$;

-- 회계법인: 상담을 마치고 다시 AI가 먼저 답하도록
create or replace function public.chat_return_to_ai(p_company_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_firm() then
    raise exception 'firm only' using errcode = '42501';
  end if;
  update public.chat_threads set handoff_at = null, handoff_reason = null where company_id = p_company_id;
end $$;

-- 읽음 표시 (고객/회계법인 각자)
create or replace function public.chat_mark_read(p_company_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_firm() then
    insert into public.chat_threads (company_id, firm_read_at) values (p_company_id, now())
    on conflict (company_id) do update set firm_read_at = now();
  elsif private.is_member(p_company_id) then
    insert into public.chat_threads (company_id, client_read_at) values (p_company_id, now())
    on conflict (company_id) do update set client_read_at = now();
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.chat_request_human(uuid, text), public.chat_return_to_ai(uuid), public.chat_mark_read(uuid) from public, anon;
grant execute on function public.chat_request_human(uuid, text), public.chat_return_to_ai(uuid), public.chat_mark_read(uuid) to authenticated;

-- 실시간 수신 (Supabase Realtime). 로컬 시험 DB에는 없을 수 있음
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages, public.chat_threads;
  end if;
end $$;
