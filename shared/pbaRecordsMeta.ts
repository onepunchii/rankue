// PBA·LPBA 통산 기록 순위(/pba/records, 2026-09-24) — 순위 계산·제목·설명·표기·구조화데이터를 한곳에 둔다.
// 화면(useSeo)·봇 프리렌더(server/seo/pbaRecords.ts)·사이트맵·API 가 **같은 함수**를 쓴다 —
// 봇과 사람이 다른 제목이나 다른 순위를 보면 클로킹이 되고, 색인 기준이 둘로 갈리면 사이트맵에 noindex 페이지가 올라간다.
//
// 숫자는 전부 pba_players 에 이미 적재한 PBA 공식 통산 기록(상세 API: Average·HR·BankShotRate·Win·Lose·Draw·Prize)이다.
// 여기서 새로 만드는 값은 두 개뿐이고 계산법을 화면에도 적는다:
//   - 경기 수 = 승 + 패 + 무
//   - 승률 = 승 ÷ (승 + 패 + 무)
// 선수 사진은 쓰지 않는다(초상권) — 이름·국적·숫자만.
import { formatPrize, formatPrizeKo } from "./pbaMeta.js";

const ORIGIN = "https://www.rankue.co.kr";

export const PBA_RECORDS_PATH = "/pba/records";
export const PBA_RECORDS_TITLE = "PBA·LPBA 통산 기록 순위 — 에버리지·하이런·상금 | 랭큐";
export const PBA_RECORDS_H1 = "PBA·LPBA 통산 기록 순위";

/**
 * 비율 기록(에버리지·뱅크샷·승률)은 통산 이 경기 수 이상인 선수만 순위에 넣는다.
 * 실측(2026-09-24): PBA 에버리지 1위가 15경기 뛴 선수(1.743), 뱅크샷 1위가 2경기 뛴 선수(38.83%)였다 — 표본이 작으면 비율이 튄다.
 * 30경기 이상은 PBA 208명 · LPBA 151명이라 톱 20 을 채우고도 남는다.
 */
export const PBA_RECORDS_MIN_GAMES = 30;
/** 기록마다 보여 주는 인원 */
export const PBA_RECORDS_TOP = 20;

export type PbaLeague = "PBA" | "LPBA";
export const PBA_RECORD_LEAGUES: PbaLeague[] = ["PBA", "LPBA"];
export const LEAGUE_KO: Record<PbaLeague, string> = { PBA: "PBA 남자부", LPBA: "LPBA 여자부" };

export type PbaRecordKey = "average" | "highRun" | "bankShotRate" | "winRate" | "careerPrize";
export const PBA_RECORD_KEYS: PbaRecordKey[] = ["average", "highRun", "bankShotRate", "winRate", "careerPrize"];

/**
 * 기록 정의. minGames=true 인 기록만 최소 경기 수를 건다 —
 * 하이런은 한 번 세운 최고 기록이고 상금은 쌓인 합계라, 경기 수가 적다고 값이 부풀지 않는다(뺄 이유가 없다).
 */
export const PBA_RECORD_DEFS: Record<PbaRecordKey, { label: string; emoji: string; minGames: boolean; desc: string }> = {
    average: {
        label: "통산 에버리지", emoji: "🎯", minGames: true,
        desc: "이닝당 평균 득점. PBA 공식 기록의 통산 에버리지를 그대로 옮겼습니다.",
    },
    highRun: {
        label: "하이런", emoji: "🔥", minGames: false,
        desc: "한 이닝에 끊기지 않고 이어 간 최고 기록(PBA 공식 기록). 경기 수와 상관없이 모든 선수를 셉니다.",
    },
    bankShotRate: {
        label: "뱅크샷 비율", emoji: "📐", minGames: true,
        desc: "PBA 공식 기록에 실린 뱅크샷 수치(%)를 그대로 옮겼습니다. 뱅크샷은 수구가 첫 적구보다 쿠션을 먼저 맞힌 득점(빈쿠션)으로, PBA 규칙에서 2점입니다.",
    },
    winRate: {
        label: "승률", emoji: "🏅", minGames: true,
        desc: "승 ÷ (승 + 패 + 무)로 계산했습니다. 소수 첫째 자리까지 표기합니다.",
    },
    careerPrize: {
        label: "통산 상금", emoji: "💰", minGames: false,
        desc: "PBA 공식 기록의 통산 상금(원). 경기 수와 상관없이 모든 선수를 셉니다.",
    },
};

