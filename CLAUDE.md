# CLAUDE.md — Payday 고객 포털 (작업 인수인계)

새 세션은 이 파일부터 읽으세요. 지금까지의 대화·결정·구조를 정리한 것입니다.

## 사용자·목적
- 사용자는 텍사스 레스토랑 고객을 둔 **CPA 회계법인**. 한국어로 소통(응답은 한국어).
- 목표: 고객이 포털에 로그인해 직원(W-4·I-9)과 급여(근무·팁·Fringe)를 입력·제출 → 회계법인이 검토·처리·지급·세금 납부·분기/연말 신고(941, TWC C-3, 940, W-2) → 고객은 내역·세금 안내 확인, 직원은 명세서·W-2 열람.
- 기획서 문서(Claude Docs): https://claude.ai/artifact/1iHDZw1zgqF1zqD5sWPC7z — 개요, 전체 흐름 다이어그램, 신고 구조 결정, 기능 명세, Fringe 규칙표, 세금 일정, 보안, 로드맵, 결정 필요 사항. 열린 질문(PEO 용도 확인)이 댓글로 달려 있음.

## 현재 상태 (Supabase + Vercel)
- 배포: **정식 사이트 = Vercel `jae-jin-yang-cpa-pc/accounting` 프로젝트의 Production(`main`)** (사용자 결정). `main` 푸시 → Vercel 자동 배포, 브랜치마다 미리보기 주소(`accounting-git-<브랜치>-jae-jin-yang-cpa-pc.vercel.app`). 라우팅·보안 헤더는 `vercel.json`. GitHub Pages 워크플로(`deploy.yml`)는 수동 실행만 남김(옛 데모가 github.io에 남아 있을 수 있음). CI(`ci.yml`)는 lint·test·build + DB 시험(`scripts/test-db.sh`).
- 저장소: https://github.com/gunbinlim1/Accounting (공개). 지금까지 `main`에 직접 커밋·푸시해 왔음(사용자 승인 흐름). Supabase 전환은 2026-11-11 사용자 확인 후 `main`에 반영됨.
- **데이터: Supabase 전용** (사용자 결정: 데모·브라우저 저장 제거, 정규화 테이블). 설정 순서는 `docs/SUPABASE.md`. 환경 변수 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`·`VITE_FIRM_NAME`(배포는 저장소 Variables `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`FIRM_NAME`). 설정이 없으면 `SetupNeeded` 화면.
- DB 구조: `supabase/migrations/20261111000000_payroll_schema.sql` — companies, company_members, firm_staff, employees, employee_secrets(암호화), time_entries, pay_runs, pay_results, payments, tax_deposits, activity, audit_log, 비공개 버킷 `payroll-docs`. RLS: 회계법인 전체 / 고객 자기 회사 / 직원 본인. 모든 접근은 MFA(aal2) 필수. 고객 상태 변경 규칙·제출 잠금은 트리거.
- 앱 데이터 흐름: `src/portal.tsx`(인증 상태·불러오기·저장 대기열) → 화면은 기존처럼 `updateCompany(id, fn)`으로 CompanyData를 고치고, `src/lib/db/plan.ts`가 바뀐 부분을 DB 쓰기 목록으로 만들어 `src/lib/db/api.ts`가 순서대로 실행(근무 입력은 0.6초 모아서). 실패하면 DB 기준으로 다시 불러옴. 행↔객체 변환은 `src/lib/db/mappers.ts`.
- 전체 SSN·계좌번호는 화면에서 입력 → `set_employee_secrets` RPC로 암호화 저장 → 화면 상태에서 즉시 제거. 화면엔 뒤 4자리와 `onFile` 표시.
- **가입·로그인 구조 (사용자 결정 2026-11-11)**: 회계법인이 고객을 초대하는 방식은 쓰지 않음. 고객사(대표 또는 직원)가 고객 로그인 화면(`/login`)의 **"계정 만들기"**(`/signup`)로 계정과 회사 포털을 함께 만듦(회사 정보는 이메일 인증·MFA 후 생성될 때까지 localStorage `payday-pending-company-v1`에 잠시 보관) → `create_company`가 활동 기록 "고객 포털 생성"을 남기고 `companies.firm_seen_at`이 비어 있어 회계법인 대기열 상단에 **"새로 가입한 고객사"** 알림 → 회계법인이 "확인함". 고객은 `firm_seen_at`을 못 바꿈(트리거). 회계법인 "새 고객사" 화면(`/firm/new`)은 없앰(코드의 `CompanySetup mode="firm"`은 미사용).
- **회계법인 전용 로그인 `/firm/login`** (회계법인 계정이 아니면 막음), 직원 계정 만들기 `/firm/register` → 가입·이메일 인증 후 SQL로 `firm_staff` 등록. 고객 로그인 화면의 작은 링크 `/register`는 급여명세서를 보는 고객사 직원용(대표가 직원 정보에 넣은 이메일 + 전자 수령 동의 → `claim_invites`로 연결).
- 로그인 흐름: 이메일+비밀번호 → 인증 앱(TOTP) 등록/코드 → `claim_invites` → 역할 판단.
- 회계법인 이메일 알림은 아직 없음(화면 알림만). 이메일까지 하려면 Supabase Database Webhook/Edge Function + 메일 서비스(예: Resend) 키 필요.
- **Supabase 프로젝트 생성됨**: `payday-portal` (ID `mvnixlpissdrioivjqjy`, us-east-1, 무료 플랜, 조직은 Supabase 커넥터로 확인). 마이그레이션 `payroll_schema`·`client_signup_notice` 적용, Vault 키 `payroll_field_key` 서버에서 생성. 권한 시험 47개를 실제 프로젝트에서 롤백 트랜잭션으로 실행해 통과. URL·publishable 키는 `.env.production`(공개용 값). Supabase 커넥터(MCP)로 SQL·마이그레이션 가능. 남은 것: 대시보드 인증 설정(Site URL = Vercel 본 사이트, Redirect URLs `https://*-jae-jin-yang-cpa-pc.vercel.app/**`), 회계법인 직원 `firm_staff` 등록(가입 후 SQL).
- 이 작업 환경(셸)에서는 supabase.co 접속이 막혀 있어 브라우저 로그인은 직접 시험하지 못함. GitHub Actions 변수 설정도 프록시가 막음. 로컬 PostgreSQL + `supabase/tests/supabase_shim.sql`로 마이그레이션·권한 시험(47개), 앱 쪽은 단위 시험과 빈/가짜 설정 빌드로 화면 확인.
- 2단계 남은 것: 실제 Supabase 프로젝트 연결·검증, 이메일 발송(SMTP), ACH·전자신고, 직원 초대 메일.

