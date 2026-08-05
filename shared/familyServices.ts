// 패밀리 서비스 레지스트리 — 형제 서비스 상호 홍보용.
//
// 이 파일이 담는 것은 **사실(어느 스토어에 있나)뿐**이다. 카드 문구는 담지 않는다:
//   · 문구는 사이트마다 언어 수가 다르다(랭큐 5개, xong 10개, tohk 7개).
//     레지스트리가 문구를 들면 6서비스 × 3문장 × 10언어 = 180개를 한 파일에 지게 된다.
//   · 문구는 그 사이트 방문자에게 맞춰 다르게 쓰는 게 광고로서 더 낫다(취향의 영역).
// → 문구는 각 사이트의 i18n 사전에 둔다. **키 이름은 그 사이트의 관용구를 따른다** —
//   랭큐는 화면 단위 접두사를 써서 `menu.<id>Chip/Title/Desc` 이고, mapix·xong·onp·무당k 는
//   `family.*` 네임스페이스를 쓴다. 사이트마다 사전 구조가 달라 억지로 통일하지 않는다.
//
// ⚠️ 이 파일은 6개 레포에 **같은 내용으로 복제**된다. 원본은 mapix 다
//    (mapix 가 superHub·IndexNow 중앙 역할을 이미 맡고 있다).
//    스토어 URL 이 바뀌면 6곳을 같이 고쳐야 한다. 문구가 자주 바뀌면 그때
//    mapix 가 JSON 으로 서빙하는 구조로 옮긴다.

export type FamilyId = "mapix" | "rankue" | "xong" | "onp" | "tohk" | "mudangk";

export interface FamilyService {
  id: FamilyId;
  /** 항상 존재한다. 스토어가 없는 기기는 여기로 보낸다. */
  web: string;
  /** App Store URL. null = iOS 앱 없음 → 애플 기기는 web 으로. */
  ios: string | null;
  /** Play URL. null = 안드로이드 앱 없음 → 안드로이드 기기는 web 으로. */
  android: string | null;
}

// 앱이 있는 6개만 올린다. 폴리(polli.co.kr)·seeme(seeme.my)는 앱이 없어 이번 범위 밖이다.
//
// tohk = "현경이에게 - 마음을 전하는 손편지"(번들 kr.co.tohk.naepyeonji, id6760213440).
//   tohk.co.kr 과 현경이에게는 **같은 서비스**다(같은 레포 onepunchii/tohk).
//   손편지 + 편지함 + 기념일·특별한 날 + 작명이 한 사이트에 있다.
const RAW: FamilyService[] = [
  {
    id: "mapix",
    web: "https://mapix.me",
    ios: "https://apps.apple.com/app/id6787616926",
    android: "https://play.google.com/store/apps/details?id=me.mapix.app",
  },
  {
    id: "rankue",
    web: "https://www.rankue.co.kr",
    ios: "https://apps.apple.com/app/id6760333313",
    android: "https://play.google.com/store/apps/details?id=com.rankue.app",
  },
  {
    id: "xong",
    web: "https://xong.co.kr",
    ios: "https://apps.apple.com/app/id6790474855",
    // ⚠️ TODO(플레이 승인되면 아래 줄로 되돌린다):
    //   "https://play.google.com/store/apps/details?id=kr.co.xong.app"
    // 2026-08-03 실측: 그 Play 페이지가 아직 404 다(심사 대기). 같은 방식으로 확인한
    // 나머지 5개는 200 이므로 조회 방법 문제가 아니다. 404 인 링크를 걸어 두면
    // 안드로이드 사용자가 카드를 누를 때마다 Play 오류 화면을 만난다 → 그동안은 웹으로.
    android: null,
  },
  {
    id: "onp",
    web: "https://onp.co.kr",
    // ★ /kr/ 를 반드시 넣는다 — onp 는 **한국 스토어프론트 전용**이다.
    //   실측(2026-08-03): iTunes lookup 이 kr 만 O, us/jp/vn/tr/es 는 X.
    //   국가 세그먼트가 없으면 데스크톱에서 열 때 하드 404 가 된다(/kr/ 는 301 → 정상 페이지).
    //   아이폰에서는 두 형식 모두 itms-appss:// 로 301 돼 App Store 앱이 열리므로,
    //   해외 계정 사용자는 앱 안에서 "이 국가에서 이용 불가" 안내를 받는다(웹 404 가 아니다).
    ios: "https://apps.apple.com/kr/app/id6790407283",
    android: "https://play.google.com/store/apps/details?id=kr.co.onp.app",
  },
  {
    id: "tohk",
    // "현경이에게 - 마음을 전하는 손편지". 손편지 + 편지함 + 기념일·특별한 날 + 작명.
    //
    // ⚠️ 운세·사주·꿈해몽으로 홍보하지 말 것. tohk 가 그 기능을 **의도적으로 닫아 뒀다**:
    //    레포에 SHOW_FORTUNE = false 가 세 곳(src/app/page.tsx, src/app/menu/page.tsx,
    //    src/components/layout/Navbar/Navbar.tsx)에 박혀 있어 자기 UI 의 진입점이 전부 없다.
    //    커밋 2f21961 "App Store Review 대응 - UI 구조 변경 및 운세 기능 임시 숨김".
    //    (/saju 페이지 자체는 살아 있다 — CSR 이라 SSR 본문이 25자로 보이는 것뿐이다.
    //     한때 "빈 페이지"라고 적었는데 그 표현은 부정확했다.)
    web: "https://www.tohk.co.kr",
    ios: "https://apps.apple.com/kr/app/id6760213440", // onp 와 같은 이유로 /kr/ 필수(KR 전용)
    android: "https://play.google.com/store/apps/details?id=kr.co.tohk.pwa",
  },
  {
    id: "mudangk",
    web: "https://ko-saju.com",
    ios: null, // iOS 앱 없음 → 애플 기기는 웹으로 (형 지시)
    android: "https://play.google.com/store/apps/details?id=com.Mudang.K.app",
  },
];

