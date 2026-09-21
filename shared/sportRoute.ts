/**
 * 주소로 종목을 알 수 있는가 — 검색(네이버·구글)에서 골프 선수 페이지로 바로 들어온 사람에게 당구 껍데기가 씌워지던
 * 문제(2026-09-21 오너: "골프로 들어오면 당구 UI 색상과 혼합되어 꼬인다").
 *
 * 종목 테마(<html data-sport>)와 하단 탭은 저장된 선호(rankue_current_sport, 기본 당구)만 보고 정해졌다.
 * 골프 선수 페이지 자체는 골프 토큰으로 그려지는데 껍데기는 당구라 두 모드가 한 화면에 섞였다.
 * 주소가 종목을 확실히 말해 주는 페이지에선 주소가 이긴다. 두 종목이 함께 쓰는 화면(/dashboard·/menu·/club…)은
 * 그대로 저장된 선호를 따른다.
 */
export type RouteSport = "GOLF" | "BILLIARDS";

const GOLF_PREFIXES = ["/golf", "/golfer", "/golf-ranking"] as const;
/** 당구에만 있는 화면. /ranking·/history 같은 공용 화면은 넣지 않는다(골프 모드에서 골프 내용을 그린다). */
const BILLIARDS_PREFIXES = ["/online-game", "/pba", "/pba-player", "/player", "/stores", "/store", "/world-ranking", "/briefing"] as const;

function startsWithPath(path: string, prefix: string): boolean {
    return path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?");
}

/** 주소만으로 종목이 정해지면 그 종목, 아니면 null(저장된 선호를 쓴다). 질의·해시는 무시한다. */
export function sportForPath(pathname: string): RouteSport | null {
    const path = pathname.split(/[?#]/)[0] || "/";
    if (GOLF_PREFIXES.some((p) => startsWithPath(path, p))) return "GOLF";
    if (BILLIARDS_PREFIXES.some((p) => startsWithPath(path, p))) return "BILLIARDS";
    return null;
}
