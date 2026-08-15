// /app (앱 다운로드 랜딩) 문안의 정본.
// client/src/pages/app-landing.tsx 와 server/prerender.ts 가 **같은 객체**를 읽는다.
// 양쪽에 따로 적으면 봇이 본 내용과 사람이 본 내용이 갈려 클로킹이 된다.
// (shared/landingContent.ts · shared/aboutContent.ts 와 같은 이유·같은 패턴)
//
// ★ 문구 정직성: 앱이 실제로 하는 것만 적는다. 확인한 근거 —
//   · 무료 : 결제·구독 없음(앱 안 결제는 매장 파트너 SaaS 전용)
//   · 3쿠션·4구 : SportContext / 점수판이 두 종목을 지원
//   · 자동 계산 : 이닝·평균(에버리지)·하이런을 점수판이 계산
//   · 음성 안내 : @capacitor-community/text-to-speech (네이티브 앱)
//   · 알림 : @capacitor/push-notifications + FCM
//   · 5개 언어 : client/src/lib/i18n LOCALES (ko·en·vi·tr·es)
//   · 설치 없이 웹 : 같은 기능이 www.rankue.co.kr 에서 동작(PWA/웹앱)
//   · 로그인 : 휴대폰 번호 + 구글·애플 (client/src/components/hiq/SocialLogin.tsx)
//   · 계정 삭제 : 앱 안 전체 메뉴 → 계정 삭제 (/account-delete 문서와 동일)
//   순위 보장·"1위 앱" 같은 주장은 넣지 않는다.

export const APP_PAGE_META = {
  title: "랭큐 앱 다운로드 · iOS · Android 당구 점수판",
  desc: "당구 점수판 랭큐를 App Store와 Google Play에서 무료로 받으세요. 터치로 점수를 올리면 이닝·평균(에버리지)·하이런이 자동 계산되고, 앱에서는 음성 안내와 알림까지 함께 동작합니다. 3쿠션·4구 지원.",
  h1: "랭큐 앱 다운로드",
  kicker: "iOS · Android · 무료",
  lead: "당구 점수판과 전적 기록, 크루를 앱으로. App Store와 Google Play에서 받을 수 있고, 설치 없이 웹에서 먼저 써볼 수도 있습니다.",
} as const;

/** 앱으로 쓸 때 더해지는 것(웹에서도 되는 기능은 아래 FEATURES 가 아니라 이쪽에 두지 않는다). */
export const APP_PAGE_EXTRAS: { name: string; desc: string }[] = [
  { name: "음성 안내", desc: "점수와 이닝을 소리로 알려줘 폰을 세워두고 경기에 집중할 수 있습니다." },
  { name: "알림", desc: "크루 소식과 내 경기 관련 알림을 앱에서 받을 수 있습니다(수신 동의 시)." },
  { name: "홈 화면에서 바로", desc: "브라우저를 열고 주소를 입력하는 단계 없이 아이콘으로 바로 시작합니다." },
];

export const APP_PAGE_FAQS: { q: string; a: string }[] = [
  {
    q: "랭큐 앱은 어디서 받나요?",
    a: "iPhone·iPad는 App Store, 안드로이드 휴대폰은 Google Play에서 받을 수 있습니다. 이 페이지의 버튼을 누르면 각 스토어의 랭큐 페이지로 바로 이동합니다.",
  },
  {
    q: "랭큐 앱은 무료인가요?",
    a: "네, 무료로 내려받아 쓸 수 있습니다. 점수판·전적 기록·랭킹·크루 모두 별도 결제 없이 이용합니다.",
  },
  {
    q: "설치하지 않고 웹에서만 써도 되나요?",
    a: "네. www.rankue.co.kr 에 접속하면 설치 없이 바로 시작할 수 있습니다. 앱에서는 음성 안내와 알림이 함께 동작합니다.",
  },
  {
    q: "웹에서 쌓은 기록이 앱에서도 이어지나요?",
    a: "같은 계정으로 로그인하면 이어집니다. 경기 기록은 계정에 저장되므로 기기를 바꾸거나 앱과 웹을 번갈아 써도 그대로 남습니다.",
  },
  {
    q: "어떤 언어를 지원하나요?",
    a: "한국어, 영어, 베트남어, 터키어, 스페인어를 지원합니다.",
  },
  {
    q: "계정을 삭제하고 싶어요.",
    a: "앱의 전체 메뉴 → 계정 삭제에서 직접 삭제할 수 있습니다. 삭제되는 데이터와 절차는 계정 삭제 안내 페이지에 정리돼 있습니다.",
  },
];

/**
 * /app 의 구조화데이터. 클라이언트(useSeo)와 서버 프리렌더가 **같은 함수**를 써서
 * 같은 JSON-LD 를 낸다 — 한쪽만 고치면 봇이 보는 선언과 화면이 어긋난다.
 * 화면에 실제로 보이는 문답(APP_PAGE_FAQS)만 FAQPage 로 낸다(구조화데이터에만 있는
 * 문답은 구글 기준 위반이다).
 *
 * storeUrls 는 **어트리뷰션 파라미터가 없는 원본 스토어 URL**을 넘긴다 —
 * 구조화데이터는 앱의 정체를 선언하는 자리라 utm/ct 가 붙으면 안 된다.
 */
export function appPageJsonLd(origin: string, storeUrls: (string | null)[]) {
  const install = storeUrls.filter((u): u is string => !!u);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "RANKUE",
        alternateName: "랭큐",
        applicationCategory: "SportsApplication",
        operatingSystem: "iOS, Android",
        url: `${origin}/app`,
        ...(install.length ? { installUrl: install, downloadUrl: install } : {}),
        offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
        author: { "@type": "Organization", name: "제이에이치스퀘어" },
      },
      {
        "@type": "FAQPage",
        mainEntity: APP_PAGE_FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

/** 설치 후 첫 경기까지의 순서 — 앱을 받은 사람이 실제로 밟는 단계. */
export const APP_PAGE_STEPS: string[] = [
  "App Store 또는 Google Play에서 랭큐를 설치합니다.",
  "휴대폰 번호, 또는 구글·애플 계정으로 로그인합니다.",
  "종목(3쿠션·4구)을 고르고 점수판을 엽니다.",
  "터치로 점수를 올리면 이닝·평균·하이런이 자동으로 기록되고, 경기가 끝나면 전적으로 저장됩니다.",
];
