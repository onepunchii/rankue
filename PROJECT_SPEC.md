# 📂 PROJECT_SPEC.md (Brain Ranking Service)

## 1. 프로젝트 개요

* **프로젝트명:** Brain Rank (가칭)
* **목표:** 단순한 IQ 테스트를 넘어, 게임화(Gamification) 요소가 적용된 **'두뇌 랭크 시스템'** 앱 개발.
* **핵심 가치:** 사용자의 5가지 지능 영역을 매일 분석하고, ELO 레이팅 시스템을 통해 티어(Level 1~5)를 관리함.

## 2. 기술 스택 (Tech Stack)

* **Frontend:** Flutter (Dart) - iOS/Android 크로스 플랫폼
* **Backend:** Python (FastAPI)
* **Database:** PostgreSQL (또는 MVP 단계에서는 SQLite)
* **AI Integration:** Google Gemini API (문제 생성 및 난이도 판단용)
* **Architecture:** REST API

## 3. 핵심 도메인 로직 (Core Logic)

### 3.1. 카테고리 구성 (5 Domains)

사용자의 능력을 '육각형 인재(오각형 레이더 차트)' 형태로 분석하기 위해 5가지 카테고리로 분류한다.

1. **Logic (논리):** 추론, 패턴 파악 (기본 지능)
2. **Math (수리):** 연산, 규칙 찾기 (두뇌 회전)
3. **Verbal (언어):** 문해력, 어휘력
4. **Economy (경제):** 실전 금융/경제 지식
5. **Trivia (상식):** 역사, 과학, 예술 통합 (재미 요소)

### 3.2. 레벨 시스템 (Level System)

* **구조:** 총 5단계 (Level 1 ~ 5)
* **초기 진입:** 모든 신규 유저는 **Level 2**에서 시작한다.
* **난이도 매핑 (ELO Score 기준):**
  * `Level 1` (Bronze): ELO 0 ~ 1200 (하위 20%)
  * `Level 2` (Silver): ELO 1201 ~ 1400 **[Start Point]** (평균)
  * `Level 3` (Gold): ELO 1401 ~ 1600 (상위 30%)
  * `Level 4` (Platinum): ELO 1601 ~ 1800 (상위 10%)
  * `Level 5` (Diamond): ELO 1801+ (상위 1%)

### 3.3. 데일리 루틴 (Daily 20 Questions)

사용자는 하루에 한 번, 총 20문제의 세트를 푼다. 이 세트는 유저의 이탈을 막고 몰입감을 주기 위해 다음과 같은 비율로 구성된다.

#### A. 카테고리 비율 (Category Ratio)

* **Trivia (상식):** 8문제 (**40%**) - *두뇌 웜업 및 흥미 유발*
* **나머지 4개 영역:** 각 3문제씩 (3 x 4 = 12문제, **60%**)
  * Logic 3, Math 3, Verbal 3, Economy 3

#### B. 난이도 비율 (Difficulty Ratio)

유저의 **현재 레벨(N)**을 기준으로 문제를 배분한다.

* **Easy (Level N-1):** 20% (4문제) - *자신감 충전*
* **Normal (Level N):** 60% (12문제) - *실력 검증*
* **Hard (Level N+1):** 20% (4문제) - *승급 심사 (Challenge)*
* *Note: 유저가 Level 1일 경우 Easy 비율을 Normal로 통합.*

### 3.4. 점수 산정 방식 (Scoring & Ranking)

* **ELO Rating 알고리즘 적용:**
  * 유저가 문제를 맞히면: 유저 점수 상승 / 문제 점수 하락 (쉬운 문제로 판별)
  * 유저가 문제를 틀리면: 유저 점수 하락 / 문제 점수 상승 (어려운 문제로 판별)
* **승급/강등:** 유저의 ELO 점수가 구간을 돌파하면 즉시 레벨이 변경된다.

---

## 4. 데이터베이스 설계 (Schema Design)

