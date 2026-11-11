# CLAUDE.md — Payday 고객 포털 (작업 인수인계)

새 세션은 이 파일부터 읽으세요. 지금까지의 대화·결정·구조·남은 일을 정리한 것입니다. (마지막 정리: 2026-11-11, 배포 커밋 `c324128`)

## 사용자·목적
- 사용자: 텍사스 CPA 회계법인 **Jae Jin Yang CPA PC** (담당 Gunbin Lim, gunbin.lim@yangdeancpa.com). **응답은 한국어.** 비개발자이므로 설명은 쉬운 말로, 할 일은 단계별로.
- 고객: 레스토랑뿐 아니라 서비스업·도소매업·생산·제조업 회사 전반.
- 목표: 고객사가 포털에서 계정을 만들고 회사 포털을 열어 직원(W-4·I-9)과 급여(근무·팁·Fringe)를 입력·제출 → 회계법인이 검토·처리·지급·세금 납부·분기/연말 신고(941, TWC C-3, 940, W-2) → 고객은 내역·세금 안내 확인, 직원은 명세서·W-2 열람.
- 기획서(Claude Docs): https://claude.ai/artifact/1iHDZw1zgqF1zqD5sWPC7z — 업종 무관하게 갱신됨(업종별 급여 구성 섹션, 기능 0~10, 보안, 결정 필요 사항). 열린 댓글: PEO 용도 확인. Supabase 전환·가입 구조 변경은 아직 기획서에 반영 안 됨.

## 운영 중인 것 (주소·계정)
| 항목 | 값 |
|---|---|
| 정식 사이트 | **Vercel `jae-jin-yang-cpa-pc/accounting` 프로젝트 Production** (`main` 푸시 → 자동 배포). 사용자 확인 결과 최신 배포 정상 표시됨. 정확한 도메인은 Vercel → Domains (예상 `accounting-jae-jin-yang-cpa-pc.vercel.app`) |
| 미리보기 | 브랜치마다 `accounting-git-<브랜치>-jae-jin-yang-cpa-pc.vercel.app` |
| 배포 확인 | 로그인 화면 왼쪽 아래 `production <커밋7자리>` 표시 (`vite.config.ts` define: VERCEL_ENV·VERCEL_GIT_COMMIT_SHA) |
| 저장소 | https://github.com/gunbinlim1/Accounting (공개). 작업 브랜치 `claude/serene-noether-jl1r8o`, **사용자 승인 흐름으로 `main`에 직접 푸시해 옴** (같은 커밋을 브랜치와 main 둘 다 푸시 → Vercel 배포 2건씩 생김) |
| GitHub Pages | `deploy.yml`은 수동 실행만. github.io에는 옛 데모가 남아 있음(사용자에게 Pages 끄기 권함) |
| Supabase | 프로젝트 `payday-portal`, ID **`mvnixlpissdrioivjqjy`**, us-east-1, **무료 플랜**, 조직 "Jae Jin Yang CPA PC". URL https://mvnixlpissdrioivjqjy.supabase.co. publishable 키는 `.env.production`(공개용 값) |
| Supabase 접근 | **Supabase 커넥터(MCP)** 로 SQL·마이그레이션·로그·advisor 가능 (`mcp__Supabase__*`, ToolSearch로 불러옴). 대시보드 설정(메일 템플릿·URL 설정)은 커넥터로 못 바꿈 → 사용자가 함 |
| 회계법인 직원 | **Gunbin Lim** (gunbin.lim@yangdeancpa.com) — 2026-11-11 `firm_staff` 등록, 직함 비어 있음. 아직 인증 앱(MFA) 등록·첫 로그인 전 |
| 고객사 | 아직 0곳 (실제 데이터 없음) |

