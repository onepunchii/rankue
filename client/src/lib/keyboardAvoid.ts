import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

// 모바일 소프트 키보드 회피. 키보드 높이를 --keyboard-height CSS 변수와
// body.keyboard-open 클래스로 노출해, 하단 고정 입력창·다이얼로그가 키보드 위로 올라오게 한다.
//
// 플랫폼별 사정:
//  - iOS(WKWebView, contentInset:never): 웹뷰가 리사이즈되지 않아 visualViewport로 계산 가능.
//  - Android(targetSdk 35+): edge-to-edge가 강제되어 adjustResize로도 웹뷰가 줄지 않는다.
//    네이티브 IME 높이를 주는 @capacitor/keyboard가 가장 정확하다.
//  - 웹 브라우저: visualViewport.
//
// ★ 웹 경로(visualViewport)는 안드로이드에서도 쓸 만하다 — client/index.html 의 뷰포트 메타에
//   `interactive-widget=resizes-content` 가 있어서 키보드가 뜰 때 크롬이 뷰포트를 줄여준다.
//   그래서 플러그인이 없는 구버전 APK에서도 폴백이 실제로 동작한다. 이 메타를 빼면 폴백이 죽는다.

const setKeyboardHeight = (px: number) => {
  document.documentElement.style.setProperty("--keyboard-height", `${px}px`);
  // 80px 미만은 브라우저 크롬(주소창 등) 변화로 간주하고 무시
  document.body.classList.toggle("keyboard-open", px > 80);
};

function initNative() {
  // 네이티브가 웹뷰를 임의로 밀거나 줄이지 않게 두고, 위치 보정은 CSS로 직접 처리한다.
  (Keyboard as any).setResizeMode?.({ mode: "none" })?.catch?.(() => { /* 미지원 무시 */ });

  // addListener 는 Promise 를 돌려준다 — reject 를 방치하면 unhandled rejection 이 쌓인다.
  // (경로 선택은 useNativeKeyboard() 에서 이미 끝났으므로 여기선 조용히 무시한다.)
  const on = (event: string, handler: (info: any) => void) =>
    Promise.resolve((Keyboard as any).addListener(event, handler)).catch(() => { /* 무시 */ });

  on("keyboardWillShow", (info) => setKeyboardHeight(info.keyboardHeight));
  on("keyboardDidShow", (info) => setKeyboardHeight(info.keyboardHeight));
  on("keyboardWillHide", () => setKeyboardHeight(0));
  on("keyboardDidHide", () => setKeyboardHeight(0));
}

/**
 * 네이티브 IME 경로를 쓸 수 있는가 — `Capacitor.isPluginAvailable` 이 유일한 판단 근거다.
 *
 * ★ import 성공 여부로 판단하면 안 된다. @capacitor/keyboard 는 package.json 에 있으니
 *   JS 는 언제나 로드되고, 플러그인 부재는 **네이티브 브리지 호출이 비동기 reject** 되는
 *   형태로만 드러난다. 예전 구현은 `try { initNative() } catch { initWeb() }` 였는데
 *   catch 는 동기 throw 만 잡으므로, 플러그인이 없는 구버전 APK(versionCode 3)에서
 *   폴백이 **한 번도 실행되지 않았다** — 리스너가 영영 안 울려 키보드가 그대로 가렸다.
 *
 * 판단이 불가능하면 웹 경로를 고른다. 두 오판의 비용이 다르기 때문이다:
 *   - 플러그인 없는데 네이티브 경로 → 키보드 회피가 완전히 죽는다
 *   - 플러그인 있는데 웹 경로 → index.html 의 interactive-widget=resizes-content 덕에 대체로 동작한다
 */
function useNativeKeyboard(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const check = (Capacitor as { isPluginAvailable?: (name: string) => boolean }).isPluginAvailable;
  if (typeof check !== "function") return false; // 판단 불가 → 웹 경로
  try {
    return check.call(Capacitor, "Keyboard") === true;
  } catch {
    return false;
  }
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

  // 네이티브 앱이라도 플러그인이 없는 구버전 APK가 있으므로 **설치 여부를 실제로 확인하고** 고른다.
  if (useNativeKeyboard()) initNative();
  else initWeb();

  // 스크롤 가능한 폼/다이얼로그 안에서는 포커스된 입력이 보이도록 끌어올린다.
  // 스크롤 조상이 없으면 no-op이라 채팅 입력창에는 영향 없음.
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
    setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
  });
}
