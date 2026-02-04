# 🔔 Expo + Firebase (FCM V1) 푸시 알림 완벽 가이드

이 문서는 랭큐(Rankue) 프로젝트를 진행하며 겪은 시행착오와 해결 과정을 바탕으로 작성되었습니다. 차후 다른 하이드리드 앱 프로젝트 시 이 순서를 그대로 따라주세요.

---

## 🛠️ 1. Firebase 기반 설정

1. **Firebase 콘솔**: 안드로이드 앱 등록 (`com.rankue.app`).
2. **google-services.json**: 다운로드 후 `rankue-app/` 폴더에 배치.
3. **app.json**: `googleServicesFile` 경로를 정확히 지정하고 `package` 명칭이 패키지명과 일치하는지 확인.

## 🗝️ 2. Google Cloud (FCM V1) 권한 획득

*구글의 최신 정책은 Legacy Server Key 방식을 폐기하고 V1 방식을 강제합니다.*

1. **FCM API 활성화**: Google Cloud Console의 'API 및 서비스 > 라이브러리'에서 **'Firebase Cloud Messaging API'**를 선택해 '사용' 버튼을 클릭합니다.
2. **서비스 계정 생성**:
    - 'IAM 및 관리자 > 서비스 계정'에서 계정을 생성합니다.
    - **JSON 키 다운로드**: 생성된 계정에서 '키' 탭 -> '새 키 만들기' -> 'JSON' 선택 후 다운로드합니다.
3. **✨ 핵심: IAM 권한 부여 (실수 주의)**:
    - 액세스 권한 부여 메뉴에서 위에서 만든 서비스 계정 이메일을 주 구성원으로 추가합니다.
    - 역할로 **'편집자(Editor)'** 또는 **'Firebase 클라우드 메시징 관리자'**를 반드시 지정해야 합니다.
    - 이 권한이 없으면 Expo 서버에서 발송은 성공(`Ticket: OK`)해도 구글 서버에서 차단(`403 PERMISSION_DENIED`)됩니다.

## 🚀 3. Expo 서버 연동

1. **expo.dev**: 프로젝트 -> Credentials -> Android -> 패키지명 클릭.
2. **FCM V1 Key**: 위에서 다운로드한 JSON 파일을 업로드합니다.

## 📱 4. 앱 내 구현 (React Native)

1. **알림 채널**: 안드로이드 8.0 이상에서는 알림 채널이 필수입니다. `Notifications.setNotificationChannelAsync('default', ...)`로 채널을 미리 생성하세요.
2. **권한 요청**: `Notifications.requestPermissionsAsync()`를 통해 사용자 승인을 받습니다.
3. **토큰 전달**: `getExpoPushTokenAsync`로 받은 토큰을 웹뷰 메시지로 웹 서버에 전달합니다.

## 🛑 트러블슈팅: 우리가 겪은 오류들

* **InvalidCredentials**: Expo 서버에 키 등록이 안 되었거나 오타가 있을 때 발생합니다.
- **403 PERMISSION_DENIED**: 서비스 계정에 IAM 권한 설정을 빠뜨렸을 때 발생합니다. 구글 영수증(Receipt)을 조회해야만 에러 원인을 알 수 있습니다.
- **Status OK인데 안 옴**:
  - 폰의 **알림 허용** 여부 확인.
  - 안드로이드 **알림 채널 ID(`default`)** 일치 여부 확인.
  - 구글 서버 권한 반영 딜레이 (설정 후 약 5~10분 대기 필요).

---
*Rankue Push Notification Setup, 2026*
