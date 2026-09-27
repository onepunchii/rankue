/**
 * PBA 선수 페이지(2026-09-27 개편, 오너 승인 시안) — 한 문장 요약·자주 묻는 질문·구조화데이터를 한곳에 둔다.
 * 화면(pba-player.tsx)과 봇 프리렌더(server/prerender.ts)가 **같은 함수**를 불러 같은 문장을 낸다 —
 * 봇과 사람이 다른 글을 보면 클로킹이 되고, AI 검색은 페이지 첫머리의 사실 문장을 그대로 인용한다(GEO/AEO).
 *
 * 숫자는 전부 이미 적재한 PBA 공식 기록(pba_players·pba_season_ranks·pba_tournaments)에서 온다. 없는 값은 문장에서 뺀다 —
 * "우승 0회"처럼 모은 자료에 없는 것을 사실처럼 말하지 않는다(우승자는 선수와 하나로만 맞을 때만 이어 두었다).
 */
import { formatPrize, formatPrizeKo, pbaL10n, seasonLabel, type PbaLang } from "./pbaMeta.js";
import { josa } from "./briefingMeta.js";
import { PBA_RECORDS_MIN_GAMES, type PbaLeagueBench, type PbaPlayerRecordRank, type PbaRecordKey } from "./pbaRecordsMeta.js";

const ORIGIN = "https://www.rankue.co.kr";

export interface PbaPlayerSeason { season: number; league?: string; prizeRank: number | null; pointRank: number | null; prize: number; rankingPoint: number }

export interface PbaPlayerWin {
    season: number;
    /** 시즌을 붙인 대회명(tourNameWithSeason) */
    title: string;
    startDate: string;
    winnerPrize: number | null;
    /** /tournaments/pba/:season/:tourCode */
    path: string;
}

export interface PbaNeighbor { memCode: string; nameKo: string; nameEn: string | null; nationCode: string | null; prizeRank: number }

/** GET /pba/player/:memCode 의 extra — 옛 캐시 응답엔 없을 수 있다(화면은 없으면 그 칸을 안 그린다). */
export interface PbaPlayerExtra {
    wins: PbaPlayerWin[];
    recordRanks: Partial<Record<PbaRecordKey, PbaPlayerRecordRank>>;
    bench: PbaLeagueBench;
    /** 최근 순위 시즌의 상금랭킹 ±5 */
    neighbors: { season: number; league: "PBA" | "LPBA"; rows: PbaNeighbor[] } | null;
    followers: number;
    /** UMB 세계랭킹(이어진 선수, 최근 회차에 있을 때만) */
    umbRank: number | null;
    /** 이 선수 기록을 마지막으로 다시 받은 날(KST "YYYY-MM-DD") */
    updated: string | null;
}

export interface PbaPlayerProfile {
    memCode: string;
    league: "PBA" | "LPBA";
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    birthday: string | null;
    average: number | null;
    bankShotRate: number | null;
    highRun: number | null;
    win: number | null;
    lose: number | null;
    draw: number | null;
    careerPrize: number | null;
    umbPlayerId: string | null;
    umbCategory: string | null;
    seasons: PbaPlayerSeason[];
    extra?: PbaPlayerExtra;
}

/** 표시 이름 — 한국어는 한글, 그 밖은 로마자 원표기(현지 팬이 검색하는 형태). 프리렌더와 같은 규칙. */
export const pbaDisplayName = (p: Pick<PbaPlayerProfile, "nameKo" | "nameEn">, lang: string) =>
    lang === "ko" ? p.nameKo : (p.nameEn || p.nameKo);

/** 만 나이 — "YYYY-MM-DD" 를 문자열로 읽는다(new Date 는 기기 시간대에 따라 하루 밀린다). now 는 KST 날짜 기준. */
export function pbaAge(birthday: string | null | undefined, now: number = Date.now()): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday ?? "");
    if (!m) return null;
    const k = new Date(now + 9 * 3600_000);
    const y = k.getUTCFullYear(), mo = k.getUTCMonth() + 1, d = k.getUTCDate();
    let age = y - Number(m[1]);
    if (mo < Number(m[2]) || (mo === Number(m[2]) && d < Number(m[3]))) age -= 1;
    return age >= 10 && age <= 90 ? age : null;
}

