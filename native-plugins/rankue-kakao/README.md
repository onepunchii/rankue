# rankue-kakao — 앱 안 카카오 로그인 (로컬 Capacitor 플러그인 `RankueKakao`)

랭큐 앱(1.3~)에서 카카오 네이티브 SDK 로 로그인해 **ID 토큰(OIDC)** 을 받아 오는 작은 플러그인이다.
앱의 웹뷰는 `rankue.co.kr` 밖으로 못 나가서(`capacitor.config.ts` allowNavigation) 웹 방식 카카오 로그인을 쓸 수 없다 — 그래서 SDK 를 감쌌다.
계약(플러그인 · 화면 · 서버가 같이 지키는 것)은 `shared/kakaoNative.ts` 에 있다. 이 문서는 네이티브 쪽만 다룬다.

- 오너 결정(2026-10-06): 카카오 로그인이 되는 앱 빌드를 올리고, **승인되면** 카카오를 연다. 그 전에는 스위치(`KAKAO_LOGIN_OPEN` · `VITE_KAKAO_LOGIN_OPEN`)가 꺼져 있어 이 플러그인이 들어 있어도 화면 어디에도 카카오가 나오지 않는다.
- 웹 번들은 이 패키지를 **import 하지 않는다**. 화면은 `registerPlugin("RankueKakao")`(@capacitor/core)로만 부른다. 이 패키지에는 JS 가 없다.

## 한눈에

| | 값 |
|---|---|
| 플러그인 이름(jsName) | `RankueKakao` |
| iOS SDK | `kakao-ios-sdk` **2.29.0** (KakaoSDKCommon · KakaoSDKAuth · KakaoSDKUser) — `Package.swift` 에 `exact` 로 고정 |
| Android SDK | `com.kakao.sdk:v2-user` **2.25.1** — `android/build.gradle` 의 `kakaoSdkVersion` |
| 최소 OS | iOS 15.0 · Android API 24(SDK 자체는 23) |
| 키 자리표시자 | `KAKAO_NATIVE_APP_KEY_HERE` |

```
native-plugins/rankue-kakao/
  package.json            capacitor: { ios.src, android.src } — 스크립트·의존 없음
  Package.swift           iOS(SPM). 이름 "RankueKakao" 는 Capacitor CLI 가 패키지 이름에서 만드는 값과 같아야 한다
  ios/Sources/RankueKakaoPlugin/RankueKakaoPlugin.swift
  android/build.gradle    키 읽기 · 카카오 maven 저장소 · release 빌드 막이
  android/src/main/AndroidManifest.xml          AuthCodeHandlerActivity(kakao{키}://oauth)
  android/src/main/kotlin/com/rankue/kakao/RankueKakaoPlugin.kt
  .gitignore              ← 지우면 안 된다(아래 '함정' 1번)
```

## 플러그인이 하는 일

```ts
login({ nonce: string }): Promise<{ idToken: string; viaTalk: boolean }>
logout(): Promise<void>
```

- `login`: 카카오톡이 깔려 있으면 카카오톡 간편로그인(`viaTalk: true`), 없으면 카카오계정 로그인(iOS 는 시스템 웹 인증 시트, Android 는 커스텀 탭 — `viaTalk: false`).
  카카오톡 로그인이 **취소가 아닌 이유로** 실패하면(카카오톡에 계정이 없는 경우 등) 카카오 안내대로 카카오계정 로그인으로 넘어간다 — 이때도 `viaTalk: false`.
- `nonce` 는 서버가 낸 글자 그대로 SDK 에 넘긴다(다듬지 않는다). ID 토큰의 `nonce` 클레임에 실린다.
- 액세스 · 리프레시 토큰은 웹으로 넘기지 않는다. `idToken` 과 `viaTalk` 뿐이다.
- `logout`: SDK 가 기기에 들고 있는 카카오 토큰만 지운다(랭큐 로그인과 무관). 실패해도 resolve.