export const FAMILY_SERVICES: readonly FamilyService[] = RAW;

export type FamilyPlatform = "ios" | "android" | "other";

/**
 * 기기에 맞는 착지점 1개를 고른다.
 *
 * ★ 애플 기기에 Play 링크를, 안드로이드에 App Store 링크를 절대 보여주지 않는다.
 *   애플 심사 지침이 앱 안에 다른 모바일 플랫폼 언급·이미지를 넣는 것을 막는다.
 *   해당 스토어 앱이 없으면 웹으로 보낸다 — 죽은 스토어 링크보다 낫다.
 */
export function familyTarget(s: FamilyService, platform: FamilyPlatform): string {
  if (platform === "ios") return s.ios ?? s.web;
  if (platform === "android") return s.android ?? s.web;
  return s.web;
}

/** 착지점이 스토어인가(=CTA 문구를 "앱 설치"로 바꿔야 하는가). */
export function familyIsStore(s: FamilyService, platform: FamilyPlatform): boolean {
  return platform === "ios" ? !!s.ios : platform === "android" ? !!s.android : false;
}

/**
 * 유입 출처를 URL 에 심는다. 이게 없으면 "패밀리 카드가 설치를 몇 개 만들었나"를
 * Play Console·App Store Connect 에서 영영 확인할 수 없고 감으로 얘기하게 된다.
 *   Play  : referrer=utm_source=<from>&utm_medium=family
 *   Apple : ct=family_<from>  (App Analytics 의 캠페인 토큰)
 *   웹    : utm_source/medium 쿼리
 */
export function withFamilyAttribution(url: string, fromId: FamilyId): string {
  const sep = url.includes("?") ? "&" : "?";
  if (url.includes("play.google.com")) {
    const ref = encodeURIComponent(`utm_source=${fromId}&utm_medium=family`);
    return `${url}${sep}referrer=${ref}`;
  }
  if (url.includes("apps.apple.com")) {
    return `${url}${sep}ct=family_${fromId}`;
  }
  return `${url}${sep}utm_source=${fromId}&utm_medium=family`;
}

/** 자기 자신을 뺀 목록. 각 사이트는 자기 id 를 넘긴다. */
export function familyOthers(selfId: FamilyId): FamilyService[] {
  return FAMILY_SERVICES.filter((s) => s.id !== selfId);
}
