/**
 * 예전의 떠 있는 설치 띠 — 2026-10-06 에 아래에서 올라오는 팝업(AppInstallSheet)으로 바뀌었다.
 * 오너: "지금 웹 가입 사람이 많은데 웹으로 진입 시 기기에 따른 앱 설치 팝업창 잘 디자인해서 만들어줘. 지금 팝업보다 잘."
 *
 * 옛 띠가 하던 것 가운데 걷어낸 것:
 *   · 들어오자마자 뜨고, 닫아도 기억하지 않던 것 → shared/installPrompt 의 규칙(2화면 또는 20초 뒤 · 닫으면 7일…).
 *   · iOS '홈 화면에 추가' 안내 창 — App Store 주소가 늘 있어 도달할 수 없는 코드였다.
 *   · 안드로이드 '설치 없이 홈 화면에 추가'(PWA) 보조 링크 · PC 의 PWA 설치 띠 — 스토어 앱과 섞이면 "무엇을 깔라는 건지"가 흐려진다.
 *   · 카카오로만 가입한 회원에게 숨기던 것 — '앱에서 열기'가 생겨 풀었다(휴대폰에서는 그 단추가 첫째. installSheetPlan).
 *
 * 이 파일은 이름을 부르던 곳이 깨지지 않게 남긴 얇은 껍데기다. 새 코드는 AppInstallSheet 를 직접 쓴다(App.tsx 의 InstallBannerGate).
 * 한 화면에 둘을 같이 붙이지 말 것 — 같은 팝업이 두 번 뜬다.
 */
import { useLocation } from "wouter";
import { AppInstallSheet } from "./AppInstallSheet";

export function HiqInstallBanner() {
    const [location] = useLocation();
    return <AppInstallSheet path={location} />;
}