거절 code(`call.reject(메시지, code)` → JS 오류의 `code`):

| code | 언제 |
|---|---|
| `CANCELED` | 사용자가 취소(동의 화면 '취소', 시트 닫기, 카카오톡에서 마치지 않고 돌아옴) |
| `NO_ID_TOKEN` | 토큰은 받았는데 ID 토큰이 없다 — 카카오 콘솔에서 OpenID Connect 가 꺼져 있다 |
| `NOT_CONFIGURED` | 이 바이너리에 네이티브 앱 키가 없다(자리표시자 그대로) |
| `BAD_NONCE` | nonce 가 비었다 |
| `IN_PROGRESS` | 1초 안에 login 이 또 왔다(연타). 1초가 지난 뒤에 오면 앞의 시도를 `CANCELED` 로 정리하고 새 호출이 이긴다 |
| `FAILED` | 그 밖(메시지에 SDK 오류 요약: `client:…` · `auth:…` · `api:…`) |

iOS 에서만 하는 일: 카카오톡에서 동의를 마치지 않고 앱 전환기로 돌아오면 SDK 는 아무 콜백도 주지 않는다. 플러그인이 "앱이 다시 앞으로 나왔는데 1.5초 안에 콜백 URL 이 안 왔다"를 보고 `CANCELED` 로 끝낸다(안드로이드는 SDK 가 알아서 취소를 준다).

## 네이티브 앱 키를 넣는 곳 — 플랫폼마다 한 곳

키는 카카오 디벨로퍼스 > 앱 "랭큐 RANKUE"(ID 1584265) > 앱 키 > **네이티브 앱 키**. 저장소에는 넣지 않는다(두 파일 모두 gitignore 인 `android/` · `ios/` 안에 있다).

| 플랫폼 | 파일 · 줄 | 그 값이 가는 곳 |
|---|---|---|
| Android | `android/kakao.properties` 8번째 줄 `KAKAO_NATIVE_APP_KEY=…` | 플러그인 `build.gradle` 이 읽어 ① `BuildConfig.KAKAO_NATIVE_APP_KEY`(SDK 초기화) ② 매니페스트 콜백 스킴 `kakao{키}` |
| iOS | `ios/App/Kakao.xcconfig` 11번째 줄 `KAKAO_NATIVE_APP_KEY = …` | `ios/App/App/Info.plist` 가 끌어다 쓴다: ① `KAKAO_NATIVE_APP_KEY`(110번째 줄 — 플러그인이 읽어 SDK 초기화) ② URL 스킴 `kakao$(KAKAO_NATIVE_APP_KEY)`(103번째 줄) |
| 서버 | Vercel 환경변수 `KAKAO_NATIVE_APP_KEY` | ID 토큰의 `aud` 허용 목록(`server/lib/kakaoAuth.ts`) — 네이티브 쪽이 아니지만 **같은 키**라 여기 적어 둔다 |

따옴표 · 공백 없이 키만 적는다. 키를 넣은 뒤에는 다시 빌드해야 한다(바이너리에 박힌다).

자리표시자 그대로 두면:
- debug 빌드는 된다. 앱은 평소대로 돌고 `login()` 만 `NOT_CONFIGURED` 로 거절된다(SDK 를 초기화하지 않는다).
- **release 빌드는 막힌다.** 스토어에 올린 바이너리에 키가 없으면 심사를 통과해도 카카오 로그인이 영영 안 되고, 고치려면 새 빌드 · 새 심사가 든다.
  - Android: `:rankue-kakao:preReleaseBuild` 가 실패한다. 키 없이 빌드만 확인하려면 `-PkakaoAllowPlaceholder=true`.
  - iOS: App 타깃의 빌드 단계 "Check Kakao native app key" 가 Release 구성에서 실패한다. 키 없이 확인하려면 `xcodebuild … KAKAO_ALLOW_PLACEHOLDER=YES`.

## 카카오 콘솔에 등록할 것 (오너)

