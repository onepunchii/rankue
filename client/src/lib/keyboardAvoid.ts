// 모바일 소프트 키보드 회피. Capacitor 원격 URL 쉘은 iOS(contentInset: never)·Android(adjustPan)
// 모두 키보드 시 웹뷰가 리사이즈되지 않으므로, visualViewport로 키보드 높이를 계산해
// --keyboard-height CSS 변수와 body.keyboard-open 클래스를 갱신한다.
export function initKeyboardAvoid() {
  if (typeof window === "undefined" || !window.visualViewport) return;
  const vv = window.visualViewport;
  let raf = 0;

  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // 키보드 높이 = 레이아웃 뷰포트 높이 - 보이는 영역 높이 - 보이는 영역의 오프셋.
      // iOS: offsetTop≈0, Android adjustPan: offsetTop이 패닝량을 반영 → 두 플랫폼 모두
      // "보이는 영역의 하단 가장자리"를 정확히 가리키게 된다.
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty("--keyboard-height", `${kb}px`);
      // 80px 미만의 변화는 브라우저 크롬(주소창 등)으로 간주하고 무시
      document.body.classList.toggle("keyboard-open", kb > 80);
    });
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);

  // 다이얼로그·폼 안 입력 포커스 시 키보드 애니메이션 이후 입력이 보이도록 스크롤.
  // 스크롤 가능한 조상이 없으면 no-op이라 채팅 입력창에는 영향 없음.
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
    setTimeout(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 350);
  });

  update();
}