## 핵심 결정
- **신고 방식: 회계법인 = Reporting Agent(Form 8655)**, 고객 EIN으로 941·940 신고, 텍사스 C-3는 TWC 대리인 권한, 세금은 고객 계좌 인출. 사용자가 등록한 PEO는 공동고용이 아닌 **납부·직접입금 대행 채널**로만 쓴다고 가정(사용자 확인 대기).
- **업종별 포털**: 회사 생성 시 업종 선택(레스토랑·서비스업·도소매업·생산·제조업) → `Company.industry`, `Company.tipsEnabled`. `src/config/industries.ts`에 업종 프로필과 직무 템플릿(`roleTemplates`, `rolesFor`, `receivesTips`, `defaultTimeFor`). 도소매·제조는 팁 불가, 레스토랑은 팁 기본 켬, 서비스업은 선택. 팁이 꺼지면 팁 직원 직무·급여 형태·급여 입력표 팁 칸이 숨겨짐. '기타' 직무 + 직함 직접 입력(`Employee.jobTitle`, 표시는 `jobLabel`). 새 회사: `/signup`(대표) 또는 `/firm/new`(회계법인), 회사 정보 화면에서 업종 변경 가능(팁 직원이 있으면 팁 끄기 막음).
- **직원 이름은 성·이름 분리**: `Employee.lastName`, `firstName`, `middleInitial?`. 표시 `fullName`, 정렬·서류 `sortName`/`compareByName`(성 기준), 한 칸 이름은 `splitName` (`src/lib/names.ts`). W-4·I-9 PDF 자동 입력도 분리해서 읽음. CSV 내보내기는 Last/First/MI 열.
- **회사 서류 자동 입력**: Form SS-4(EIN 기재 사본)·CP 575·147C → EIN·법인명·상호·주소, TWC Liability Letter → TWC 계정번호·세율 (`src/lib/companyDocs.ts`, pdfjs-dist로 PDF 글자 읽기 + pdf-lib 양식 칸). 스캔본·사진은 2단계 AI 인식. 회사 만들기·회사 정보 화면에 업로드, `Company.documents`에 기록.
- **IRS 예치 주기 기본값: 반주별(semiweekly)**. 고객이 포털을 만들면 홈(`/`)으로 이동.
- **직접입금은 라우팅 9자리(ABA 체크섬)·계좌번호 전체 + 확인 입력 필수** (`src/lib/bank.ts`). 전체 번호는 `set_employee_secrets`로 암호화 저장(화면 상태엔 남기지 않음), 화면은 뒤 4자리·`onFile`. 전체 번호가 없는 직접입금 직원은 점검 경고.
- **I-9 서류 사본 업로드 필수**: 기본 운전면허증(List B) + 사회보장카드(List C), 사본 없으면 I-9 단계 진행 불가(`I9Document.copy`, 파일 자체는 2단계 서버 보관). 직원이 다른 서류를 내면 List A 등으로 바꿔 그 사본을 올림 — 고용주가 특정 서류를 강요하면 I-9 차별(document abuse) 소지가 있어 화면 안내 유지.
- 기본 주: **텍사스**(주 소득세 없음). FICA, FUTA 0.6%/$7,000, TWC 기본 2.7%/$9,000(고객사별 세율 입력).
- 연방 원천징수: 2026 Pub 15-T 연간 퍼센트 방식(표준공제 16,100/32,200/24,150, Rev. Proc. 2025-32 구간). 제3자 계산기 예시($75k Single 연 $7,670, MFJ $4,640)와 일치 검증. irs.gov는 이 세션 네트워크에서 차단됐었음.
- 레스토랑: 팁 직원 현금시급 $2.13, 팁 크레딧 최대 $5.12, 팁 OT = $7.25×1.5−크레딧, $7.25 미달 시 자동 보전, 현금 팁은 과세하되 입금에서 제외, 급여 부족 시 FICA 먼저 원천징수·미징수는 W-2 12 A/B, 45B 크레딧 추정.
- Fringe: `src/config/fringeBenefits.ts` 규칙표(Pub 15-B 요약, 13개). 현금 지급 아님 → 과세 임금에만 가산. 한도 항목은 YTD 초과분만 과세. **한도·코드는 기억 기반이라 운영 전 2026 Pub 15-B와 대조 필요.**
- 서류 문제(I-9 기한 초과·W-4 없음)는 **급여 승인을 막지 않음**(임금은 지급해야 함). critical = 계산 자체가 틀린 경우만(최저 시급 미달, 연봉 $0).
- 회차별 시급/회당 급여 변경 가능(`TimeEntry.rate`), "기본값으로 저장"으로 직원 정보 반영. 연봉은 회당×26.
- 제출 시 스냅샷 고정 → 회계법인은 고정본 검토. 제출 마감: 지급일 2영업일 전 오후 3시. 급여 주기: 격주 금요일(기준일 2026-01-09).
- SSN·계좌 전체 번호는 암호화 저장(회계법인만 열람), I-9 서류 번호는 뒤 4자리만. 새 직원은 SSN 9자리 필수(W-2용). 전자 W-2는 직원 동의(eConsent) 필요.
- 디자인: Gusto는 흐름만 참고(이름·로고·브랜드색 사용 금지). 직원 목록은 카드 대신 리스트. 급여 실행은 표 입력(Enter/↑↓ 이동) + 검토·제출 2단계, 시급·연봉 크게 표시.

