# Accounting Payroll

급여(Payroll) 관리 웹사이트입니다. React + TypeScript + Vite 기반입니다.

## 시작하기

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint 검사 |
| `npm test` | Vitest 단위 테스트 |

## 구조

```
src/
├── config/payrollConfig.ts   # 세율·지급 주기 설정
├── lib/payroll.ts            # 급여 계산 로직 (+ payroll.test.ts)
├── lib/format.ts             # 통화/퍼센트 포맷
├── data/sampleEmployees.ts   # 개발용 샘플 직원 (가상)
├── components/Layout.tsx     # 상단 내비게이션 레이아웃
├── pages/                    # 대시보드, 직원 관리, 급여 계산
└── types.ts                  # 공용 타입
```

## 급여 계산 규칙

- 총급여: 연봉 ÷ 연간 지급 횟수, 또는 시급 × 시간 (초과근무 1.5배)
- 401(k) 세전 공제 후 금액에 연방·주 원천징수 적용
- Social Security 6.2% (연간 상한 적용), Medicare 1.45% — 총급여 기준

> ⚠️ 연방·주 원천징수는 **임시 정률(placeholder)** 입니다. 실제 급여 지급 전에
> IRS Publication 15-T와 해당 주의 원천징수 표로 교체하세요.
> 요율과 상한액은 `src/config/payrollConfig.ts`에서 매년 갱신합니다.

## 다음 단계 (예정)

- 백엔드/DB 연동 (직원·급여 기록 저장)
- 로그인 및 권한 관리
- 급여명세서(pay stub) PDF 출력
- W-2 / 941 등 신고 서식 지원