/** 페이지 첫머리에 적는 최소 경기 수 안내 — 화면·프리렌더 공용 */
export const PBA_RECORDS_RULE_KO =
    `에버리지·뱅크샷 비율·승률은 통산 ${PBA_RECORDS_MIN_GAMES}경기(승+패+무) 이상 선수만 순위에 넣습니다. 몇 경기만 뛴 선수가 비율로 맨 위에 오르지 않게 하기 위해서입니다. 하이런·통산 상금은 경기 수와 상관없이 셉니다. 같은 기록은 공동 순위이고, 경기 수가 많은 선수를 먼저 적습니다.`;

/* ── 응답 모양(서버 pba.repo 가 만들고 화면·프리렌더가 읽는다) ── */

/** DB 한 줄 — pba_players 의 통산 기록 열 그대로 */
export interface PbaCareerInput {
    memCode: string;
    league: PbaLeague;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    average: number | null;
    bankShotRate: number | null;
    highRun: number | null;
    win: number | null;
    lose: number | null;
    draw: number | null;
    careerPrize: number | null;
}

export interface PbaRecordRow {
    /** 공동 순위(1, 1, 3 …) */
    rank: number;
    memCode: string;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    /** 이 기록의 값 — 승률은 0~1 비율, 뱅크샷은 % 수치, 상금은 원 */
    value: number;
    /** 승 + 패 + 무 */
    games: number;
    win: number;
    lose: number;
    draw: number;
}

export interface PbaRecordSection {
    key: PbaRecordKey;
    /** 이 기록 순위에 들 자격이 있는 선수 수(최소 경기 수를 건 기록이면 그 기준을 넘은 인원) */
    eligible: number;
    rows: PbaRecordRow[];
    /**
     * 마지막 공동 순위가 톱 20 경계에서 잘렸을 때만 — 공동 rank 위는 tied 명인데 shown 명만 실었다.
     * 실측(2026-09-24): LPBA 하이런 11 이 20명인데 9명만 들어가 '공동 12위 9명'처럼 읽혔다. 잘린 사실을 화면·봇 문서에 적는다.
     */
    cut: { rank: number; tied: number; shown: number } | null;
}

export interface PbaRecordsLeague {
    league: PbaLeague;
    /** 통산 기록(상세)이 적재된 선수 수 */
    players: number;
    /** 그중 최소 경기 수를 넘은 선수 수 */
    qualified: number;
    /**
     * 이 리그 선수 기록을 마지막으로 다시 받은 날 "YYYY-MM-DD"(KST) = max(pba_players.updated_at).
     * 상세 갱신은 하루 60명씩 돌아가며 하므로 선수마다 받은 날이 다르다 — 화면에도 '돌아가며 갱신'이라고 적는다.
     */
    updated: string | null;
    sections: PbaRecordSection[];
}

export interface PbaRecordsReport {
    minGames: number;
    leagues: PbaRecordsLeague[];
}

/* ── 순위 계산 ── */

const gamesOf = (r: PbaCareerInput) => (r.win ?? 0) + (r.lose ?? 0) + (r.draw ?? 0);

function valueOf(key: PbaRecordKey, r: PbaCareerInput): number | null {
    switch (key) {
        case "average": return r.average;
        case "highRun": return r.highRun;
        case "bankShotRate": return r.bankShotRate;
        case "careerPrize": return r.careerPrize;
        case "winRate": {
            // 승률 = 승 ÷ (승+패+무). 순위는 표기 자릿수(rankKey)로 매긴다.
            const g = gamesOf(r);
            return g > 0 && r.win != null ? r.win / g : null;
        }
    }
}

/**
 * 순위를 매기는 값 — 화면에 보이는 자릿수 그대로. 에버리지(소수 셋째)·뱅크샷(소수 둘째)은 원본 자릿수가 곧 표기라 그대로 쓰고,
 * 승률만 계산값이라 표기(소수 첫째 %)로 자른다 — 안 그러면 '72.9%'가 8위와 10위로 갈라져 보인다(실측: 62/85 와 70/96).
 */
const rankKey = (key: PbaRecordKey, v: number) => (key === "winRate" ? Number((v * 100).toFixed(1)) : v);

/**
 * 순위표를 만든다. 정렬: 값(표기 자릿수) 내림차순 → 경기 수 많은 순 → memCode(같은 입력이면 늘 같은 순서).
 * 값이 없거나 0 인 선수는 뺀다(상금 0원·하이런 0 은 '기록'이 아니다).
 */