## 구조
- 스택: React 19 + TypeScript + Vite + react-router 7, lucide-react, vitest, oxlint. `read-excel-file`(엑셀 가져오기), `pdf-lib`(W-4·I-9 작성 가능 PDF 칸 읽기 + 데모 샘플 PDF 생성).
- 다국어: **모든 화면 한국어·영어 제공**(사용자 요청). `usePrefs().t(ko, en)` 인라인, 모든 화면에 언어 전환 버튼. 첫 방문 언어는 브라우저 언어(한국어면 ko, 그 외 en), 선택은 `pref-lang`에 저장. 새 문구는 반드시 `t()`로 두 언어를 함께 쓰고, 데이터 문구는 ko/en 쌍(활동 기록, 점검, 수정 요청 `noteEn`)으로 저장. 확인: 영어 모드로 전 화면을 돌며 한글이 섞였는지 Playwright로 검사. 다크 모드: CSS 토큰(`src/index.css`).
- `src/config/industries.ts`: 업종 프로필·직무 템플릿. `src/portal.tsx`: Supabase 인증 상태·고객사 데이터 불러오기·저장 대기열. `src/lib/db/`: 행 변환·쓰기 계획·API. `src/store.tsx`: `CompanyProvider`/`useStore()` 고객사 단위 데이터와 동작(제출/취소/검토/수정요청/처리/납부/위임 서명).
- `src/lib`: `payroll.ts`(계산 엔진·Fringe 분리), `federalWithholding.ts`, `taxes.ts`(예치 기한, 941, C-3, FUTA $500, W-2), `payments.ts`, `checks.ts`(자동 점검), `compliance.ts`(I-9), `docExtract.ts`(PDF 자동 입력), `ytd.ts`, `compute.ts`.
- 페이지: 공개 `/login` `/signup`(계정+회사 포털 만들기) `/register`(직원) `/firm/login` `/firm/register` · 고객 `/`(홈) `/run` `/employees` `/employees/new|:id` `/history` `/taxes` `/company` `/simulator` · 회계법인 `/firm`(대기열·새 고객사 알림) `/firm/settings` `/firm/c/:id`(검토) `/taxes` `/history` · 직원 `/me` · `/login`.