### 4.1. Users (사용자)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50),
    current_level INT DEFAULT 2, -- 기본 시작 레벨 2
    
    -- 각 카테고리별 ELO 점수 (초기값 1200)
    rating_logic INT DEFAULT 1200,
    rating_math INT DEFAULT 1200,
    rating_verbal INT DEFAULT 1200,
    rating_economy INT DEFAULT 1200,
    rating_trivia INT DEFAULT 1200,
    
    -- 종합 점수 (Indexing용)
    total_rating INT GENERATED ALWAYS AS (rating_logic + rating_math + rating_verbal + rating_economy + rating_trivia) STORED,

    created_at TIMESTAMP DEFAULT NOW()
);

-- 랭킹용 인덱스
CREATE INDEX idx_users_total_rating ON users (total_rating DESC);
CREATE INDEX idx_users_economy_rating ON users (rating_economy DESC);
-- 다른 카테고리 인덱스도 필요 시 추가
```

### 4.2. Questions (문제)

```sql
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    category VARCHAR(20), -- LOGIC, MATH, VERBAL, ECONOMY, TRIVIA
    level_tag INT, -- 1~5 (Display용)
    elo_rating INT DEFAULT 1300, -- 실제 난이도 점수 (유동적)
    
    content_json JSONB, 
    -- 예: { "q": "질문", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "해설" }
    
    is_active BOOLEAN DEFAULT FALSE, -- 검증 전에는 False
    solved_count INT DEFAULT 0,
    correct_count INT DEFAULT 0
);
```

### 4.3. DailyLogs (풀이 기록)

```sql
CREATE TABLE daily_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    question_id INT,
    is_correct BOOLEAN,
    user_level_at_time INT, -- 당시 유저 레벨
    solved_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. API 명세 (Endpoints Draft)

### 5.1. 문제 생성 (AI Worker)

* `POST /admin/generate-questions`: Gemini API를 호출하여 카테고리별 문제를 대량 생성하고 DB에 적재한다.
* **AI Prompt Strategy (Distractors Generation):**
  * 모든 문제는 기본적으로 **4지선다(4 Options)** 형식을 따른다.
  * **오답(Distractors) 생성 규칙:**
    * 터무니없는 오답을 배제하고 **"매력적인 오답(Plausible Distractors)"**을 생성해야 한다.
    * *예시(Math):* 정답이 `15`라면, 오답은 `100`(X), `14`, `16`, `12`(O) 처럼 계산 실수를 유발하는 숫자여야 한다.
  * **예외:** `Trivia(상식)` 카테고리의 하위 레벨(Level 1~2) 문제는 빠른 진행을 위해 **O/X (True/False)** 형식을 30% 비율로 섞어서 생성한다.

### 5.2. 데일리 퀴즈 세션

* `GET /quiz/daily`: 유저 ID를 기반으로 로직(3.3)에 맞춰 20문제를 선별하여 반환한다.
* `POST /quiz/submit`: 유저의 답안을 제출하고 정답 여부를 리턴한다. 동시에 백그라운드에서 ELO 점수를 갱신한다.

### 5.3. 결과 및 통계

* `GET /user/stats`: 오각형 레이더 차트용 데이터와 현재 레벨, 상위 % 정보를 반환한다.

### 5.4. 랭킹 (Ranking Endpoints)

* `GET /rank/top?category={all|logic|math...}&page=1`:
  * 선택한 카테고리의 상위 랭커 목록(1위~50위)을 반환.
  * 반환 데이터: `rank`, `username`, `tier_badge`, `score`
* `GET /rank/me`:
  * 내 현재 순위와 내 앞/뒤 유저 2명씩(총 5명)의 데이터를 반환. (나와 비슷한 라이벌 확인용)

---

## 6. 개발 로드맵

**Step 1: Backend Setup**