/** 국가 이름 — Intl 이 없거나 모르는 코드면 코드 그대로 */
export function pbaCountryName(code: string | null | undefined, lang: string): string | null {
    if (!code) return null;
    try { return new Intl.DisplayNames([lang], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

export const pbaPrizeLabel = (n: number, lang: string) => (lang === "ko" ? `${formatPrizeKo(n)}원` : formatPrize(n, lang));
export const pbaGames = (p: Pick<PbaPlayerProfile, "win" | "lose" | "draw">) => (p.win ?? 0) + (p.lose ?? 0) + (p.draw ?? 0);

/**
 * 첫머리 한 문장 — "강민재는 PBA 투어 선수로, 통산 상금 4억 2,300만원, 우승 3회, 통산 에버리지 1.582(PBA 7위)를 기록했습니다."
 * 값이 없는 조각은 뺀다. 화면 첫 카드·프리렌더 첫 문단·설명문이 같은 문장이다.
 */
export function pbaPlayerSummary(p: PbaPlayerProfile, lang: string): string {
    const name = pbaDisplayName(p, lang);
    const wins = p.extra?.wins.length ?? 0;
    const avgRank = p.extra?.recordRanks.average?.rank;
    const avg = p.average != null ? p.average.toFixed(3) : null;
    const prize = p.careerPrize != null && p.careerPrize > 0 ? pbaPrizeLabel(p.careerPrize, lang) : null;
    switch (lang) {
        case "ko": {
            const facts = [
                prize ? `통산 상금 ${prize}` : "",
                wins ? `우승 ${wins}회` : "",
                avg ? `통산 에버리지 ${avg}${avgRank ? `(${p.league} ${avgRank}위)` : ""}` : "",
            ].filter(Boolean);
            return facts.length
                ? `${josa(name, "은/는")} ${p.league} 투어 선수로, ${josa(facts.join(", "), "을/를")} 기록했습니다.`
                : `${josa(name, "은/는")} ${p.league} 투어 프로당구 선수입니다.`;
        }
        case "vi": {
            const facts = [prize ? `tổng tiền thưởng ${prize}` : "", wins ? `${wins} chức vô địch` : "", avg ? `average ${avg}${avgRank ? ` (hạng ${avgRank} ${p.league})` : ""}` : ""].filter(Boolean);
            return `${name} là cơ thủ chuyên nghiệp ${p.league} Tour${facts.length ? ` với ${facts.join(", ")}` : ""}.`;
        }
        case "tr": {
            const facts = [prize ? `${prize} kariyer ödülü` : "", wins ? `${wins} şampiyonluk` : "", avg ? `${avg} ortalama${avgRank ? ` (${p.league} ${avgRank}.)` : ""}` : ""].filter(Boolean);
            return `${name}, ${p.league} Tour profesyonel bilardo oyuncusu${facts.length ? `: ${facts.join(", ")}` : ""}.`;
        }
        case "es": {
            const facts = [prize ? `${prize} en premios` : "", wins ? `${wins} títulos` : "", avg ? `promedio ${avg}${avgRank ? ` (${avgRank}.º del ${p.league})` : ""}` : ""].filter(Boolean);
            return `${name} es jugador profesional del ${p.league} Tour${facts.length ? ` con ${facts.join(", ")}` : ""}.`;
        }
        default: {
            const facts = [prize ? `career prize money of ${prize}` : "", wins ? `${wins} title${wins > 1 ? "s" : ""}` : "", avg ? `a career average of ${avg}${avgRank ? ` (No. ${avgRank} in ${p.league})` : ""}` : ""].filter(Boolean);
            return `${name} is a ${p.league} Tour professional billiards player${facts.length ? ` with ${facts.join(", ")}` : ""}.`;
        }
    }
}

export interface PbaFaq { q: string; a: string }

/**
 * 자주 묻는 질문 — 화면 FAQ 칸과 FAQPage 구조화데이터가 **이 목록 하나**를 쓴다(보이는 답 = 마크업의 답).
 * 실제로 많이 찾는 넷: 연봉(상금), 에버리지, 우승 횟수, 나이·국적. 답할 자료가 없는 질문은 뺀다.
 */
export function pbaPlayerFaq(p: PbaPlayerProfile, lang: string, now: number = Date.now()): PbaFaq[] {
    const L = pbaL10n(lang);
    const name = pbaDisplayName(p, lang);
    const prizeStr = p.careerPrize != null ? `${formatPrizeKo(p.careerPrize)}${lang === "ko" ? "원" : " KRW"}` : "-";
    const out: PbaFaq[] = [{ q: L.incomeQ(name), a: L.incomeA(name, prizeStr) }];
    const x = p.extra;
    const T = FAQ_TEXT[(lang as PbaLang)] ?? FAQ_TEXT.en;

    if (p.average != null) {
        const r = x?.recordRanks.average;
        const bench = x?.bench.average;
        out.push({ q: T.avgQ(name), a: T.avgA(name, p.average.toFixed(3), p.league, r ?? null, bench != null ? bench.toFixed(3) : null) });
    }
    if (x && x.wins.length > 0) {
        const recent = x.wins.slice(0, 3).map((w) => w.title);
        out.push({ q: T.winsQ(name), a: T.winsA(name, x.wins.length, recent) });
    }
    const age = pbaAge(p.birthday, now);
    const country = pbaCountryName(p.nationCode, lang);
    if (age != null || country) {
        const year = /^(\d{4})/.exec(p.birthday ?? "")?.[1] ?? null;
        out.push({ q: T.ageQ(name), a: T.ageA(name, year, age, country) });
    }
    return out;
}

const minG = PBA_RECORDS_MIN_GAMES;
const FAQ_TEXT: Record<PbaLang, {
    avgQ: (n: string) => string; avgA: (n: string, avg: string, lg: string, r: PbaPlayerRecordRank | null, bench: string | null) => string;
    winsQ: (n: string) => string; winsA: (n: string, count: number, recent: string[]) => string;
    ageQ: (n: string) => string; ageA: (n: string, year: string | null, age: number | null, country: string | null) => string;
}> = {
    ko: {
        avgQ: (n) => `${n} 선수 에버리지는 얼마인가요?`,
        avgA: (n, a, lg, r, b) => `${n} 선수의 PBA 공식 통산 에버리지는 ${a}입니다.${r ? ` ${lg} 통산 ${minG}경기 이상 선수 ${r.of}명 가운데 ${r.rank}위입니다.` : ""}${b ? ` 같은 기준 리그 평균은 ${b}입니다.` : ""}`,
        winsQ: (n) => `${n} 선수는 우승을 몇 번 했나요?`,
        winsA: (n, c, rec) => `랭큐가 모은 PBA 공식 대회 결과에서 ${n} 선수의 우승은 ${c}회입니다. 최근 우승: ${rec.join(", ")}.`,
        ageQ: (n) => `${n} 선수 나이와 국적은?`,
        ageA: (n, y, age, c) => [y && age != null ? `${n} 선수는 ${y}년생(만 ${age}세)입니다.` : "", c ? `국적은 ${c}입니다.` : ""].filter(Boolean).join(" "),
    },
    en: {
        avgQ: (n) => `What is ${n}'s average?`,
        avgA: (n, a, lg, r, b) => `${n}'s official PBA career average is ${a}.${r ? ` That ranks No. ${r.rank} of ${r.of} ${lg} players with ${minG}+ games.` : ""}${b ? ` The league average on the same basis is ${b}.` : ""}`,
        winsQ: (n) => `How many titles has ${n} won?`,
        winsA: (n, c, rec) => `According to official PBA results collected by RANKUE, ${n} has won ${c} title${c > 1 ? "s" : ""}. Most recent: ${rec.join(", ")}.`,
        ageQ: (n) => `How old is ${n} and where is ${n} from?`,
        ageA: (n, y, age, c) => [y && age != null ? `${n} was born in ${y} (age ${age}).` : "", c ? `Nationality: ${c}.` : ""].filter(Boolean).join(" "),
    },
    vi: {
        avgQ: (n) => `Average của ${n} là bao nhiêu?`,
        avgA: (n, a, lg, r, b) => `Average sự nghiệp chính thức PBA của ${n} là ${a}.${r ? ` Xếp hạng ${r.rank}/${r.of} cơ thủ ${lg} có từ ${minG} trận.` : ""}${b ? ` Trung bình giải đấu là ${b}.` : ""}`,
        winsQ: (n) => `${n} đã vô địch bao nhiêu lần?`,
        winsA: (n, c, rec) => `Theo kết quả chính thức PBA mà RANKUE thu thập, ${n} đã vô địch ${c} lần. Gần nhất: ${rec.join(", ")}.`,
        ageQ: (n) => `${n} bao nhiêu tuổi, quốc tịch nào?`,
        ageA: (n, y, age, c) => [y && age != null ? `${n} sinh năm ${y} (${age} tuổi).` : "", c ? `Quốc tịch: ${c}.` : ""].filter(Boolean).join(" "),
    },
    tr: {
        avgQ: (n) => `${n} ortalaması kaç?`,
        avgA: (n, a, lg, r, b) => `${n} resmî PBA kariyer ortalaması ${a}.${r ? ` ${minG}+ maçlı ${r.of} ${lg} oyuncusu arasında ${r.rank}. sırada.` : ""}${b ? ` Aynı ölçüte göre lig ortalaması ${b}.` : ""}`,
        winsQ: (n) => `${n} kaç şampiyonluk kazandı?`,
        winsA: (n, c, rec) => `RANKUE'nun topladığı resmî PBA sonuçlarına göre ${n} ${c} şampiyonluk kazandı. Son: ${rec.join(", ")}.`,
        ageQ: (n) => `${n} kaç yaşında, nereli?`,
        ageA: (n, y, age, c) => [y && age != null ? `${n} ${y} doğumlu (${age} yaşında).` : "", c ? `Uyruk: ${c}.` : ""].filter(Boolean).join(" "),
    },
    es: {
        avgQ: (n) => `¿Cuál es el promedio de ${n}?`,
        avgA: (n, a, lg, r, b) => `El promedio oficial de carrera de ${n} en la PBA es ${a}.${r ? ` Es ${r.rank}.º de ${r.of} jugadores del ${lg} con ${minG}+ partidos.` : ""}${b ? ` El promedio de la liga con el mismo criterio es ${b}.` : ""}`,
        winsQ: (n) => `¿Cuántos títulos ha ganado ${n}?`,
        winsA: (n, c, rec) => `Según los resultados oficiales de la PBA recopilados por RANKUE, ${n} ha ganado ${c} título${c > 1 ? "s" : ""}. Más reciente: ${rec.join(", ")}.`,
        ageQ: (n) => `¿Qué edad tiene ${n} y de dónde es?`,
        ageA: (n, y, age, c) => [y && age != null ? `${n} nació en ${y} (${age} años).` : "", c ? `Nacionalidad: ${c}.` : ""].filter(Boolean).join(" "),
    },
};

/**
 * 구조화데이터 — ProfilePage(주인공 Person: 수상·팔로워 수) + FAQPage. 노드마다 @context 없이 돌려준다:
 * 프리렌더는 노드별 <script>, 화면(useSeo)은 @graph 한 덩어리로 싣는다(pbaRecordsLdNodes 와 같은 방식).
 */
export function pbaPlayerLdNodes(p: PbaPlayerProfile, lang: string, image: string, now: number = Date.now()): Record<string, unknown>[] {
    const url = `${ORIGIN}/pba-player/${encodeURIComponent(p.memCode)}`;
    const x = p.extra;
    const person: Record<string, unknown> = {
        "@type": "Person",
        name: p.nameKo,
        ...(p.nameEn ? { alternateName: p.nameEn } : {}),
        ...(p.nationCode ? { nationality: { "@type": "Country", name: p.nationCode } } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(p.birthday ?? "") ? { birthDate: p.birthday } : {}),
        jobTitle: "Professional billiards player",
        memberOf: { "@type": "SportsOrganization", name: `${p.league} Tour` },
        url,
        image,
        description: pbaPlayerSummary(p, lang),
        ...(x && x.wins.length ? { award: x.wins.map((w) => w.title) } : {}),
        ...(x ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/FollowAction", userInteractionCount: x.followers } } : {}),
    };
    return [
        {
            "@type": "ProfilePage",
            url,
            ...(x?.updated ? { dateModified: x.updated } : {}),
            mainEntity: person,
        },
        {
            "@type": "FAQPage",
            mainEntity: pbaPlayerFaq(p, lang, now).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
    ];
}

/** 시즌 표기("25-26") — 화면·프리렌더 공용 재수출 */
export { seasonLabel };