앱 "랭큐 RANKUE"(ID 1584265)의 네이티브 앱 키 쪽 플랫폼 설정에:

1. **iOS** 번들 ID `com.rankue.app`
2. **Android** 패키지명 `com.rankue.app` + **키 해시 셋 다**
   - 디버그 키(이 맥에서 만든 debug 빌드용)
   - 업로드 키(`android/keystore/rankue-upload.keystore` — 이 맥에서 만든 release 빌드용)
   - **Play 앱 서명 키**(스토어에서 받은 앱은 이 키로 서명된다 — 이것을 빼먹으면 개발 빌드는 되고 **스토어 설치본만** 로그인이 실패한다. 8/12 구글 로그인 장애와 같은 유형)
3. **OpenID Connect 켜기**(카카오 로그인 > OpenID Connect) — 꺼져 있으면 ID 토큰이 안 와서 `NO_ID_TOKEN`.
4. 동의항목 · 카카오 로그인 ON 은 웹 카카오 때 이미 해 뒀다(닉네임만 필수). 네이티브는 Redirect URI 등록이 필요 없다(`kakao{키}://oauth` 는 SDK 가 쓰는 고정 주소).

키 해시 뽑는 법(카카오 키 해시 = 서명 인증서 SHA-1 을 **바이너리로** base64 한 값. 여기에는 값을 적지 않는다):

```sh
# keytool 은 JDK 21 것을 쓴다(이 맥 기본 JDK 25 로는 gradle 이 안 돈다 — 같은 JDK 로 맞춘다)
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

# ① 디버그 키
"$JAVA_HOME/bin/keytool" -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android \
  | openssl sha1 -binary | openssl base64

# ② 업로드 키 — 별칭은 android/key.properties 의 keyAlias. 비밀번호는 물어볼 때 직접 친다(명령에 적지 않는다)
"$JAVA_HOME/bin/keytool" -exportcert -alias <keyAlias> -keystore android/keystore/rankue-upload.keystore \
  | openssl sha1 -binary | openssl base64

# ③ Play 앱 서명 키 — Play Console > 앱 무결성 > 앱 서명 > '앱 서명 키 인증서'의 SHA-1 지문(콜론으로 나뉜 16진수)을 바꾼다
echo "<SHA-1 지문 AA:BB:…>" | xxd -r -p | openssl base64
```

(keytool 의 `-list -v` 는 한국어 로케일에서 죽는다 — 위처럼 `-exportcert` 로 뽑는다.)

## 앱에 연결돼 있는 방식

1. `package.json` — `"rankue-kakao": "file:native-plugins/rankue-kakao"`(node_modules 에는 심볼릭 링크로 들어간다).
2. `capacitor.config.ts` — `ios.includePlugins` 에 `"rankue-kakao"`. **안 적으면 iOS 에서만 조용히 빠진다.**
3. `npx cap sync` 가 만드는 것(손대지 않는다):
   - `android/capacitor.settings.gradle` — `include ':rankue-kakao'` → `../native-plugins/rankue-kakao/android`
   - `android/app/capacitor.build.gradle` — `implementation project(':rankue-kakao')`
   - `android/app/src/main/assets/capacitor.plugins.json` — `com.rankue.kakao.RankueKakaoPlugin`
   - `ios/App/CapApp-SPM/Package.swift` — `.package(name: "RankueKakao", path: "../../../native-plugins/rankue-kakao")`
   - `ios/App/App/capacitor.config.json` — `packageClassList` 에 `RankueKakaoPlugin`
4. `npm install` 뒤에는 늘 `npx cap sync`(소셜 로그인 플러그인의 페이스북 SDK 제외 훅이 sync 때 돈다). sync 뒤 확인:
   `grep -n facebook node_modules/@capgo/capacitor-social-login/Package.swift` 가 **주석 줄만** 보여야 한다.