* FastAPI 프로젝트 생성 및 DB 모델링(SQLAlchemy) 구현.
* ELO 계산 함수 유틸리티 구현.

**Step 2: AI Integration**

* Google Gemini API 연동.
* 각 카테고리/레벨별 프롬프트 엔지니어링 및 문제 생성 스크립트 작성.

**Step 3: Logic Implementation**

* "매일 20문제" 뽑기 알고리즘 구현 (쿼리 최적화).
* 결과 제출 시 점수 변동 로직 구현.

**Step 4: Frontend (Flutter)**

* UI: 퀴즈 풀이 화면, 결과 대시보드(오각형 차트), 레벨 표시 위젯.

---

## 7. 랭킹 시스템 (Leaderboard System)

### 7.1. 랭킹 페이지 UI/UX 기획

사용자가 자신의 위치를 확인하고 상위권 유저를 동경하도록 설계한다.

1. **명예의 전당 (Top 3):**
   * 1, 2, 3위 유저는 리스트 상단에 별도 디자인(단상, 금/은/동 테두리, 아바타 강조)으로 노출한다.

2. **카테고리별 탭 (Category Tabs):**
   * 기본: `종합 랭킹` (Total ELO 기준)
   * 탭 선택: `논리` | `수리` | `언어` | `경제` | `상식`
   * *효과: 종합 점수가 낮아도 "나 경제는 1등이야!"라는 자부심을 줄 수 있음.*

3. **내 랭킹 고정 바 (Sticky My Rank):**
   * 스크롤을 아무리 내려도 화면 하단에 **[내 현재 순위 / 점수 / 티어]**가 고정되어 보이게 한다.
   * *예: "현재 12,405위 (상위 35%) - ▲15위 상승!"*

4. **무한 스크롤 (Infinite Scroll):**
   * 한 번에 50명씩 로딩하여 끊김 없는 경험 제공.

### 7.2. 랭킹 정산 방식

실시간으로 매번 계산하면 DB 부하가 크므로, 전략적인 갱신 주기를 가진다.

* **실시간 반영:** `내 점수`와 `내 티어`는 즉시 반영.
* **전체 랭킹 리스트:** 10분 ~ 1시간 단위로 캐싱(Caching)하여 갱신하거나, MVP 단계에서는 실시간 쿼리(Index 활용)로 처리.

---

## 8. 보안 및 공정성 (Fair Play & Security)

### 8.1. 앱 이탈 감지 (App Focus Tracking)

* **정책:** 랭크 게임(Daily Quiz) 진행 중 앱이 백그라운드(Background) 상태로 전환되거나 포커스를 잃을 경우.
* **패널티:**
  1. **1차 경고:** 화면을 블러(Blur) 처리하고 "앱을 이탈하면 0점 처리됩니다" 경고 모달 표시.
  2. **즉시 종료 (Hard Mode):** 상위 티어(Level 3 이상)에서는 이탈 즉시 해당 문제 **오답(Fail)** 처리.

### 8.2. 스크린샷 차단 (Screenshot Prevention)

* **Android:** `WindowManager.LayoutParams.FLAG_SECURE`를 적용하여 퀴즈 화면 캡처 및 녹화 원천 차단.
* **iOS:** `UIScreen.main.isCaptured` 및 `userDidTakeScreenshotNotification`을 감지하여, 캡처 시도 시 화면을 즉시 가리고 경고 메시지 출력.

### 8.3. 다이내믹 스코어링 (Time-Decay Score)

AI를 사용하여 정답을 도출하는 시간(Latency)을 무의미하게 만든다.

* **공식:** `Final Score = Base Score * (Remaining Time / Total Time)`
* **예시:** 제한시간 30초 문제에서,
  * 3초 만에 정답: 100% 점수 획득.
  * 25초 만에 정답(AI 활용 의심 구간): 15% 점수 획득.
  * *결과: AI를 써서 다 맞혀도, 빨리 푼 사람을 이길 수 없음.*
