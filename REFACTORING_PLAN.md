# Polli Refactoring Plan (Phase 1)

이 계획서는 비대해진 `server/routes.ts`를 분리하고, 데이터 정합성을 높여 시스템의 안정성을 확보하는 것이 목표입니다.

## Milestone 1: Server Modularization [COMPLETED]

Goal: Split the 1000+ line `routes.ts` file into feature-specific modules.

- [x] Create `server/routes/` directory.
- [x] Split into files like `auth.ts`, `surveys.ts`, `news.ts`, `lottery.ts`, `balance-game.ts`, `notifications.ts`, `personality.ts`, `stats.ts`.
- [x] Update `server/routes.ts` to import and mount each router.
통합 로드하도록 변경

## Milestone 2: Lottery Logic Hardening

목표: 로또 추첨 누락 방지 및 데이터 무결성 강화.

- [x] 추첨 로직(`cron.ts`)을 `server/services/lotteryService.ts`로 추출
- [x] 추첨 실패 시 자동 재시도 및 운영자 알림 기능 추가
- [x] 당첨 결과 계산 로직을 서버에서 중앙 집중화 (프론트 의존성 제거)

## Milestone 3: API Response Refinement

목표: 프론트-백엔드 간의 통신 규격 통일.

- [x] 모든 API 응답을 `ARCHITECTURE.md`에 정의된 규격으로 통일
- [x] Error Handling 미들웨어 강화 (에러 발생 시 프론트엔드 프리징 방지)

## Milestone 4: Feature-Specific API Standardization

목표: 나머지 주요 기능들의 API 응답 규격을 통일하고 비즈니스 로직을 점진적으로 분리하여 유지보수성을 극대화한다.

- [x] **실시간 인기투표 (`celebrityRoutes.ts`)**:
  - [x] API 응답 규격 통일 (`sendSuccess`, `sendError`)
  - [x] 투표 로직 검증 및 간소화
- [x] **밸런스 게임 (`server/routes/balance-game.ts`)**:
  - [x] API 응답 규격 통일
  - [x] 게임 참여/결과 로직 안정화
- [x] **브레인 랭크 (`server/brainRoutes.ts`)**:
  - [x] API 응답 규격 통일
  - [x] 랭킹 계산 로직 검토
- [x] **우리동네 정치인 (`server/politicianRoutes.ts`)**:
  - [x] API 응답 규격 통일
  - [x] 데이터 조회 최적화 확인
- [x] **국회/지방의회 (`server/assemblyRoutes.ts`, `server/localCouncilRoutes.ts`)**:
  - [x] API 응답 규격 통일

## Milestone 5: Auth Layer Refactoring

목표: 인증 로직과 데이터 접근 계층을 명확히 분리하여 유지보수성을 강화한다.
(`simpleAuthStorage` -> `AuthService` + `UserStorage`)

- [x] **Service Layer 도입 (`server/services/authService.ts`)**:
  - [x] 비즈니스 로직(레벨 계산, DTO 매핑 등) 이관
  - [x] 순수 데이터 접근은 `UserStorage`로 위임
- [x] **Storage Layer 강화 (`server/storage/userStorage.ts`)**:
  - [x] `simpleAuth.ts`에 혼재된 DB 쿼리문 이관
- [x] **Middleware & Routes 업데이트**:
  - [x] `auth.ts` (Middleware) 및 `routes/auth.ts`가 `AuthService`를 사용하도록 수정

## Milestone 6: Client-Side TypeScript Cleanup [COMPLETED]

목표: 클라이언트 측에 남아있는 70여 개의 TypeScript 에러를 해결하여 빌드 안정성을 확보한다.

- [x] **Chart & Analytics Page Fixes**:
  - [x] `chart-components.tsx` 복원 및 타입 정의 강화
  - [x] `analytics-dashboard.tsx` 및 `survey-detail-result.tsx`의 차트 사용 오류 및 데이터 타입 불일치 해결
- [x] **Type Definitions & Error Handling**:
  - [x] `admin/rewards.tsx`, `integration.tsx` 등에서 `unknown` 타입 에러 해결을 위한 인터페이스 정의
  - [x] `location-prompt.tsx`의 ReactNode 렌더링 에러 수정
  - [x] `useGeolocation.ts` 리팩토링 (state 타입 명확화)

---

## 작업 진행 방식

1. 각 단계는 **Feature Branch** 느낌으로 하나씩 차근차근 진행한다.
2. 각 단계 완료 후 반드시 **Build Test**를 수행하여 기존 기능이 망가지지 않았는지 확인한다.
3. 작업 완료 시마다 이 문서에 체크 표시(`[x]`)를 한다.
