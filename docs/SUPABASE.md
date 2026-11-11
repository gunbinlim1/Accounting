# Supabase 연결 가이드

포털은 Supabase(PostgreSQL + 인증 + 파일 저장소)를 데이터베이스로 씁니다. 아래 순서대로 한 번 설정하면 됩니다.

## 1. 프로젝트 만들기

1. https://supabase.com 에서 새 프로젝트 생성 (지역: 미국 — 예 `us-east-1`).
2. 실제 직원 정보(SSN·계좌)를 다루기 전에 **유료 플랜**과 백업(PITR), 그리고 Supabase와의 데이터 처리 계약(DPA)을 검토하세요.

## 2. 데이터베이스 구조 적용

SQL Editor에서 `supabase/migrations/` 폴더의 파일을 이름 순서대로 실행합니다.
(Supabase CLI를 쓰면 `supabase link` 후 `supabase db push`.)

이어서 **암호화 키**를 Vault에 한 번 저장합니다. SSN·계좌번호 암호화에 쓰이며, 잃어버리면 저장된 번호를 복구할 수 없습니다.

```sql
select vault.create_secret('<32자 이상 임의 문자열>', 'payroll_field_key');
```

## 3. 인증 설정 (Authentication)

- **Providers → Email**: 켜기, *Confirm email* 켜기.
- **Multi-Factor**: TOTP(인증 앱) 켜기 — 포털은 2단계 인증을 마친 세션만 데이터에 접근할 수 있게 DB에서 막혀 있습니다.
- **URL Configuration**:
  - Site URL: `https://gunbinlim1.github.io/Accounting/`
  - Redirect URLs: `https://gunbinlim1.github.io/Accounting/login` (로컬 개발 시 `http://localhost:5173/login`도 추가)
- 비밀번호 최소 길이: 10 이상 권장.
- 실제 운영 전에는 **SMTP**(Authentication → Emails)를 회계법인 도메인 메일로 바꾸세요. 기본 메일은 발송량 제한이 있습니다.

## 4. 회계법인 직원 등록

회계법인 직원은 먼저 포털의 "초대받은 계정 만들기"로 가입한 뒤, SQL Editor에서 한 번 등록합니다.

```sql
insert into public.firm_staff (user_id, name, title)
select id, 'Jordan Lee', 'Payroll Manager' from auth.users where email = 'payroll@yourfirm.com';
```

## 5. 포털에 연결 정보 넣기

Project Settings → API에서 **Project URL**과 **anon(public) 키**를 복사합니다.
`service_role` 키는 어디에도 넣지 마세요 (모든 보안 규칙을 우회합니다).

- GitHub Pages 배포: 저장소 Settings → Secrets and variables → Actions → **Variables**에
  - `SUPABASE_URL` = Project URL
  - `SUPABASE_ANON_KEY` = anon 키
  - `FIRM_NAME` = 로그인 화면에 보일 회계법인 이름
  를 추가하고 `main`에 푸시(또는 Deploy 워크플로 수동 실행)하면 됩니다.
- 로컬 개발: `.env.example`을 `.env.local`로 복사해 값을 넣고 `npm run dev`.

## 계정 흐름

| 누구 | 시작 방법 | 연결 |
|---|---|---|
| 고객사 대표 (직접) | "새 회사 급여 포털 만들기" → 이메일 인증 → 로그인 → 인증 앱 등록 | 회사가 만들어지고 대표로 연결 |
| 고객사 대표 (회계법인이 추가) | 회계법인이 "새 고객사"에 대표 이메일 입력 → 대표가 "초대받은 계정 만들기"로 같은 이메일 가입 | 로그인 시 자동 연결 |
| 직원 | 대표가 직원 정보에 이메일 + 전자 수령 동의 → 직원이 같은 이메일로 가입 | 로그인 시 본인 기록만 연결 |
| 회계법인 | 가입 후 4번 SQL로 등록 | 모든 고객사 |

## 보안 구조 요약

- 모든 테이블에 RLS: 회계법인은 전체, 고객은 자기 회사, 직원은 본인 기록과 급여 결과만.
- 2단계 인증(aal2)을 마치지 않은 세션은 어떤 데이터도 읽거나 쓸 수 없음.
- SSN·라우팅·계좌 전체 번호는 `employee_secrets`에 pgcrypto로 암호화(키는 Vault). 고객은 저장만 가능, 읽기는 회계법인만(`get_employee_secrets`, 열람 기록 남음). 화면에는 뒤 4자리.
- 제출된 급여 회차는 고객이 고칠 수 없음(트리거). 고객은 작성 중 ↔ 제출만, 검토·수정 요청·처리는 회계법인만.
- 서류 파일(W-4·I-9·신분증 사본·SS-4·TWC)은 비공개 버킷 `payroll-docs/<회사 ID>/…`, 같은 회사 구성원과 회계법인만 접근. 링크는 5분짜리 서명 URL.
- 주요 테이블의 모든 변경은 `audit_log`에 기록(회계법인만 열람).

## 시험

`scripts/test-db.sh` — 로컬 PostgreSQL에 Supabase 흉내(`supabase/tests/supabase_shim.sql`)와 마이그레이션을 적용하고 권한 시험(`supabase/tests/rls_test.sql`)을 돌립니다. GitHub Actions CI에서도 실행됩니다.