export function buildPbaRecords(rows: PbaCareerInput[], updated: Partial<Record<PbaLeague, string | null>>): PbaRecordsReport {
    const leagues = PBA_RECORD_LEAGUES.map((league): PbaRecordsLeague => {
        // 통산 기록이 적재된 선수만 — 상세를 못 받은 선수는 average 가 null 이다
        const pool = rows.filter((r) => r.league === league && r.average != null);
        const qualified = pool.filter((r) => gamesOf(r) >= PBA_RECORDS_MIN_GAMES).length;
        const sections = PBA_RECORD_KEYS.map((key): PbaRecordSection => {
            const cands = pool
                .filter((r) => !PBA_RECORD_DEFS[key].minGames || gamesOf(r) >= PBA_RECORDS_MIN_GAMES)
                .map((r) => ({ r, v: valueOf(key, r), g: gamesOf(r) }))
                .filter((x): x is { r: PbaCareerInput; v: number; g: number } => x.v != null && Number.isFinite(x.v) && x.v > 0)
                .map((x) => ({ ...x, k: rankKey(key, x.v) }))
                .sort((a, b) => b.k - a.k || b.g - a.g || (a.r.memCode < b.r.memCode ? -1 : a.r.memCode > b.r.memCode ? 1 : 0));
            const out: PbaRecordRow[] = [];
            for (let i = 0; i < cands.length && out.length < PBA_RECORDS_TOP; i++) {
                const { r, v, g, k } = cands[i];
                // 공동 순위: 앞 사람과 (표기) 값이 같으면 앞 사람 순위를 물려받는다(1, 1, 3)
                const rank = i > 0 && cands[i - 1].k === k ? out[i - 1].rank : i + 1;
                out.push({
                    rank, memCode: r.memCode, nameKo: r.nameKo, nameEn: r.nameEn, nationCode: r.nationCode,
                    value: v, games: g, win: r.win ?? 0, lose: r.lose ?? 0, draw: r.draw ?? 0,
                });
            }
            // 경계 공동 순위: 다음 후보가 마지막 줄과 같은 (표기) 값이면 그 공동 순위가 잘린 것이다
            const last = out[out.length - 1];
            const cut = last && cands.length > out.length && cands[out.length].k === cands[out.length - 1].k
                ? {
                    rank: last.rank,
                    tied: cands.filter((c) => c.k === cands[out.length - 1].k).length,
                    shown: out.filter((x) => x.rank === last.rank).length,
                }
                : null;
            return { key, eligible: cands.length, rows: out, cut };
        });
        return { league, players: pool.length, qualified, updated: updated[league] ?? null, sections };
    });
    return { minGames: PBA_RECORDS_MIN_GAMES, leagues };
}

export const recordSection = (l: PbaRecordsLeague, key: PbaRecordKey) => l.sections.find((s) => s.key === key);
export const recordLeague = (r: PbaRecordsReport, league: PbaLeague) => r.leagues.find((l) => l.league === league);

/** 보여 줄 선수가 한 명도 없으면 페이지가 없는 것과 같다(404) */
export const pbaRecordsEmpty = (r: PbaRecordsReport) => r.leagues.every((l) => l.players === 0);

/** 색인 기준 — 두 리그 모두 최소 경기 수를 넘은 선수가 톱 20 을 채울 만큼 있을 때만. 모자라면 noindex·사이트맵 제외. */
export const pbaRecordsIndexable = (r: PbaRecordsReport) =>
    PBA_RECORD_LEAGUES.every((lg) => (recordLeague(r, lg)?.qualified ?? 0) >= PBA_RECORDS_TOP);

/** 두 리그 중 더 늦은 갱신일 — 사이트맵 lastmod·설명문 */
export function pbaRecordsUpdated(r: PbaRecordsReport): string | null {
    const ds = r.leagues.map((l) => l.updated).filter((d): d is string => !!d).sort();
    return ds.length ? ds[ds.length - 1] : null;
}

/* ── 표기(봇·사람 문자 단위 일치) ── */

/** "2026-09-24" → "2026년 9월 24일". 문자열을 쪼개 읽는다(new Date 는 브라우저 시간대에 따라 하루 밀린다). */
export function dateKo(ymd: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
    return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : "";
}

/** 기록 값 표기. 상금만 언어별(억·만 / ₩), 나머지는 숫자라 언어와 무관하다. */
export function recordValue(key: PbaRecordKey, v: number, locale: string = "ko"): string {
    switch (key) {
        case "average": return v.toFixed(3);
        case "highRun": return String(v);
        case "bankShotRate": return `${v.toFixed(2)}%`;
        case "winRate": return `${(v * 100).toFixed(1)}%`;
        case "careerPrize": return locale === "ko" ? `${formatPrizeKo(v)}원` : formatPrize(v, locale);
    }
}

/** "105경기 · 75승 30패" — 무승부가 있을 때만 '무'를 붙인다 */
export const recordLineKo = (r: Pick<PbaRecordRow, "games" | "win" | "lose" | "draw">) =>
    `${r.games}경기 · ${r.win}승 ${r.lose}패${r.draw ? ` ${r.draw}무` : ""}`;

