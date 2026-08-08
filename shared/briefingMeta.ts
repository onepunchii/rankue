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

export function briefingLineKo(b: BriefingData): string {
    if (b.type === "onThisDay") {
        return `${b.yearsAgo}년 전 오늘의 세계 1위 — ${ko(b.nativeName, b.name)} (${b.points}점)`;
    }
    return `1위 ${ko(b.nativeName, b.name)} — 2위 ${ko(b.rivalNativeName, b.rivalName ?? "")}와 ${b.gap}점 차`;
}

export function briefingDateKo(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00Z");
    return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function briefingTitle(dateStr: string): string {
    return `오늘의 당구 브리핑 ${briefingDateKo(dateStr)} · UMB 세계랭킹 | 랭큐`;
}

export function briefingDesc(b: BriefingData | null, dateStr: string): string {
    return b
        ? `${briefingDateKo(dateStr)} 당구 브리핑 — ${briefingLineKo(b)}. UMB 공식 3쿠션 세계랭킹 데이터로 매일 갱신.`
        : `${briefingDateKo(dateStr)} 당구 브리핑. UMB 공식 3쿠션 세계랭킹 데이터로 매일 갱신.`;
}
