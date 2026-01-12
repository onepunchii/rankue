# 폴리(Polli) 플랫폼 이전 가이드

## 📋 목차
1. [개요](#1-개요)
2. [백엔드 이전](#2-백엔드-이전)
3. [프론트엔드 이전](#3-프론트엔드-이전)
4. [데이터베이스 이전](#4-데이터베이스-이전)
5. [환경 변수 체크리스트](#5-환경-변수-체크리스트)
6. [이전 후 검증](#6-이전-후-검증)

---

## 1. 개요

### 1.1 기술 스택
| 구분 | 기술 |
|------|------|
| 백엔드 | Express.js + TypeScript |
| 프론트엔드 | React + Vite + TypeScript |
| 데이터베이스 | PostgreSQL (Neon Database) |
| ORM | Drizzle ORM |
| 인증 | JWT (bcrypt) |

### 1.2 필수 요구사항
- **Node.js**: 18 이상
- **npm**: 9 이상
- **PostgreSQL**: 14 이상 (또는 Neon Database)

---

## 2. 백엔드 이전

### 2.1 필수 파일 목록

```
server/
├── index.ts              # 메인 진입점
├── routes.ts             # API 라우트
├── db.ts                 # 데이터베이스 연결
├── storage.ts            # 스토리지 인터페이스
├── simpleAuth.ts         # JWT 인증
├── simpleAuthRoutes.ts   # 인증 라우트
├── simpleStorage.ts      # 인증 스토리지
├── adminRoutes.ts        # 관리자 API
├── politicianRoutes.ts   # 정치인 평가 API
├── assemblyRoutes.ts     # 국회의원 API
├── localCouncilRoutes.ts # 기초의원 API
├── scheduler.ts          # 자동화 스케줄러
├── vite.ts               # Vite 통합
└── seoRoutes.ts          # SEO 라우트

shared/
├── schema.ts             # 데이터베이스 스키마
└── types.ts              # 공유 타입

drizzle.config.ts         # Drizzle 설정
tsconfig.json             # TypeScript 설정
package.json              # 패키지 목록
```

### 2.2 패키지 설치

```bash
# 새 서버에서 실행
npm install
```

주요 의존성:
```json
{
  "dependencies": {
    "express": "^4.x",
    "express-session": "^1.x",
    "drizzle-orm": "^0.x",
    "@neondatabase/serverless": "^0.x",
    "bcrypt": "^5.x",
    "jsonwebtoken": "^9.x",
    "passport": "^0.x",
    "ws": "^8.x",
    "node-cron": "^3.x",
    "openai": "^4.x",
    "@sendgrid/mail": "^8.x",
    "@google-cloud/storage": "^7.x"
  }
}
```

### 2.3 빌드 명령어

```bash
# 개발 모드
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

### 2.4 package.json 스크립트

```json
{
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --outdir=dist --packages=external",
    "start": "NODE_ENV=production node dist/index.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 2.5 포트 설정
- **기본 포트**: 5000
- **프론트엔드 바인딩**: 0.0.0.0:5000

---

## 3. 프론트엔드 이전

### 3.1 필수 파일 목록

```
client/
├── src/
│   ├── App.tsx           # 메인 앱
│   ├── main.tsx          # 진입점
│   ├── index.css         # 글로벌 스타일
│   ├── pages/            # 페이지 컴포넌트
│   ├── components/       # UI 컴포넌트
│   ├── hooks/            # 커스텀 훅
│   └── lib/              # 유틸리티
├── index.html            # HTML 템플릿
└── public/               # 정적 파일

vite.config.ts            # Vite 설정
tailwind.config.ts        # Tailwind 설정
postcss.config.js         # PostCSS 설정
```

### 3.2 환경 변수 (프론트엔드)
프론트엔드에서 사용하는 환경 변수는 `VITE_` 접두사 필요:

```env
VITE_APP_NAME=Polli
VITE_API_URL=https://your-domain.com
```

---

## 4. 데이터베이스 이전

### 4.1 Neon Database 설정

1. **Neon Console 접속**: https://neon.tech
2. **프로젝트 생성**
3. **연결 문자열 복사**

```env
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### 4.2 스키마 마이그레이션

```bash
# 스키마 푸시 (새 DB에 테이블 생성)
npm run db:push

# 강제 동기화 (데이터 삭제 주의!)
npm run db:push --force
```

### 4.3 데이터 백업 및 복원

**백업 (기존 DB):**
```bash
pg_dump -h old-host -U user -d dbname -F c -f backup.dump
```

**복원 (새 DB):**
```bash
pg_restore -h new-host -U user -d dbname backup.dump
```

### 4.4 주요 테이블 목록
| 테이블 | 설명 |
|--------|------|
| user_auth | 사용자 인증 |
| surveys | 설문 |
| survey_questions | 설문 질문 |
| survey_responses | 설문 응답 |
| lottery_tickets | 로또 티켓 |
| lottery_draws | 로또 추첨 |
| point_balance | 포인트 잔액 |
| point_ledger | 포인트 내역 |
| friend_referrals | 친구 추천 |
| politician_ratings | 정치인 평가 |
| assembly_members | 국회의원 |
| local_council_members | 기초의원 |

---

## 5. 환경 변수 체크리스트

### 5.1 필수 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | ✅ |
| `SESSION_SECRET` | 세션 암호화 키 | ✅ |
| `JWT_SECRET` | JWT 서명 키 (미설정시 SESSION_SECRET 사용) | ⬜ |
| `NODE_ENV` | 환경 (development/production) | ✅ |

### 5.2 외부 서비스 API 키

| 변수명 | 서비스 | 용도 |
|--------|--------|------|
| `OPENAI_API_KEY` | OpenAI | AI 설문 생성 |
| `SENDGRID_API_KEY` | SendGrid | 이메일 발송 |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP | 객체 스토리지 |
| `GOOGLE_CLOUD_PRIVATE_KEY` | GCP | 객체 스토리지 |
| `GOOGLE_CLOUD_CLIENT_EMAIL` | GCP | 객체 스토리지 |
| `PRERENDER_TOKEN` | Prerender.io | SEO 프리렌더링 |

### 5.3 소셜 로그인 (선택)

| 변수명 | 서비스 |
|--------|--------|
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `KAKAO_CLIENT_ID` | Kakao OAuth |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth |
| `NAVER_CLIENT_ID` | Naver OAuth |
| `NAVER_CLIENT_SECRET` | Naver OAuth |
| `FACEBOOK_APP_ID` | Facebook OAuth |
| `FACEBOOK_APP_SECRET` | Facebook OAuth |

### 5.4 환경 변수 파일 예시

```env
# .env 파일 (새 서버에 생성)

# 필수
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
SESSION_SECRET=your-session-secret-key-here
NODE_ENV=production

# OpenAI
OPENAI_API_KEY=sk-xxx

# SendGrid
SENDGRID_API_KEY=SG.xxx

# SEO
PRERENDER_TOKEN=xxx

# Google Cloud Storage
GOOGLE_CLOUD_PROJECT_ID=your-project
GOOGLE_CLOUD_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 6. 이전 후 검증

### 6.1 체크리스트

#### 서버 기동
- [ ] `npm run build` 성공
- [ ] `npm start` 에러 없음
- [ ] 포트 5000 접속 가능

#### 데이터베이스
- [ ] DB 연결 성공
- [ ] 테이블 존재 확인
- [ ] 기존 데이터 조회 가능

#### API 테스트
- [ ] `GET /api/surveys` - 설문 목록
- [ ] `POST /api/auth/login` - 로그인
- [ ] `GET /api/lottery/tickets` - 로또 티켓
- [ ] `GET /api/assembly/members` - 국회의원 목록

#### 스케줄러
- [ ] 로또 자동 추첨 (00:00 KST)
- [ ] 정책 브리핑 수집 (09:00, 13:00, 19:00 KST)
- [ ] 주간 정치 설문 (월요일 09:00 KST)

#### 외부 서비스
- [ ] OpenAI API 연결
- [ ] SendGrid 이메일 발송
- [ ] 객체 스토리지 업로드

### 6.2 API 테스트 명령어

```bash
# 설문 목록 조회
curl http://localhost:5000/api/surveys

# 헬스 체크
curl http://localhost:5000/api/health

# 로그인 테스트
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone": "test@example.com", "password": "123456"}'
```

### 6.3 로그 확인

```bash
# 서버 로그
tail -f /var/log/polli/app.log

# PM2 사용시
pm2 logs polli
```

---

## 7. 프로덕션 배포 권장사항

### 7.1 프로세스 매니저 (PM2)

```bash
# PM2 설치
npm install -g pm2

# 앱 시작
pm2 start dist/index.js --name polli

# 자동 시작 설정
pm2 startup
pm2 save
```

### 7.2 Nginx 리버스 프록시

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7.3 SSL 인증서 (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.com
```

---

## 8. 롤백 계획

### 8.1 데이터 백업 주기
- **전체 백업**: 매일 00:00
- **증분 백업**: 매 6시간

### 8.2 롤백 절차
1. 새 서버 서비스 중지
2. 기존 서버 서비스 재시작
3. DNS 원복 (필요시)
4. 데이터 복원 (필요시)

---

## 문서 정보
- **버전**: 1.0.0
- **작성일**: 2026년 1월 8일

---

*문의사항은 개발팀에 연락해주세요.*
