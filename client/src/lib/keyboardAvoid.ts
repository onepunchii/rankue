import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

// 모바일 소프트 키보드 회피. 키보드 높이를 --keyboard-height CSS 변수와
// body.keyboard-open 클래스로 노출해, 하단 고정 입력창·다이얼로그가 키보드 위로 올라오게 한다.
//
// 플랫폼별 사정:
//  - iOS(WKWebView, contentInset:never): 웹뷰가 리사이즈되지 않아 visualViewport로 계산 가능.
//  - Android(targetSdk 35+): edge-to-edge가 강제되어 adjustResize로도 웹뷰가 줄지 않고
//    visualViewport도 신뢰하기 어렵다 → 네이티브 IME 높이를 주는 @capacitor/keyboard를 쓴다.
//  - 웹 브라우저: visualViewport.

const setKeyboardHeight = (px: number) => {
  document.documentElement.style.setProperty("--keyboard-height", `${px}px`);
  // 80px 미만은 브라우저 크롬(주소창 등) 변화로 간주하고 무시
  document.body.classList.toggle("keyboard-open", px > 80);
};

function initNative() {
  // 네이티브가 웹뷰를 임의로 밀거나 줄이지 않게 두고, 위치 보정은 CSS로 직접 처리한다.
  (Keyboard as any).setResizeMode?.({ mode: "none" })?.catch?.(() => { /* 미지원 무시 */ });

  Keyboard.addListener("keyboardWillShow", (info) => setKeyboardHeight(info.keyboardHeight));
  Keyboard.addListener("keyboardDidShow", (info) => setKeyboardHeight(info.keyboardHeight));
  Keyboard.addListener("keyboardWillHide", () => setKeyboardHeight(0));
  Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
}

function initWeb() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  let raf = 0;

  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // 보이는 영역의 하단 가장자리까지 남은 거리 = 키보드가 가린 높이.
      setKeyboardHeight(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    });
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}

export function initKeyboardAvoid() {
  if (typeof window === "undefined") return;

  // 네이티브 앱이라도 플러그인이 없는 구버전 APK가 있을 수 있으므로 실패 시 웹 경로로 폴백.
  if (Capacitor.isNativePlatform()) {
    try {
      initNative();
    } catch {
      initWeb();
    }
  } else {
    initWeb();
  }

  // 스크롤 가능한 폼/다이얼로그 안에서는 포커스된 입력이 보이도록 끌어올린다.
  // 스크롤 조상이 없으면 no-op이라 채팅 입력창에는 영향 없음.
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
    setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
  });
}
