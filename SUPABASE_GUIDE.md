# Supabase 연동 가이드

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 로그인하고 'New Project'를 생성합니다.
2. Database Password를 안전하게 저장해둡니다.

## 2. 데이터베이스 스키마 적용

1. 왼쪽 메뉴에서 **SQL Editor**를 클릭합니다.
2. `supabase_schema.sql` 파일의 내용을 복사하여 붙여넣고 **Run** 버튼을 클릭합니다.
   - 이 스크립트는 테이블 생성, 보안 정책(RLS), 성능 최적화 함수(RPC), 초기 데이터를 모두 설정합니다.

## 3. 소셜 로그인 설정 (Authentication)

1. 왼쪽 메뉴에서 **Authentication** > **Providers**로 이동합니다.
2. **Google**과 **Kakao**를 활성화합니다.
   - **Google**: Google Cloud Console에서 Client ID와 Secret을 발급받아 입력합니다.
   - **Kakao**: Kakao Developers에서 REST API Key와 Client Secret을 발급받아 입력합니다.
3. **URL Configuration**에서 `Site URL`과 `Redirect URLs`를 설정합니다.
   - 로컬 개발 환경: `http://localhost:5173`

## 4. 환경 변수 설정

프로젝트 루트의 `.env` 파일에 Supabase 키를 추가합니다. (Project Settings > API에서 확인)

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 5. 로딩 속도 최적화 확인

설정이 완료되면 홈 화면 로딩 시 `get_home_dashboard` 함수가 호출되어 한 번의 요청으로 모든 데이터를 가져오게 됩니다.