/** 기록 절의 인원 안내 — "30경기 이상 151명 중" / "기록이 있는 185명 중" */
export const eligibleKo = (key: PbaRecordKey, n: number) =>
    PBA_RECORD_DEFS[key].minGames ? `${PBA_RECORDS_MIN_GAMES}경기 이상 ${n}명 중` : `기록이 있는 ${n}명 중`;

/** 톱 20 경계에서 잘린 공동 순위 안내 — "공동 12위는 20명이고, 경기 수가 많은 9명만 적었습니다." */
export const cutKo = (c: NonNullable<PbaRecordSection["cut"]>) =>
    `공동 ${c.rank}위는 ${c.tied}명이고, 경기 수가 많은 ${c.shown}명만 적었습니다.`;

/** 리그 머리말 — 인원과 갱신일. 갱신은 크론이 하루 60명씩 돌아가며 하므로 '선수별로 돌아가며'를 같이 적는다. */
export const leagueFactsKo = (l: PbaRecordsLeague) =>
    `통산 기록이 있는 선수 ${l.players}명, 그중 ${PBA_RECORDS_MIN_GAMES}경기 이상 ${l.qualified}명.${l.updated ? ` 기록 갱신 ${dateKo(l.updated)}(선수별로 돌아가며 다시 받습니다).` : ""}`;

/** 1위 한 줄 — 공동 1위면 그렇게 적는다. 리그 이름은 PBA → LPBA 순서로 읽히게 LPBA 에만 붙인다 */
function leaderKo(l: PbaRecordsLeague | undefined, key: PbaRecordKey): string {
    const s = l ? recordSection(l, key) : undefined;
    const top = s?.rows[0];
    if (!l || !s || !top) return "";
    const tied = s.rows.filter((x) => x.rank === 1).length;
    return `${l.league === "LPBA" ? "LPBA " : ""}${top.nameKo}${tied > 1 ? ` 등 ${tied}명` : ""} ${recordValue(key, top.value)}`;
}

/**
 * 설명 겸 본문 첫 문단 — 1위 숫자를 앞에, 100자 안팎(2026-09-24: 198자라 상금 1위가 잘려 보였다).
 * 기록 종류 나열·최소 경기 수 안내는 제목과 본문 머리말(PBA_RECORDS_RULE_KO)이 말한다. 리그 이름은 LPBA 에만 붙인다(PBA → LPBA 순서).
 */
export function pbaRecordsDescription(r: PbaRecordsReport): string {
    const pba = recordLeague(r, "PBA");
    const lpba = recordLeague(r, "LPBA");
    const avg = [leaderKo(pba, "average"), leaderKo(lpba, "average")].filter(Boolean).join("·");
    const prize = [leaderKo(pba, "careerPrize"), leaderKo(lpba, "careerPrize")].filter(Boolean).join("·");
    const upd = pbaRecordsUpdated(r);
    const leaders = [avg ? `통산 에버리지 1위 ${avg}` : "", prize ? `상금 1위 ${prize}` : ""].filter(Boolean).join(", ");
    return [
        // '톱 20·PBA·LPBA'는 제목과 h1 이 이미 말한다 — 설명은 1위 숫자부터
        leaders ? `${leaders}.` : `PBA·LPBA 통산 기록 톱 ${PBA_RECORDS_TOP}.`,
        // '기준'(모든 숫자가 그날 값)이 아니라 '갱신' — 상세는 하루 60명씩 돌아가며 받아서 선수마다 받은 날이 다르다
        upd ? `${dateKo(upd)} 갱신.` : "",
    ].filter(Boolean).join(" ");
}

/* ── 구조화데이터 ── */

const playerUrl = (memCode: string) => `${ORIGIN}/pba-player/${encodeURIComponent(memCode)}`;

/**
 * JSON-LD 노드(@context 없이). 프리렌더는 노드마다 @context 를 붙여 여러 <script> 로, 화면(useSeo)은 @graph 한 덩어리로 싣는다.
 * 경로 + 리그별 통산 에버리지 순위(이 페이지의 첫 표).
 */
export function pbaRecordsLdNodes(r: PbaRecordsReport): Record<string, unknown>[] {
    const nodes: Record<string, unknown>[] = [{
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "PBA 투어 랭킹", item: `${ORIGIN}/pba` },
            { "@type": "ListItem", position: 2, name: "통산 기록 순위", item: `${ORIGIN}${PBA_RECORDS_PATH}` },
        ],
    }];
    for (const l of r.leagues) {
        const s = recordSection(l, "average");
        if (!s?.rows.length) continue;
        nodes.push({
            "@type": "ItemList",
            name: `${l.league} 통산 에버리지 순위`,
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            itemListElement: s.rows.map((x, i) => ({
                "@type": "ListItem", position: i + 1, name: x.nameKo, url: playerUrl(x.memCode),
            })),
        });
    }
    return nodes;
}