Android 쪽은 앱 매니페스트 · `android/build.gradle` 을 고치지 않는다 — 콜백 화면(AuthCodeHandlerActivity)과 카카오 maven 저장소는 이 플러그인의 `build.gradle` · 매니페스트가 넣는다. `<queries>` 의 카카오톡은 SDK 매니페스트가 넣는다.

iOS 쪽은 AppDelegate · SceneDelegate 를 고치지 않는다 — 카카오톡에서 돌아오는 URL 은 Capacitor 가 뿌리는 openURL 알림(`.capacitorOpenURL`)으로 플러그인이 받아 `AuthController.handleOpenUrl` 에 넘긴다. SDK 초기화도 플러그인 `load()` 가 한다.

## `android/` · `ios/` 를 다시 만들었을 때 손으로 되살릴 것

(`npx cap add` 는 하지 않는 것이 원칙이다 — 이 맥에만 있는 네이티브 수정이 통째로 사라진다. 그래도 다시 만들었다면 카카오 몫은 아래가 전부다.)

**Android — 파일 하나**
- `android/kakao.properties` 를 만들고 `KAKAO_NATIVE_APP_KEY=<네이티브 앱 키>` 한 줄.

**iOS — 넷**
1. `ios/App/Kakao.xcconfig` 를 만들고 `KAKAO_NATIVE_APP_KEY = <네이티브 앱 키>` 한 줄.
2. Xcode > 프로젝트 App > Info > Configurations 에서 **App 타깃**의 Debug · Release 를 둘 다 `Kakao` 로 지정
   (프로젝트 줄의 Debug 는 `debug` 그대로 둔다 — `CAPACITOR_DEBUG` 가 거기서 온다). `Kakao.xcconfig` 를 프로젝트에 파일로 추가해야 목록에 보인다.
3. `ios/App/App/Info.plist`
   - `CFBundleURLTypes` 에 항목 추가: `CFBundleURLName` = `kakao`, `CFBundleURLSchemes` = [`kakao$(KAKAO_NATIVE_APP_KEY)`]
   - 최상위에 `KAKAO_NATIVE_APP_KEY` = `$(KAKAO_NATIVE_APP_KEY)`
   - `LSApplicationQueriesSchemes` 에 `kakaokompassauth` 추가(없으면 카카오톡이 깔려 있어도 늘 카카오계정 로그인으로 간다)
4. App 타깃 > Build Phases 맨 위에 Run Script "Check Kakao native app key"(Based on dependency analysis 끔):

```sh
if [ "${CONFIGURATION}" = "Release" ] && [ "${KAKAO_ALLOW_PLACEHOLDER}" != "YES" ]; then
  case "${KAKAO_NATIVE_APP_KEY}" in
    ""|KAKAO_NATIVE_APP_KEY_HERE)
      echo "error: Kakao native app key is missing. Set KAKAO_NATIVE_APP_KEY in ios/App/Kakao.xcconfig (native-plugins/rankue-kakao/README.md)."
      exit 1
      ;;
  esac
fi
```

그 뒤 `npx cap sync`.

## 빌드 확인

```sh
# Android(debug)
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home android/gradlew -p android assembleDebug
# 병합된 매니페스트에 kakao{키} 스킴이 들어갔는지
grep -n -A12 AuthCodeHandlerActivity android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml

# iOS(시뮬레이터, 서명 없이)
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/App/build-sim build CODE_SIGNING_ALLOWED=NO

# iOS — Xcode 없이 플러그인만 컴파일해 보기(SwiftPM). 끝나면 생긴 Package.resolved 는 지운다
cd native-plugins/rankue-kakao && swift build --scratch-path /tmp/rankue-kakao-spm \
  --sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" --triple arm64-apple-ios15.0-simulator
```

