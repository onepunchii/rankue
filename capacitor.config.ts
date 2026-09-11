import type { CapacitorConfig } from "@capacitor/cli";

// 랭큐 네이티브 쉘 — mapix 표준(원격 URL 모드, shell-kit 생성).
// 웹뷰가 프로덕션을 직접 로드 → 앱 내용은 git push 배포만으로 갱신, 스토어 재심사 불필요.
// 단 이 파일의 값은 cap sync 때 네이티브 번들(capacitor.config.json)로 복사돼 바이너리에 고정된다 —
// 여기를 고친 건 새 빌드가 스토어에 나가야 사용자에게 닿고, 옛 바이너리는 옛 값 그대로 돈다.
const config: CapacitorConfig = {
  appId: "com.rankue.app",
  appName: "랭큐",
  webDir: "native-shell",
  // 원격 사이트가 그려지기 전 웹뷰 바탕색. 없으면 켤 때마다 흰 화면이 번쩍인다 —
  // 웹 캔버스(client/index.html theme-color, index.css --surface-0)와 같은 색으로 맞춘다.
  backgroundColor: "#f2f0eb",
  // 웹이 "새 바이너리(2세대)"를 첫 요청부터 알아보게 하는 표식. 옛 바이너리엔 이 토큰이 없으니 없으면 1세대로 본다.
  // 'RankueApp' 은 쓰지 않는다 — useNativeBridge 가 그 문자열을 옛 React Native 래퍼로 오인한다.
  appendUserAgent: "RankueNative/2",
  server: {
    url: "https://www.rankue.co.kr",
    androidScheme: "https",
    // 사이트를 못 불러올 때(오프라인 등) webDir 의 안내 페이지(native-shell/index.html)를 띄운다.
    // 없으면 안드로이드는 크롬 오류 화면, iOS 는 빈 화면이 뜬다.
    errorPath: "index.html",
    // apex 주소(rankue.co.kr)로 들어온 링크도 앱 밖으로 튕기지 않게 한다(서버가 www 로 넘긴다).
    // 제3자 도메인(PG·카카오 등)은 절대 넣지 않는다 — 여기 넣은 도메인의 페이지는 네이티브 플러그인을 부를 수 있게 된다.
    allowNavigation: ["rankue.co.kr"],
  },
  ios: {
    contentInset: "never", // safe-area는 웹 CSS의 env(safe-area-inset-*)가 직접 처리
    // iOS 빌드에 넣을 플러그인 허용 목록. capacitor-native-settings 만 뺐다 — 애플 비공개 설정 주소(App-prefs:…) 30여 개를
    // 바이너리에 박아 심사 지침 2.5.1(비공개 API) 거절 위험이 있다. iOS 설정 화면은 웹이 'app-settings:' 이동으로 연다.
    // 주의: 목록이라 package.json 에 플러그인을 새로 넣으면 여기에도 적어야 iOS 에 들어간다(안 적으면 iOS 에서만 조용히 빠진다).
    includePlugins: [
      "@capacitor-community/keep-awake",
      "@capacitor-community/text-to-speech",
      "@capacitor/app",
      "@capacitor/app-launcher",
      "@capacitor/browser",
      "@capacitor/filesystem",
      "@capacitor/geolocation",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/local-notifications",
      "@capacitor/push-notifications",
      "@capacitor/share",
      "@capacitor/text-zoom",
      "@capawesome/capacitor-app-review",
      "@capawesome/capacitor-app-update",
      "@capawesome/capacitor-badge",
      "@capgo/capacitor-social-login",
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      // 앱을 보고 있는 동안 온 푸시도 배너·알림센터·소리·배지로 보여준다.
      // 없으면 두 OS 모두 포그라운드 알림을 조용히 버린다(알림함 DB 에만 쌓이고 사용자는 모름).
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
    LocalNotifications: {
      // 로컬 알림도 원격 푸시와 같은 상태바 아이콘·색을 쓴다(안드로이드 전용 값, iOS 는 무시).
      smallIcon: "ic_stat_notify",
      iconColor: "#64DD17",
    },
    SocialLogin: {
      // 실제로 쓰는 건 구글·애플뿐. false 면 해당 SDK 가 바이너리에서 빠진다 —
      // 쓰지도 않는 페이스북 SDK 의 트래킹 선언이 개인정보 라벨과 어긋나는 걸 막는다.
      // cap sync 뒤 플러그인 스크립트가 안드로이드 gradle 과 iOS Package.swift 를 이 값대로 고친다.
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
    SystemBars: {
      // 웹이 밝은 화면이라 상태바 아이콘을 늘 어두운 색으로 고정한다(LIGHT = 밝은 바탕용 어두운 아이콘).
      // 기본값 DEFAULT 는 기기 다크모드를 따라가 흰 아이콘이 크림색 위에 묻힌다.
      // 안드로이드는 이 값으로 고정한다 — 띠 바탕을 앱 테마(크림색)가 칠하고, SystemBars 는 스타일을 바꿀 때마다 그 바탕을
      // 다시 칠해서 DARK 로 바꾸면 크림색 위 흰 아이콘이 되어 시계·배터리가 안 보인다.
      // 어두운 구역(온라인게임 로비 등)에서 SystemBars.setStyle({ style: "DARK" }) 는 iOS 에서만(Capacitor.getPlatform() === "ios") 부른다.
      style: "LIGHT",
    },
  },
};

export default config;
