# Polli Project Architecture & Standards

이 문서는 Polli 프로젝트의 일관성을 유지하고, 협업(AI 개발자 포함) 시 코드 꼬임을 방지하기 위한 공식 가이드라인입니다.

## 1. Core Principles

- **Separation of Concerns**: UI, API, Data Logic은 명확히 분리한다.
- **Fail Fast**: 데이터 검증은 최상단(API Entry)에서 철저히 한다.
- **Maintainability**: 한 파일은 300~500줄을 넘지 않도록 Modularize(모듈화)한다.

## 2. Directory Structure (Proposed)

### Backend (`server/`)

- `routes/`: 기능별 API 엔드포인트 분리 (lotto.ts, quiz.ts 등)
- `services/`: 비즈니스 로직 전담 (계산, AI 분석, 복잡한 데이터 처리)
- `storage.ts`: 데이터베이스 입출력(Repository) 전담
- `cron.ts`: 스케줄러 관리

### Frontend (`client/src/`)

- `pages/`: 화면 단위 구성
- `components/`: 재사용성 높은 UI 유닛
- `hooks/`: API 호출 및 상태 관리 로직 (Presentation Logic)
- `lib/`: 클라이언트 설정 (Supabase, QueryClient 등)

### Shared (`shared/`)

- `schema.ts`: Database Schema 및 Type 정의 (영점 조절의 핵심)

## 3. Naming Conventions

- **Files**: `kebab-case.ts` (예: `user-profile.tsx`)
- **Variables**: `camelCase` (예: `isUserLoggedIn`)
- **Components**: `PascalCase` (예: `LottoTicket`)
- **Database Fields**: `snake_case` (예: `created_at`)

## 4. API Response Standard

모든 API 응답은 아래 형식을 권장한다.

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

## 5. Implementation Workflow (AI 협업 규칙)

1. **Plan First**: 작업을 시작하기 전 `implementation_plan`을 먼저 생성하고 승인받는다.
2. **Type Safety**: `drizzle-zod`를 활용하여 런타임 데이터 검증을 수행한다.
3. **Commit Message**: 작업 내용을 명확히 기록하여 히스토리를 추적 가능하게 한다.