확인 기록(2026-10-06, 자리표시자 키):
- Android `assembleDebug` 성공. 병합 매니페스트에 `kakaoKAKAO_NATIVE_APP_KEY_HERE://oauth` 필터 확인. **권한은 하나도 늘지 않았다**(1.2.0 release 병합 매니페스트와 같은 목록). `<queries>` 에 `com.kakao.talk.alpha` · `com.kakao.talk.sandbox` 와 https 브라우저 조회가 SDK 에서 더해진다. 페이스북 SDK 없음.
- iOS: **`xcodebuild` 는 이 맥에서 못 돌렸다** — Xcode 가 26.6 으로 올라간 뒤 첫 실행 구성요소가 안 깔려 있어(깔린 것은 26.3) 모든 `xcodebuild` 명령이 `exit 70`("failed to load a required plug-in … run 'xcodebuild -runFirstLaunch'")으로 끝난다. 관리자 권한이 드는 일이라 오너가 Xcode 를 한 번 열어 구성요소 설치를 승인하거나 `sudo xcodebuild -runFirstLaunch` 를 돌려야 한다.
  대신 SwiftPM 으로 확인했다: 플러그인 단독, 그리고 앱의 플러그인 묶음(`ios/App/CapApp-SPM` — 플러그인 18개 전부)이 시뮬레이터 대상으로 컴파일됐다. 지금 Xcode 가 고정해 둔 버전들(Alamofire 5.12.0 등)에 `kakao-ios-sdk 2.29.0` 만 더해져 충돌 없이 풀린다. 페이스북 SDK 없음.
  **App 타깃 자체(Info.plist 치환 · xcconfig · 빌드 단계 스크립트)는 `xcodebuild` 로 아직 못 봤다** — 위 명령이 되는 날 첫 빌드에서 확인할 것:
  `xcodebuild … -showBuildSettings | grep -E "KAKAO_NATIVE_APP_KEY|CAPACITOR_DEBUG"` (Debug 에서 `CAPACITOR_DEBUG = true` 가 그대로인지까지).

## 실기기에서 볼 것 (스토어 서명본으로 — Play 내부 테스트 · TestFlight)

- 카카오톡 설치 + 로그인됨 → 카카오톡으로 갔다가 앱으로 **자동 복귀**, `viaTalk: true`
- 카카오톡 미설치 → 웹 시트(iOS) · 커스텀 탭(Android), `viaTalk: false`
- 카카오톡 설치 + 카카오톡에 계정 없음 → 카카오계정 로그인으로 넘어가는지
- 취소 세 가지: 동의 화면 '취소' · 시트/탭 닫기 · (iOS) 카카오톡에서 앱 전환기로 그냥 돌아오기 → 전부 `CANCELED`, 단추가 계속 돌지 않는지
- 서버 검증까지 한 번에: ID 토큰의 `aud` 가 **네이티브 앱 키**로 오는지(서버 로그의 claims). 카카오 문서 · 데브톡 기준의 예상이고 실제 토큰으로 본 적은 아직 없다.
- 토큰 발급이 `KOE010`(client secret) 류로 막히지 않는지 — 네이티브 SDK 는 시크릿을 보내지 않는다. 콘솔의 클라이언트 시크릿이 REST API 키에만 걸려 있어야 한다(미확인).
- 안드로이드 저사양 기기: 카카오톡에 가 있는 동안 우리 화면이 메모리에서 내려가면 결과를 못 받는다(웹뷰가 다시 로드된다) — 다시 누르면 된다. 자주 보이면 호출 보존(saveCall)으로 보강.

## 심사 · 개인정보 메모

