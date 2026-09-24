// 브리핑 아카이브(/briefing/:date) 문구 — 클라이언트 페이지와 봇 프리렌더가 공유해
// 문자 단위 일치를 보장한다 (shared/pbaMeta.ts 와 같은 패턴). 페이지는 ko 단일 언어.

export interface BriefingData {
    type: "onThisDay" | "gap";
    name: string;
    nativeName: string | null;
    playerUmbId: string;
    points?: number;
    yearsAgo?: number;
    rivalName?: string;
    rivalNativeName?: string | null;
    gap?: number;
}

const ko = (native: string | null | undefined, latin: string) => native ?? latin;

// "오늘"은 KST 기준 — UTC 를 쓰면 한국 새벽(0~9시)에 어제 날짜가 뜬다.
// 클라이언트·프리렌더가 같은 함수를 써서 일치 보장.
export const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ── 조사 ──────────────────────────────────────────────────────────
// 이름 뒤 조사를 받침으로 고른다 — "쿠드롱와"가 검색 결과에 그대로 나갔다(2026-09-24 점검).
// 한글은 끝 글자 받침, 숫자는 읽는 소리, 로마자는 끝이 m·n·l·ng 일 때만 받침으로 본다(Jaspers → 야스퍼스처럼 대개 모음으로 끝난다).
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0]; // 영·일·이·삼·사·오·육·칠·팔·구 의 받침(0 = 없음, 8 = ㄹ)
function lastJong(word: string): number {
    const w = word.trim().replace(/\s*\([^)]*\)$/, "").replace(/[^0-9A-Za-z가-힣]+$/, "");
    const ch = w.slice(-1);
    if (!ch) return 0;
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
    if (/[0-9]/.test(ch)) return DIGIT_JONG[Number(ch)];
    const lw = w.toLowerCase();
    if (/ng$/.test(lw)) return 21;
    if (/l$/.test(lw)) return 8;
    if (/[mn]$/.test(lw)) return 4;
    return 0;
}
export type JosaPair = "와/과" | "이/가" | "을/를" | "은/는" | "로/으로";
/** 이름 + 조사 — josa("쿠드롱", "와/과") → "쿠드롱과". 로/으로 는 ㄹ 받침이면 '로'. */
export function josa(word: string, pair: JosaPair): string {
    const j = lastJong(word);
    const [noJong, withJong] = pair === "와/과" ? ["와", "과"] : pair === "이/가" ? ["가", "이"] : pair === "을/를" ? ["를", "을"] : pair === "은/는" ? ["는", "은"] : ["로", "으로"];
    if (pair === "로/으로") return word + (j === 0 || j === 8 ? noJong : withJong);
    return word + (j === 0 ? noJong : withJong);
}

export function briefingLineKo(b: BriefingData): string {
    if (b.type === "onThisDay") {
        return `${b.yearsAgo}년 전 오늘의 세계 1위 — ${ko(b.nativeName, b.name)} (${b.points}점)`;
    }
    return `1위 ${ko(b.nativeName, b.name)}, 2위 ${josa(ko(b.rivalNativeName, b.rivalName ?? ""), "와/과")} ${b.gap}점 차`;
}

export function briefingDateKo(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00Z");
    return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 오늘자 대표 페이지(/briefing)의 제목 — 날짜를 넣지 않는다. 검색 결과에 캐시된 제목이 지난 날짜로 남으면 낡은 페이지로 보인다(2026-09-24). */
export const BRIEFING_HUB_TITLE = "오늘의 당구 브리핑 — UMB 3쿠션 세계랭킹 소식 | 랭큐";

/**
 * 오늘 날짜면 대표 제목, 지난 날짜(보관 페이지·noindex)는 날짜를 단 제목.
 * 프리렌더·화면·RSS 가 briefingTitle(date) 한 가지로 부르므로 '오늘이냐'를 여기서 가른다.
 */
export function briefingTitle(dateStr: string, hub: boolean = dateStr >= todayKst()): string {
    return hub ? BRIEFING_HUB_TITLE : `당구 브리핑 ${briefingDateKo(dateStr)} · UMB 세계랭킹 | 랭큐`;
}

export function briefingDesc(b: BriefingData | null, dateStr: string): string {
    return b
        ? `${briefingDateKo(dateStr)} 당구 브리핑: ${briefingLineKo(b)}. UMB 공식 3쿠션 세계랭킹 데이터로 매일 갱신.`
        : `${briefingDateKo(dateStr)} 당구 브리핑. UMB 공식 3쿠션 세계랭킹 데이터로 매일 갱신.`;
}
