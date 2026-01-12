# Polli 비즈니스 로직 상세 문서

이 문서는 폴리(Polli) 프로젝트의 핵심 비즈니스 로직에 대한 상세 분석 및 가이드를 제공합니다.

## 1. 레벨업 및 포인트 시스템 (Level Up & Point System)

폴리는 사용자의 활동에 따라 경험치(Experience)와 포인트(Points)를 부여하며, 경험치 누적에 따라 레벨이 상승하는 구조를 가지고 있습니다.

### 핵심 개념

* **경험치 (Experience)**: 사용자의 평생 활동 척도. 한번 획득하면 감소하지 않으며, 레벨업의 기준이 됩니다.
* **포인트 (Personal Points)**: 앱 내에서 화폐처럼 사용 가능한 자원 (예: 경품 응모, 아이템 구매 등). 사용 시 차감될 수 있습니다.

### 레벨 계산 공식

레벨은 경험치에 비례하여 선형적으로 증가합니다.

```typescript
// 공식: (경험치 / 100) + 1
// 단, 최대 레벨은 100으로 제한

const newLevel = Math.min(100, Math.floor(experience / 100) + 1);
```

* **예시**:
  * 경험치 0 ~ 99: **Lv. 1**
  * 경험치 100 ~ 199: **Lv. 2**
  * 경험치 1550: **Lv. 16**

### 구현 위치

* **파일**: `server/simpleAuth.ts`
* **함수**: `updateExperience(authId: string, experienceGained: number)`
* **작동 방식**:
    1. 사용자 활동(투표 등) 발생 시 경험치 추가.
    2. `updateExperience` 함수가 호출되어 새로운 총 경험치 계산.
    3. 위 공식에 따라 레벨 재계산.
    4. DB `profiles` 테이블의 `experience` 및 `level` 컬럼 동시 업데이트.

---

## 2. 회원 및 권한 시스템 (Auth & Permissions)

폴리는 비회원(게스트)과 정회원(인증된 사용자)을 구분하여 서비스 접근 권한을 관리합니다.

### 사용자 유형 (User Types)

| 구분 | 비회원 (Guest) | 정회원 (Verified User) |
| :--- | :--- | :--- |
| **식별 방식** | 세션/쿠키 기반 임시 ID (`guest_...`, `public_...`) | 인증 토큰 (JWT) 및 DB `profiles` ID (UUID) |
| **User Type** | `guest` | `verified` (또는 `admin`) |
| **데이터 저장** | 영구 저장되지 않음 (휘발성) | `profiles` 테이블에 영구 저장 |

### 권한 통제 (Middleware)

* **Middleware**: `authMiddleware` (in `server/simpleAuth.ts`)
* **작동 원리**: 요청 헤더의 `Authorization` 토큰을 확인. 토큰이 유효하면 `req.user`에 정회원 정보를, 없으면 게스트 정보를 할당합니다.

### 기능별 접근 제한

1. **공개 설문 (Enterprise Category)**:
    * **누구나 참여 가능**.
    * 비회원 참여 시 IP 기반의 임시 ID (`public_${timestamp}_${ip}`)가 생성되어 `user_survey_participation`에 기록됩니다.
2. **일반 투표 및 로또**:
    * **정회원 전용**.
    * 비회원 접근 시 `401 Unauthorized` 또는 `403 Forbidden` 에러를 반환하여 로그인/인증을 유도합니다.

---

## 3. 로또 시스템 (Polli Lottery)

매일 자정에 추첨이 진행되는 사용자 보상 시스템입니다.

### 프로세스 흐름

1. **티켓 획득**:
    * 레벨업 보상, 프로필 완성(최초 1회 5장), 친구 초대 보상 등을 통해 `profiles.availableLotteryTickets`를 획득합니다.
2. **응모 (수동/자동)**:
    * **API**: `POST /api/lottery/manual-ticket`
    * **조건**: 정회원 인증 필수, 티켓 보유 필수.
    * **로직**:
        * 1~40 사이의 숫자 5개 선택 (중복 불가).
        * DB `lottery_tickets`에 티켓 정보 저장.
        * 사용자 보유 티켓 1개 차감 (`profiles` 업데이트).
3. **추첨 (Daily Draw)**:
    * **스케줄러**: 매일 자정 (00:00) 실행.
    * **함수**: `LotteryStorage.runDailyLotteryDraw`
    * **로직**:
        * 1~40 사이의 무작위 숫자 5개 생성 (당첨 번호).
        * `lottery_rounds` 테이블에 회차 정보 저장.
        * 해당 회차의 모든 `lottery_tickets`를 조회하여 당첨 여부 확인.
4. **당첨금 지급**:
    * **1등 (5개 일치)**: 50,000 P
    * **2등 (4개 일치)**: 5,000 P
    * **3등 (3개 일치)**: 500 P

---

## 4. 투표 생성 로직 (Vote Creation)

투표(설문)는 관리자/사용자가 직접 생성하거나, 시스템이 자동으로 생성할 수 있습니다.

### 사용자/관리자 생성

* **API**: `POST /api/surveys`
* **필수 정보**: 제목, 설명, 마감일, 카테고리.
* **AI 지원**: 뉴스 링크를 입력하면 `generateSurveyFromNews` 함수가 뉴스 내용을 요약하여 적절한 질문과 선택지를 자동으로 생성해줍니다.

### 시스템 자동 생성 (Political Scheduler)

* **목적**: 시의성 있는 정치 이슈에 대한 여론을 빠르게 수집하기 위함.
* **트리거**: 정치 지표(대통령/정당 지지율)의 유의미한 변동 감지 시.
* **로직**:
    1. 지지율 변동 폭이 설정값(예: 2%p) 이상인지 확인.
    2. 변동이 크다면 해당 이슈(상승/하락 원인 분석 등)에 맞는 질문 템플릿 선택.
    3. `system` 계정 명의로 자동으로 설문을 생성하고 공개 처리.

---

## 5. 스케줄러 시스템 (Schedulers)

서버는 백그라운드에서 주기적으로 데이터를 갱신하고 콘텐츠를 생성하는 스케줄러를 운영합니다.

### 주요 스케줄러 목록

| 스케줄러 이름 | 실행 주기 | 파일 위치 | 역할 |
| :--- | :--- | :--- | :--- |
| **Political Scheduler** | 매주 월요일 06:00 | `server/politicalScheduler.ts` | 지난주 정치 지표 분석 및 주간 정치 여론조사 자동 생성 |
| **Assembly Bill Scheduler** | 주기적 (설정값) | `server/assemblyBillScheduler.ts` | 국회 OpenAPI 연동. 새로운 법률안 정보를 가져와 찬반 투표 생성 |
| **Policy Briefing Scheduler** | 주기적 (설정값) | `server/policyBriefingScheduler.ts` | 정부 정책 브리핑 뉴스 수집 및 DB 업데이트 |
| **Lottery Scheduler** | 매일 00:00 자정 | `server/index.ts` (설정) | 일일 로또 당첨 번호 추첨 및 당첨자 선정 처리 |

### 초기화

모든 스케줄러는 `server/index.ts`의 서버 시작 시점에 초기화되며, `setTimeout` 및 `setInterval`을 조합하여 정해진 시간에 정확히 실행되도록 예약됩니다.
