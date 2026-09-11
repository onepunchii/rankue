// 앱 업데이트 안내 정책 — 웹이 설치된 네이티브 빌드 번호를 보고 "새 버전 받기"를 권하거나 요구한다(감사 N7).
//
// 왜 웹에 두나: 원격 URL 모드라 웹은 배포 즉시 모든 사용자에게 가지만, 네이티브 변경(딥링크·오프라인
// 안내·새 플러그인)은 사용자가 업데이트해야 닿는다. 옛 바이너리를 새 빌드로 옮길 수단이 이것뿐이다.
//
// ★ 켜는 순서: 새 버전이 스토어에서 심사 통과·출시된 뒤에만 켠다 — 먼저 켜면 스토어에 아직 없는 버전으로 조르게 된다.
//   - iOS: 자동(autoFromStore). App Store 에 latestVersion 이상이 실제로 올라오면(서버가 애플 공개 조회로 확인,
//     GET /api/hiq/app/store-version) 저절로 켜진다(2026-09-11 오너). 사람이 enabled 를 바꿀 필요 없다.
//   - 안드로이드: Play 에는 공개 조회가 없어서 수동. 프로덕션 출시를 확인한 뒤 enabled 를 true 로.
// ★ 다음 버전을 낼 때: latestBuild 와 latestVersion 을 **반드시 같이** 올린다(한 빌드의 두 이름이다).
//   빌드만 올리면 스토어가 옛 버전을 보이는 순간 자동 조건이 이미 참이라, 아직 없는 버전으로 조르게 된다.
//   appVersion.test.ts 의 출시 표가 둘이 어긋나면 실패하도록 막고 있다.
//   minBuild(강제)는 옛 바이너리로는 정말 못 쓰게 된 경우에만 올린다 — 닫을 수 없는 화면이 뜬다.
// 빌드 번호: iOS 는 CFBundleVersion(Xcode CURRENT_PROJECT_VERSION), 안드로이드는 versionCode.

export type UpdatePolicy = {
    /** true 면 무조건 켠다. false 여도 autoFromStore 조건이 맞으면 켜진다. */
    enabled: boolean;
    /** 스토어에 latestVersion 이상이 올라와 있으면 켠 것으로 본다(iOS 전용 — 스토어 버전은 서버가 알려 준다). */
    autoFromStore?: boolean;
    /** latestBuild 의 마케팅 버전('1.2'). 자동 켜기는 스토어 버전을 이것과 비교한다. */
    latestVersion: string;
    /** 이 빌드보다 낮으면 닫을 수 있는 안내(하루 한 번). */
    latestBuild: number;
    /** 이 빌드보다 낮으면 닫을 수 없는 안내. 0 이면 강제하지 않는다. */
    minBuild: number;
};

export const APP_UPDATE_POLICY: Record<"ios" | "android", UpdatePolicy> = {
    // 1.2(7) 가 이번 통합 빌드. 옛 사용자: 1.0(2)~1.0(5), 1.1(6)
    // App Store 에 1.2 가 뜨는 순간부터 1.2(7) 미만에게 안내(자동). 지금 스토어는 1.1.
    ios: { enabled: false, autoFromStore: true, latestVersion: "1.2", latestBuild: 7, minBuild: 0 },
    // 이번 통합 빌드는 versionCode 5 예정(현재 스토어 1.0.2 = 4). 실제 올린 번호와 맞는지 켜기 전에 확인한다.
    android: { enabled: false, latestVersion: "1.2.0", latestBuild: 5, minBuild: 0 },
};

export type UpdateDecision = "none" | "suggest" | "force";

/**
 * 설치된 빌드 → 안내 종류(순수). 빌드를 모르면(null·숫자 아님) 아주 옛 바이너리로 본다 —
 * App 플러그인이 없을 만큼 오래된 앱이라는 뜻이기 때문이다.
 */
export function decideUpdate(
    policy: UpdatePolicy | undefined,
    installedBuild: number | null,
    storeVersion?: string | null,
): UpdateDecision {
    if (!policy || !isPolicyActive(policy, storeVersion)) return "none";
    const build = installedBuild !== null && Number.isFinite(installedBuild) ? installedBuild : 0;
    if (policy.minBuild > 0 && build < policy.minBuild) return "force";
    if (build < policy.latestBuild) return "suggest";
    return "none";
}

/** '1.2' · '1.10.3' 형식을 숫자 배열로. 형식이 아니면 null. */
function parseVersion(v: unknown): number[] | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return /^\d+(\.\d+){0,3}$/.test(t) ? t.split(".").map(Number) : null;
}

/** 버전 비교(순수): a>b → 1, 같으면 0, a<b → -1. 모자란 자리는 0('1.2' = '1.2.0'). 못 읽으면 null. */
export function compareVersions(a: string, b: string): number | null {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return null;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
}

/** 안내가 켜진 상태인가(순수). 스토어 버전을 모르면 자동 켜기는 꺼진 것으로 본다. */
export function isPolicyActive(policy: UpdatePolicy | undefined, storeVersion?: string | null): boolean {
    if (!policy) return false;
    if (policy.enabled) return true;
    if (!policy.autoFromStore || !storeVersion) return false;
    const c = compareVersions(storeVersion, policy.latestVersion);
    return c !== null && c >= 0;
}

/** 설치된 빌드가 이미 최신인가(순수). 그렇다면 스토어를 물을 필요도 없다 — 결과가 늘 '없음'이다. */
export function isUpToDate(policy: UpdatePolicy | undefined, installedBuild: number | null): boolean {
    if (!policy || installedBuild === null || !Number.isFinite(installedBuild)) return false;
    return installedBuild >= policy.latestBuild && (policy.minBuild <= 0 || installedBuild >= policy.minBuild);
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
