# Polli 설문 플랫폼 데이터베이스 구조

## 데이터베이스 개요
- **데이터베이스**: PostgreSQL (Neon Database)
- **ORM**: Drizzle ORM
- **타입 안전성**: TypeScript 완전 지원
- **마이그레이션**: Drizzle Kit 자동 마이그레이션

## 테이블 구조

### 1. sessions (세션 관리)
```sql
CREATE TABLE sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);
CREATE INDEX IDX_session_expire ON sessions(expire);
```
- Replit Auth 세션 저장용 (필수)
- 자동 만료 관리

### 2. users (사용자 정보)
```sql
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE,
    first_name VARCHAR,
    last_name VARCHAR,
    profile_image_url VARCHAR,
    points INTEGER DEFAULT 0,
    city VARCHAR(100),
    district VARCHAR(100),
    latitude TEXT,
    longitude TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- Replit Auth 사용자 정보
- 포인트 시스템 지원
- 위치 기반 설문용 지역 정보

### 3. surveys (설문 조사)
```sql
CREATE TABLE surveys (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'fun', 'life', 'deep', 'location'
    points INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    is_anonymous BOOLEAN DEFAULT FALSE,
    target_city VARCHAR(100),
    target_district VARCHAR(100),
    created_by VARCHAR REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- 4가지 카테고리 지원
- 위치 기반 설문 타겟팅
- 익명 설문 옵션

### 4. survey_questions (설문 질문)
```sql
CREATE TABLE survey_questions (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'multiple_choice', 'single_choice', 'text'
    options JSONB,
    order INTEGER DEFAULT 0
);
```
- 다양한 질문 타입 지원
- JSONB로 선택지 저장
- 질문 순서 관리

### 5. survey_responses (설문 응답)
```sql
CREATE TABLE survey_responses (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES survey_questions(id) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES users(id),
    answer JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```
- 유연한 응답 저장 (JSONB)
- 사용자별 응답 추적
- 캐스케이드 삭제 지원

### 6. user_survey_participation (참여 기록)
```sql
CREATE TABLE user_survey_participation (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT FALSE,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```
- 설문 참여 완료 상태 추적
- 획득 포인트 기록
- 일일 통계 계산용

## API 엔드포인트

### 인증 관련
- `GET /api/auth/user` - 현재 사용자 정보
- `GET /api/login` - 로그인 시작
- `GET /api/logout` - 로그아웃

### 설문 관련
- `GET /api/surveys` - 전체 설문 조회
- `GET /api/surveys/popular` - 인기 설문 조회
- `GET /api/surveys/location` - 위치 기반 설문 조회
- `GET /api/surveys/:id` - 특정 설문 상세 조회
- `POST /api/surveys` - 새 설문 생성
- `POST /api/surveys/:id/questions` - 설문 질문 추가
- `POST /api/surveys/:id/participate` - 설문 참여

### 사용자 관련
- `GET /api/user/participations` - 사용자 참여 기록
- `POST /api/user/location` - 사용자 위치 업데이트

### 통계 관련
- `GET /api/stats/today-participants` - 오늘 참여자 수
- `GET /api/surveys/:id/results` - 설문 결과 분석

## 데이터베이스 설정

### 환경 변수
```env
DATABASE_URL=postgresql://[username]:[password]@[host]:[port]/[database]
SESSION_SECRET=your-session-secret-key
```

### 마이그레이션 실행
```bash
# 스키마 변경사항을 데이터베이스에 적용
npm run db:push

# 마이그레이션 파일 생성 (옵션)
npm run db:generate
```

## 보안 고려사항

1. **세션 관리**: PostgreSQL 기반 세션 저장소 사용
2. **인증**: Replit Auth OAuth 2.0 / OpenID Connect
3. **익명성**: 민감한 설문의 경우 익명 응답 지원
4. **데이터 무결성**: 외래키 제약조건 및 캐스케이드 삭제
5. **타입 안전성**: Drizzle ORM의 TypeScript 타입 검증

## 성능 최적화

1. **인덱스**: 세션 만료 시간, 사용자 이메일 등 자동 인덱스
2. **JSON 저장**: 설문 옵션 및 응답을 JSONB로 효율적 저장
3. **관계 최적화**: Drizzle 관계 설정으로 조인 쿼리 최적화
4. **캐싱**: React Query를 통한 클라이언트 캐싱

이 구조는 확장 가능하고 안전한 설문 플랫폼 백엔드를 제공합니다.