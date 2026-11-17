-- 채팅 기록은 수정·삭제 불가: Supabase 기본 권한(authenticated·anon 전체 권한)을 명시적으로 회수
-- (RLS에도 수정·삭제 정책이 없지만, 시도 자체를 오류로 막음)
revoke update, delete, truncate on public.chat_messages from authenticated, anon;
revoke insert, update, delete, truncate on public.chat_threads from authenticated, anon;
revoke select, insert on public.chat_messages, public.chat_threads from anon;
