// 패밀리 서비스 레지스트리 — 형제 서비스 상호 홍보용.
//
// 이 파일이 담는 것은 **사실(어느 스토어에 있나)뿐**이다. 카드 문구는 담지 않는다:
//   · 문구는 사이트마다 언어 수가 다르다(랭큐 5개, xong 10개, tohk 7개).
//     레지스트리가 문구를 들면 6서비스 × 3문장 × 10언어 = 180개를 한 파일에 지게 된다.
//   · 문구는 그 사이트 방문자에게 맞춰 다르게 쓰는 게 광고로서 더 낫다(취향의 영역).
// → 문구는 각 사이트의 i18n 사전에 `menu.<id>Chip/Title/Desc` 규칙으로 둔다.
//   랭큐가 이미 그 규칙을 쓰고 있어(ko.ts 의 menu.tohkChip 등) 그대로 이어간다.
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
//   손편지 + 사주(/saju) + 특별한 날 + 작명이 한 사이트에 있다.
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
    android: "https://play.google.com/store/apps/details?id=kr.co.xong.app",
  },
  {
    id: "onp",
    web: "https://onp.co.kr",
    ios: "https://apps.apple.com/app/id6790407283",
    android: "https://play.google.com/store/apps/details?id=kr.co.onp.app",
  },
  {
    id: "tohk",
    // 손편지가 앱의 정체지만, 사주·꿈해몽이 훅으로 더 세다. 문구를 운세로 쓸 경우
    // 웹 착지점은 반드시 /saju 여야 한다 — 홈(=손편지)으로 보내면 훅과 화면이 어긋난다.
    web: "https://www.tohk.co.kr",
    ios: "https://apps.apple.com/app/id6760213440",
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
