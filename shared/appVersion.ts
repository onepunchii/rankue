// 앱 업데이트 안내 정책 — 웹이 설치된 네이티브 빌드 번호를 보고 "새 버전 받기"를 권하거나 요구한다(감사 N7).
//
// 왜 웹에 두나: 원격 URL 모드라 웹은 배포 즉시 모든 사용자에게 가지만, 네이티브 변경(딥링크·오프라인
// 안내·새 플러그인)은 사용자가 업데이트해야 닿는다. 옛 바이너리를 새 빌드로 옮길 수단이 이것뿐이다.
//
// ★ 켜는 순서(오너): 새 버전이 두 스토어 모두에서 심사 통과·출시된 것을 확인한 뒤에만 enabled 를 true 로 바꾼다.
//   출시 전에 켜면 스토어에 아직 없는 버전으로 업데이트하라고 조르게 된다.
//   minBuild(강제)는 옛 바이너리로는 정말 못 쓰게 된 경우에만 올린다 — 닫을 수 없는 화면이 뜬다.
// 빌드 번호: iOS 는 CFBundleVersion(Xcode CURRENT_PROJECT_VERSION), 안드로이드는 versionCode.

export type UpdatePolicy = {
    /** false 면 어떤 안내도 띄우지 않는다. */
    enabled: boolean;
    /** 이 빌드보다 낮으면 닫을 수 있는 안내(하루 한 번). */
    latestBuild: number;
    /** 이 빌드보다 낮으면 닫을 수 없는 안내. 0 이면 강제하지 않는다. */
    minBuild: number;
};

export const APP_UPDATE_POLICY: Record<"ios" | "android", UpdatePolicy> = {
    // 1.2(7) 가 이번 통합 빌드. 옛 사용자: 1.0(2)~1.0(5), 1.1(6)
    ios: { enabled: false, latestBuild: 7, minBuild: 0 },
    // 이번 통합 빌드는 versionCode 5 예정(현재 스토어 1.0.2 = 4). 실제 올린 번호와 맞는지 켜기 전에 확인한다.
    android: { enabled: false, latestBuild: 5, minBuild: 0 },
};

export type UpdateDecision = "none" | "suggest" | "force";

/**
 * 설치된 빌드 → 안내 종류(순수). 빌드를 모르면(null·숫자 아님) 아주 옛 바이너리로 본다 —
 * App 플러그인이 없을 만큼 오래된 앱이라는 뜻이기 때문이다.
 */
export function decideUpdate(policy: UpdatePolicy | undefined, installedBuild: number | null): UpdateDecision {
    if (!policy || !policy.enabled) return "none";
    const build = installedBuild !== null && Number.isFinite(installedBuild) ? installedBuild : 0;
    if (policy.minBuild > 0 && build < policy.minBuild) return "force";
    if (build < policy.latestBuild) return "suggest";
    return "none";
}

/** App.getInfo().build(문자열) → 숫자. 못 읽으면 null. */
export function parseBuildNumber(raw: unknown): number | null {
    if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : null;
    if (typeof raw !== "string" || !/^\s*\d+/.test(raw)) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isSafeInteger(n) ? n : null;
}

/** 닫을 수 있는 안내를 오늘 이미 보여 줬는가(순수, 기기 현지 날짜 기준). */
export function shownToday(lastShownAt: number | null, now: number): boolean {
    if (lastShownAt === null || !Number.isFinite(lastShownAt) || lastShownAt > now) return false;
    return new Date(lastShownAt).toDateString() === new Date(now).toDateString();
}
