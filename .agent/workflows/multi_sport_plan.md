# 🏗️ Rankue Multi-Sport Extension Plan (Billiards + Golf)

이 문서는 기존 랭큐 시스템을 당구와 골프를 동시에 지원하는 멀티 스포츠 플랫폼으로 확장하기 위한 실시간 실행 계획서입니다. "기존 건물을 유지하며 별관을 짓는" 아키텍처 원칙을 준수합니다.

---

## 📋 현재 진행 상황 (Status)

- [x] 아키텍처 가이드라인 수립 (Architecture Guideline)
- [x] 메뉴 페이지 스포츠 모드 스위처(Icon Style) UI 구현
- [x] 데이터베이스 스키마 확장 (Schema Update)
  - [x] `sport_category` 필드 추가 (Clubs, Games, Posts)
  - [x] 골프 전용 능력치 필드 추가 (Members)
  - [x] 사용자 현재 스포츠 모드 필드 추가 (Profiles)
- [x] 전역 스포츠 컨텍스트(SportContext) 구현
- [x] 스포츠 스위처 로직 연결 (Menu)
- [x] 데이터 필터링 적용 (Phase 2)
  - [x] 크루/클럽 목록 필터링 (My Crews, Search)
  - [x] 경기 기록(History) 필터링
  - [x] 랭킹(Ranking) API 필터링 준비
- [x] 별관 인테리어 (Phase 3: Specialized UI)
  - [x] `/dashboard` 분기 렌더링 (Billiards vs Golf)
  - [x] 골프 전용 대시보드(GolfDashboardView) 구현
  - [x] 모드별 테마 컬러(배경 광효과) 자동 전환 적용
- [x] 골프 전용 기능 (Phase 4: Golf Engine)
  - [x] 당구 매칭/PIN 초대 로직 골프에 이식
  - [x] 18홀 통합 스코어링 매니저 (`GolfScorecard`) 구현
  - [x] 홀별 Par 데이터 및 상대적 스코어(Birdie/Bogey 등) 계산 로직
  - [x] 골프 전용 DB 스키마 확장 (GameType: Golf)
- [x] **모든 종목 확장 인프라 구축 완료** 🚀

---

## 🛠️ 단계별 실행 계획 (Phase Plan)

### Phase 1: 기초 공사 (Core Infrastructure)

- **1.1 Database SchemaUpdate (shared/schema.ts)**
  - `sport_category` (ENUM: 'BILLIARDS', 'GOLF') 필드 추가
  - `hiq_members` 테이블에 골프 핸디캡(`golfHandi`), 평균 타수(`golfAvg`) 필드 추가
  - `hiq_crews`, `hiq_crew_posts`, `hiq_games` 테이블에 종목 구분 컬럼 추가
- **1.2 Global Sport Context (Frontend)**
  - `SportContext` 생성: 현재 사용자의 모드(`currentSport`) 상태 관리
  - 로컬 스토리지 연동: 앱 재접속 시에도 마지막 스포츠 모드 유지
- **1.3 Sport Switcher Logic (Menu)**
  - `/menu`의 아이콘 클릭 시 전역 상태 변경 기능 연결

### Phase 2: 통로 나누기 (Routing & Data Filtering)

- **2.1 Crew/Club Filtering**
  - 당구 모드에서는 당구 크루만, 골프 모드에서는 골프 크루만 노출되도록 API 및 프론트 필터링 적용
- **2.2 Community Separation**
  - 게시판, 채팅 내역을 `sport_category`에 따라 분리 로출

### Phase 3: 별관 인테리어 (Dashboard & Specialized UI)

- **3.1 Multi-Mode Dashboard (/dashboard)**
  - 당구 대시보드(기존) vs 골프 대시보드(신규) 분기 렌더링
  - 골프 대시보드용 위젯 디자인 (최근 스코어카드, 골프 핸디캡 추이)
- **3.2 Golf Theme (Visual Identity)**
  - 골프 모드 시 테마 색상(그린/화이트 계열) 변경 시스템 적용

### Phase 4: 골프 전용 기능 (Golf Engine)

- **4.1 Golf Scorecard 구현**
  - 18홀 스코어 입력 UI/UX 개발
  - 골프 핸디캡 계산 로직(Game Engine) 추가
- **4.2 Golf History**
  - 골프 전용 경기 기록실 UI 개발

---

## 📈 작업 우선순위 (Backlog)

1. **[Core]** `shared/schema.ts` 수정 (DB 기초 공사)
2. **[State]** `SportContext.tsx` 생성 및 `main.tsx` 연결
3. **[UI]** `/dashboard` 분기 처리 구조 잡기

---
*마지막 업데이트: 2026-01-24*
