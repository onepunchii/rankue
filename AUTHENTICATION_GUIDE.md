# Polli 인증 시스템 가이드

## 개요
Polli는 단일 인증 시스템을 사용합니다. 모든 사용자는 게스트로 시작하여 프로필 설정을 통해 인증된 사용자가 됩니다.

## 사용자 타입
1. **게스트 (guest)**: 모든 비회원 사용자
   - 통일된 `guest_common` 계정 사용
   - 설문 열람만 가능 (참여 불가)
   - 포인트 적립 불가

2. **인증됨 (verified)**: 프로필 인증 완료 사용자
   - 이메일 + 6자리 숫자 비밀번호
   - 성함 + 휴대폰번호 필수 입력
   - 연령대, 성별, 지역 필수 입력
   - 30일 JWT 자동 로그인
   - 모든 기능 사용 가능

## 권한 매트릭스

| 기능 | 게스트 | 인증됨 |
|------|---------|---------|
| 설문 조회 | ✅ | ✅ |
| 설문 참여 | ❌ | ✅ |
| 포인트 획득 | ❌ | ✅ |
| 설문 생성 | ❌ | ✅ |
| 결과 조회 | ❌ | ✅ |
| 로또 구매 | ❌ | ✅ |
| AI 뉴스 투표 생성 | ❌ | ✅ |
| 기업 설문 생성 | ❌ | ✅ |
| 비밀번호 변경/재설정 | ❌ | ✅ |

## API 엔드포인트

### 인증 관련
- `POST /api/polli-auth/user`: 사용자 정보 조회/생성
- `GET /api/user-state`: 현재 사용자 상태 조회
- `POST /api/demographics`: 프로필 설정

### 미들웨어
- `requireGuest`: 게스트 이상 (모든 사용자)
- `requireVerified`: 인증된 사용자만

## 프론트엔드 통합

### 훅 사용
```typescript
import { usePolliAuth } from "@/hooks/usePolliAuth";

const { user, isAuthenticated, isVerified } = usePolliAuth();
```

### 권한 체크
```typescript
// 로또 기능 사용 가능 여부
if (user?.userType === 'verified') {
  // 로또 구매 가능
}

// AI 뉴스 투표 생성 가능 여부
if (user?.userType === 'verified') {
  // AI 투표 생성 가능
}
```

## 데이터베이스 스키마

### user_auth 테이블
- `auth_id`: 고유 ID (PK)
- `user_type`: 'guest' | 'verified' | 'admin'
- `is_verified`: boolean
- `age_group`, `gender`, `region`: 프로필 정보
- `available_lottery_tickets`: 사용 가능한 로또 티켓
- `experience_points`: 경험치
- `personal_points`: 포인트

## 일반적인 오류 해결

### "인증 정보가 필요합니다" 오류
- 원인: API 엔드포인트에서 잘못된 미들웨어 사용
- 해결: requireGuest 또는 requireVerified 확인

### 로또 기능 접근 오류
- 원인: 프로필 미완성 사용자의 접근
- 해결: 프로필 설정 페이지로 안내

### 포인트 업데이트 오류
- 원인: SQL 문법 오류 또는 잘못된 업데이트 방식
- 해결: cleanAuthStorage.updateUser 사용