- iOS: 카카오 SDK 가 자기 개인정보 매니페스트를 갖고 있다(추적 없음 `NSPrivacyTracking=false`, 수집 "기타 데이터" · 계정 연결 · 앱 기능 목적, UserDefaults `CA92.1`). 앱의 `PrivacyInfo.xcprivacy` 와 App Store 라벨을 이 기준으로 한 번 맞춰 볼 것(오너 결정).
- iOS: 카카오 단추는 애플 로그인과 같은 화면 · 같은 크기(4.8). 카카오톡이 없으면 시스템 웹 인증 시트로 로그인한다(심사 메모에 적는다).
- Android: 새 권한 없음(병합 매니페스트로 확인). Play 데이터 보안 설문에는 카카오 회원번호 · 닉네임(계정 식별)이 해당할 것으로 본다(추정 — 제출 전 설문 항목과 대조).
- 카카오계정 로그인에서 돌아오는 `kakao{키}://oauth?code=…` 는 iOS 에서 Capacitor App 플러그인의 `appUrlOpen` 으로 웹에도 전달된다. 웹은 우리 주소가 아니면 건드리지 않고(`client/src/lib/nativeBridge.ts` openDeepLink), 그 code 는 SDK 가 쥔 PKCE 검증값 없이는 쓸 수 없다.

## 버전 올리기

- iOS: `Package.swift` 의 `exact: "2.29.0"` 을 바꾼다 → Xcode 가 `Package.resolved` 를 갱신. SDK 요건(지금 iOS 15 · Xcode 26)과 `loginWithKakaoTalk(nonce:)` · `loginWithKakaoAccount(prompts:loginHint:nonce:)` · `AuthController.handleOpenUrl(url:)` · `AuthController.shared.authorizeWithTalkCompletionHandler` 가 그대로인지 본다(마지막 것은 문서에 없는 공개 속성이다 — 취소 정리에 쓴다).
- Android: `android/build.gradle` 의 `kakaoSdkVersion`. `UserApiClient.loginWithKakaoTalk(context, nonce = …)` · `loginWithKakaoAccount(context, nonce = …)` 시그니처 확인.
- 최신 버전: `git ls-remote --tags https://github.com/kakao/kakao-ios-sdk.git` · `https://devrepo.kakao.com/nexus/content/groups/public/com/kakao/sdk/v2-user/maven-metadata.xml`

## 함정

1. **이 폴더의 `.gitignore` 를 지우지 않는다.** 저장소 맨 위 `.gitignore` 가 `android/` · `ios/` 를 어느 깊이에서든 무시해서, 이 폴더의 `!/android/` · `!/ios/` 두 줄이 없으면 플러그인 소스가 조용히 git 에서 빠진다.
   확인: `git check-ignore -v native-plugins/rankue-kakao/android/build.gradle` → 아무것도 안 나와야 한다.
2. **`package.json` 의 `file:` 의존과 이 폴더는 같은 커밋에 들어가야 한다.** Vercel 은 저장소에서 `npm install` 한다. `.vercelignore` 의 `android` · `ios` 는 이 폴더 안의 것도 걸러서 Vercel 에는 `package.json` · `Package.swift` · `README.md` 만 올라가는데, 웹 빌드는 그것으로 충분하다(설치 스크립트 · 의존 없음, 웹이 import 하지 않음).
3. Capacitor CLI 는 플러그인 클래스를 **정규식으로** 찾는다. Swift 는 파일마다 맨 처음 나오는 objc 이름 표기, Kotlin 은 플러그인 애너테이션 뒤 첫 클래스 선언이다 — 그 사이에 주석 · 다른 선언을 끼우지 않는다. sync 뒤 `packageClassList` · `capacitor.plugins.json` 에 `RankueKakaoPlugin` 이 있는지 본다.
4. `allowNavigation` 에 카카오 도메인을 넣지 않는다 · 딥링크 경로에 `/auth/kakao` 를 넣지 않는다(웹 카카오 로그인이 깨진다) — 이 플러그인은 둘 다 필요 없다.
5. 카카오 maven 저장소는 플러그인 `build.gradle` 이 **모든 프로젝트**에 더한다(`com.kakao.sdk` 묶음만 받게 좁혀 둠). 앱 모듈이 플러그인의 의존을 풀 때 앱 쪽 저장소 목록을 쓰기 때문이다. gradle 을 '프로젝트 격리' 모드로 바꾸면 이 방식이 막히니 그때는 `android/build.gradle` 의 `allprojects.repositories` 로 옮긴다.