## 사용자가 해야 할 일 (진행 상태)
1. ✅ Supabase 인증 URL 설정(Site URL = Vercel 본 사이트, Redirect URLs `https://*-jae-jin-yang-cpa-pc.vercel.app/**`) — 02:30~02:31 설정 변경 기록 있음, 가입 메일 링크 정상 작동 확인.
2. ⬜ **메일 템플릿 변경** (Authentication → Email Templates, https://supabase.com/dashboard/project/mvnixlpissdrioivjqjy/auth/templates):
   - Confirm signup 링크 → `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">이메일 인증하기 / Confirm your email</a>`
   - Reset password 링크 → 같은 형식, `type=recovery`
   - 이유: 회사 메일 보안 검사(Outlook 안전한 링크 등)가 링크를 미리 열어 가입 21초 만에 인증이 자동 처리된 사례 발생. 포털 `/auth/confirm`은 버튼을 눌러야 인증됨.
3. ⬜ `/firm/login`으로 로그인 → 인증 앱 QR 등록 → 회계법인 대기열 확인.
4. ⬜ 다른 이메일로 고객 "계정 만들기" 전체 흐름 시험 → 회계법인 대기열 "새로 가입한 고객사" 알림 확인 (Supabase 기록으로 같이 점검).
5. ⬜ (권장) 실제 직원 정보 입력 전: Supabase 유료(Pro) 전환·백업, SMTP를 회계법인 도메인 메일로, GitHub Pages 끄기, Vercel에 같은 저장소가 2개 프로젝트로 연결됐는지 확인.

## 제안해 두고 답 기다리는 것
- **회계법인 관리자 화면**: 가입 대기 중인 회계법인 직원 계정을 포털 안에서 승인·해제 (지금은 SQL 또는 Claude가 커넥터로만 등록 가능).
- **새 고객사 이메일 알림**: 지금은 회계법인 화면 알림만. 이메일은 Database Webhook/Edge Function + 메일 서비스(예: Resend) 키·받을 주소 필요.
- 고객 로그인 화면의 "직원이신가요? 급여명세서 보기 계정 만들기" 링크 유지 여부(사용자가 원하면 제거).

## 가입·로그인 구조 (사용자 결정)
- **회계법인이 고객을 초대하는 방식은 쓰지 않음.** 고객 로그인 화면엔 "새 회사 급여 포털 만들기" 버튼 없음.
- 고객사(대표 또는 직원): `/login` → **"계정 만들기"**(`/signup` = `Register variant="client"`, 이메일·비밀번호만, `user_metadata.intent='client'`, 4단계 안내) → 이메일 인증 → 로그인·인증 앱(TOTP) 등록 → 회사가 없으면 자동으로 **`/setup` 회사 포털 만들기**(`CompanySetup mode="client"`: 업종 → 급여 구성 → 회사 정보 → 확인, 로그인한 계정으로 `create_company`, SS-4·TWC 파일 업로드 보관) → 홈. **계정 먼저, 회사 포털은 그다음** (사용자 결정).
- `create_company`가 활동 기록 "고객 포털 생성"을 남기고 `companies.firm_seen_at`이 null → 회계법인 대기열 상단 **"새로 가입한 고객사"** → "확인함"(firm만 변경 가능, 트리거로 강제).
- **회계법인 전용 로그인 `/firm/login`** (firm_staff가 아니면 "회계법인 계정이 아니에요"), 직원 계정 만들기 `/firm/register`(intent firm) → 이메일 인증 → SQL로 `firm_staff` 등록. `/firm` 미로그인 시 `/firm/login`으로.
- `/register`(intent employee): 급여명세서 보는 고객사 직원용. 대표가 직원 정보에 넣은 이메일 + 전자 수령 동의 → 로그인 시 `claim_invites`로 본인 기록 연결.
- 로그인 흐름: 이메일+비밀번호 → 인증 앱 등록/코드(필수) → `claim_invites` → 역할 판단(firm_staff → 회계법인 / company_members → 고객 / employees.user_id → 직원 / 없음 → intent client면 `/setup`).
- 메일 링크 착지 `/auth/confirm` (버튼 → `verifyOtp`) → `next`가 `/firm/login`이면 그쪽, 아니면 `/login`.
- 회계법인 직원 등록 SQL:
  `insert into public.firm_staff (user_id, name, title) select id, '<이름>', '<직함>' from auth.users where email = '<이메일>' and email_confirmed_at is not null;`

## 데이터·보안 구조 (Supabase)
- 마이그레이션(둘 다 실제 프로젝트에 적용됨): `supabase/migrations/20261111000000_payroll_schema.sql`, `20261111010000_client_signup_notice.sql`. 새 DB 변경은 파일로 추가하고 `mcp__Supabase__apply_migration`으로 적용.
- 테이블: companies(+firm_seen_at), company_members, firm_staff, employees, employee_secrets(암호화), time_entries, pay_runs, pay_results, payments, tax_deposits, activity, audit_log, 비공개 버킷 `payroll-docs/<company_id>/…`.
- RLS: 회계법인 전체 / 고객 자기 회사 / 직원 본인 기록·급여 결과만(스냅샷·근무 입력은 못 봄). **모든 접근 MFA(aal2) 필수.** 고객 상태 변경(작성 중↔제출만)·제출 잠금·활동 기록 작성자·firm_seen_at은 트리거로 강제. 주요 변경은 audit_log.
- SSN·라우팅·계좌 전체 번호: `set_employee_secrets` RPC로 pgcrypto 암호화(키 = Vault `payroll_field_key`, 서버에서 생성, 값은 어디에도 출력 안 함 — **잃으면 복구 불가**). 읽기는 회계법인만 `get_employee_secrets`(열람 기록). 화면엔 뒤 4자리·`onFile`.
- Supabase security advisor 경고 5건은 의도된 설계(employee_secrets 정책 없음 = 직접 접근 차단, SECURITY DEFINER RPC 4개는 함수 안에서 권한 확인).
- 앱 데이터 흐름: `src/portal.tsx`(인증 상태·불러오기·저장 대기열) → 화면은 `updateCompany(id, fn)`으로 CompanyData를 고침 → `src/lib/db/plan.ts`가 바뀐 부분을 순서 있는 DB 쓰기 목록으로(제출 시 근무 입력 먼저, 취소 시 상태 먼저) → `src/lib/db/api.ts` 실행(근무 입력은 0.6초 모아서). 실패하면 DB 기준으로 다시 불러옴. 행↔객체 변환 `src/lib/db/mappers.ts`. 설정 없으면 `SetupNeeded` 화면.
- 데모 데이터·브라우저 저장은 제거됨(사용자 결정). 테스트용 가상 직원만 `src/test/`.

## 핵심 업무 결정
- **신고 방식: 회계법인 = Reporting Agent(Form 8655)**, 고객 EIN으로 941·940, 텍사스 C-3는 TWC 대리인 권한, 세금은 고객 계좌 인출. PEO는 공동고용이 아닌 납부·직접입금 대행 채널로만 쓴다고 가정(사용자 확인 대기).
- **업종별 포털**: `Company.industry`(restaurant·service·retail·manufacturing), `Company.tipsEnabled`. `src/config/industries.ts`(직무 템플릿, `rolesFor`, `receivesTips`, `defaultTimeFor`). 도소매·제조는 팁 불가, 레스토랑 팁 기본 켬, 서비스업 선택. 팁 꺼지면 팁 직무·팁 칸 숨김. '기타' 직무 + 직함(`jobTitle`, 표시 `jobLabel`). 회사 정보에서 업종 변경 가능(팁 직원 있으면 팁 끄기 막음).
- **직원 이름 성·이름 분리**: `lastName`·`firstName`·`middleInitial?` (`src/lib/names.ts`: `fullName`, `sortName`, `compareByName`, `splitName`). CSV는 Last/First/MI.
- **회사 서류 자동 입력**: SS-4(EIN 기재 사본)·CP 575·147C → EIN·법인명·상호·주소, TWC Liability Letter → 계정번호·세율 (`src/lib/companyDocs.ts`, pdfjs-dist + pdf-lib). 스캔본은 2단계 AI.
- **IRS 예치 주기 기본값 반주별(semiweekly)**.
- **직접입금**: 라우팅 9자리(ABA 체크섬)·계좌 전체 + 확인 입력 필수 (`src/lib/bank.ts`). 새 직원은 SSN 9자리 필수(W-2용).
- **I-9 사본 업로드 필수**: 기본 운전면허증(List B)+사회보장카드(List C), 다른 서류 제시 시 바꿔서 그 사본 — 특정 서류 강요는 차별(document abuse) 소지라 화면 안내 유지(법률 검토 권함).
- 텍사스(주 소득세 없음), FICA, FUTA 0.6%/$7,000, TWC 기본 2.7%/$9,000. 연방 원천징수 2026 Pub 15-T 연간 퍼센트 방식(표준공제 16,100/32,200/24,150, Rev. Proc. 2025-32).
- 레스토랑 팁: 현금시급 $2.13, 팁 크레딧 최대 $5.12, 팁 OT = $7.25×1.5−크레딧, $7.25 미달 자동 보전, 현금 팁 과세·입금 제외, 미징수 FICA는 W-2 12 A/B, 45B 추정.
- Fringe 규칙표 `src/config/fringeBenefits.ts`(13개) — **한도·코드는 운영 전 2026 Pub 15-B와 대조 필요.**
- 서류 문제는 급여 승인을 막지 않음(critical = 최저 시급 미달·연봉 $0 등 계산 오류만).
- 회차별 시급 변경(`TimeEntry.rate`), 제출 시 스냅샷 고정, 마감 지급일 2영업일 전 오후 3시, 격주 금요일(기준일 2026-01-09).
- 디자인: Gusto는 흐름만 참고(이름·로고·색 금지), 직원 목록은 리스트, 급여 실행은 표 입력 + 검토·제출 2단계.
- **모든 화면 한국어·영어** (`usePrefs().t(ko, en)`, 첫 방문은 브라우저 언어, 데이터 문구는 ko/en 쌍).

## 코드 구조
- React 19 + TypeScript + Vite + react-router 7, lucide-react, vitest, oxlint, @supabase/supabase-js, pdfjs-dist, pdf-lib, read-excel-file.
- 페이지: 공개 `/login` `/signup`(고객 계정) `/register`(직원 계정) `/firm/login` `/firm/register` `/auth/confirm` · 로그인 후 `/setup`(회사 포털 만들기) · 고객 `/` `/run` `/employees` `/employees/new|:id` `/history` `/taxes` `/company` `/simulator` · 회계법인 `/firm`(대기열·새 고객사 알림) `/firm/settings` `/firm/c/:id`(+`/taxes` `/history`, "고객사 삭제" 버튼) · 직원 `/me`.
- `src/store.tsx`: `CompanyProvider`/`useStore()` (제출/취소/검토/수정요청/처리/납부/위임 서명). `src/lib`: payroll·federalWithholding·taxes·payments·checks·compliance·docExtract·companyDocs·bank·names·ytd·compute·csv.
- `vercel.json`: SPA rewrites + 보안 헤더. `.env.production`: Supabase URL·publishable 키. `docs/SUPABASE.md`: 설정 가이드(사용자용, 한국어).

## 작업 방법
- 확인: `npm run lint && npm test && npm run build` (단위 테스트 58개). DB 권한 시험: `scripts/test-db.sh`(로컬 PostgreSQL + `supabase/tests/supabase_shim.sql` + `rls_test.sql`, 52개, CI `database` 잡에서도 실행).
- 로컬 PostgreSQL: `/usr/lib/postgresql/16/bin`, 데이터 `/var/lib/postgresql/paydaytest` (postgres 사용자로 `pg_ctl ... -o '-p 54329 -k <dir>' start`, 컨테이너 재시작 시 다시 켜야 함). `PGHOST=/var/lib/postgresql/paydaytest PGPORT=54329 PGUSER=postgres scripts/test-db.sh`.
- 실제 Supabase에서 권한 시험: `rls_test.sql` 내용을 `begin;`으로 감싸고 마지막에 `raise exception`으로 롤백해 `execute_sql`로 실행(남는 데이터 없음 확인).
- 화면 확인: 가짜 설정으로 빌드(`VITE_SUPABASE_URL=http://127.0.0.1:59999 VITE_SUPABASE_ANON_KEY=dummy npx vite build --mode test`, `BASE_PATH=/Accounting/`) 후 `npx vite preview --port 4173` + Playwright. 실제 로그인 흐름은 이 환경에서 시험 불가.
- **이 셸 환경에서 막힌 것**: `*.supabase.co`, `vercel.app`/`vercel.com`, `github.io`, `irs.gov` 접속, GitHub Actions 변수 API, 외부 바이너리 다운로드(PostgREST 등). → Vercel 배포 결과는 `gh api repos/gunbinlim1/Accounting/commits/<sha>/statuses`, CI는 `gh run list -R gunbinlim1/Accounting`, Supabase는 커넥터(SQL·`query_logs`)로 확인.
- Claude in Chrome: 사용자가 Edge에 설치함. 이 클라우드 세션에서는 연결 불가 → 대시보드 작업은 단계별 안내 + 확장 프로그램에 붙여 넣을 문장 제공.
- 복잡한 셸 heredoc은 안전 검사에 막힐 수 있음 → 스크래치패드에 파이썬 패치 스크립트를 쓰고 실행.
- 커밋 메시지·코드에 모델 이름 넣지 않기. 푸시 후 브랜치와 main 모두 원격과 맞추기(Stop hook이 미푸시 커밋을 검사함).

## 사용자 결정 대기 (오래된 것)
1. PEO 계약이 고객 EIN 기준 납부·직접입금 대행을 지원하는지(기획서 댓글).
2. 실제 급여 처리 프로그램 → CSV 내보내기 형식(`src/lib/csv.ts`)을 거기에 맞춤.
3. AI 문서 인식 서비스, 수표 인쇄 방식, 고객별 급여 주기 허용 여부, 업종별 기본 시급 검토.

## 다음 후보 작업
- 회계법인 관리자 화면(직원 승인), 새 고객사 이메일 알림, SMTP·초대/안내 메일.
- 기획서에 Supabase 전환·가입 구조·회계법인 로그인 반영.
- ACH 직접입금 파일, 전자신고(941/940/C-3/W-2), 940·W-3 서식, Fringe 규칙표 편집 화면, 다른 주 템플릿, POS 연동.
- 업종별 추가 항목: 제조업 교대 수당·생산 보너스, 서비스·도소매 커미션.