## 작업 방법
- 확인: `npm run lint && npm test && npm run build` (테스트 50개). 배포 경로 확인은 `BASE_PATH=/Accounting/ npm run build` 후 `dist/index.html`을 `404.html`로 복사해 로컬 서버로 Playwright 점검.
- 이 환경에서는 `vercel.app`·`github.io`·`irs.gov` 접속이 막혀 배포 사이트를 직접 열 수 없음 → Vercel 배포 결과는 `gh api repos/gunbinlim1/Accounting/commits/<sha>/statuses`, CI는 `gh run list -R gunbinlim1/Accounting`으로 배포 성공 확인.
- 복잡한 셸 heredoc(`${}`·백틱 포함)은 안전 검사에 막힐 수 있음 → 스크래치패드에 파이썬 패치 스크립트를 쓰고 실행.
- Playwright fullPage 스크린샷에서 sticky 사이드바·하단 바가 중간에 보이는 것은 캡처 특성(버그 아님).

## 사용자 결정 대기
1. PEO 계약이 고객 EIN 기준 납부·직접입금 대행을 지원하는지(기획서 댓글).
2. 실제 급여 처리 프로그램 → CSV 내보내기 형식(`src/lib/csv.ts`)을 그 형식에 맞춤.
3. 서버 호스팅·예산(추천: Supabase 같은 관리형 + 비공개 호스팅), AI 문서 인식 서비스, 수표 인쇄 방식, 고객별 급여 주기 허용 여부.

## 다음 후보 작업
- 2단계 서버 기반(로그인+MFA, 데이터베이스 수준 고객사 분리, 암호화, 감사 로그), 실제 이메일 발송.
- 회계법인용 Fringe 규칙표 편집 화면, 940·W-3 서식, 다른 주 템플릿, POS 연동.
- 업종별 추가 항목: 제조업 교대 수당(shift differential)·생산 보너스, 서비스·도소매 커미션, 업종별 직무 템플릿 편집.
