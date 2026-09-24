// PBA 대회 수집(2026-09-24, /tournaments) — 공식 일정 + 투어 목록(우승자)을 합쳐 pba_tournaments 에 멱등 upsert.
//
// 원천(pbatour.org 비인증 JSON, 인증서 체인 문제로 pbaService 의 고정 체인 fetch 를 그대로 쓴다):
//   GET /ko/tournament/schedule/ajax/list?leagueCode=&season=YYYY
//       → SEQ · MATCH_CODE(투어 코드, 팀리그·미정 대회는 빈 값) · TITLE · TITLE_EN · LEAGUE_GUBUN(PBA1·LPBA1·PBA2·PBA3·TLG)
//         · MATCH_START_DATE/END_DATE({year, monthValue, dayOfMonth}) · PLACE · TOTAL_PRIZE/WINNING_PRIZE("2억 5천만원")
//         · JOIN_PLAYER · DETAIL_BTN_ACTIVE_YN(공식 '자세히보기' 링크가 열리는 대회)
//   GET /ko/service/ajax/tour/getTourList?seasonCode=YYYY&pbaType=PBA1
//       → 투어코드 · 투어명 · PBA타입(PBA·LPBA·PBA2) · 투어시작일자 · 투어종료일자 · 우승자(이름 문자열). 팀리그는 없다.
//   (2026-09-24 실측: pbaType=PBA1 한 번에 PBA·LPBA·드림투어가 다 온다.)
//
// 실측으로 정한 규칙:
//   - 일정에 코드가 비었는데 투어 목록엔 있는 대회(2019 드림투어 개막전) → 같은 리그·같은 시작일 후보가 하나뿐일 때만 잇는다.
//   - 투어 목록에만 있는 대회(2019 PBA 파나소닉 오픈) → 이름·날짜·우승자만 싣는다(상금·장소는 모른다).
//   - 상금은 "2억 5천만원"·"4000만원"·"1억 2천 5백만원" 같은 금액 한 개만 숫자로 읽는다. 팀리그("우승 1억, 준우승 5천만원")처럼
//     여러 금액이 섞인 글은 null — 어느 금액이 '총상금'인지 모르는 걸 고르지 않는다.
//   - 우승자 → pba_players 연결: 같은 풀(LPBA ↔ LPBA, 그 밖 ↔ PBA)에서 이름이 정확히 하나 맞을 때.
//     PBA 는 동명이인 회원에 숫자를 붙여("김현우1") 이름으로 회원이 갈린다. 둘 이상이면 연결하지 않는다.
//     외국 선수는 공식 우승자 칸이 짧은 이름("산체스", "스롱")이라 정확히 맞지 않는다 — 1부(PBA·LPBA) 대회에 한해,
//     **그 시즌 그 리그 상금 랭킹에 든 선수 중** 이름의 첫·끝 낱말이 우승자 칸과 같은 사람이 딱 한 명일 때만 잇는다.
//     (우승자는 반드시 그 시즌 상금을 받으므로 후보 안에 있다. 우승상금을 알면 시즌 상금이 그 이상인 사람만 후보다.
//      한 명이 아니면 연결하지 않는다. 현재 시즌은 날마다 다시 풀어서, 상금 랭킹이 늦게 바뀐 날의 연결도 다음 동기화 때 고쳐진다.)
// 시즌 단위로 일정·투어 목록 둘 다 받아야만 쓴다 — 하나라도 실패하면 그 시즌은 건드리지 않는다(기존 행 보존).
// 이미 적재한 시즌에서 한쪽 응답이 텅 비어 와도 실패로 본다. 적어 둔 우승자는 새 응답에 없어도 지우지 않는다.
import { db } from "../db.js";
import { pbaTournaments, pbaPlayers, pbaSeasonRanks } from "../../shared/schema.js";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { fetchJson, sleep, PBA_FIRST_SEASON } from "./pbaService.js";
import { currentPbaSeason } from "./pbaSync.js";
import { pbaLeagueOf, type PbaTourLeague } from "../../shared/tournamentMeta.js";

export interface TourRowDraft {
    id: string;
    tourCode: number | null;
    season: number;
    league: PbaTourLeague;
    title: string;
    titleEn: string | null;
    startDate: string;
    endDate: string;
    place: string | null;
    totalPrize: number | null;
    winnerPrize: number | null;
    winnerName: string | null;
    participants: number | null;
    officialSeq: string | null;
}

const capStr = (v: unknown, max: number): string | null => {
    const s = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
    return s ? s.slice(0, max) : null;
};
const intOf = (v: unknown): number | null => {
    const s = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
    return /^\d{1,9}$/.test(s) ? Number(s) : null;
};
const isoObj = (d: any): string | null =>
    d && Number.isInteger(d.year) && Number.isInteger(d.monthValue) && Number.isInteger(d.dayOfMonth)
        ? `${d.year}-${String(d.monthValue).padStart(2, "0")}-${String(d.dayOfMonth).padStart(2, "0")}`
        : null;
const isoStr = (s: unknown): string | null => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/**
 * 공식 상금 표기 → 원. 금액 한 개("2억 5천만원", "4000만원", "1억 2천 5백만원", "1천 500만원", "4억")만 읽는다.
 * 만 단위 앞자리는 천·백 자리 표기와 숫자를 섞어 쓴다("9천3백만", "1천 500만") — 둘 다 더한다.
 * 그 밖의 글자가 하나라도 있으면("미정", "우승 1억, 준우승 5천만원") null.
 */
export function parseKrw(raw: unknown): number | null {
    if (typeof raw !== "string") return null;
    const s = raw.replace(/[\s,]/g, "").replace(/원$/, "");
    if (!s || !/^[\d억천백만]+$/.test(s)) return null;
    const m = /^(?:(\d+)억)?(.*)$/.exec(s)!;
    const eok = m[1] ? Number(m[1]) : 0;
    const rest = m[2];
    let man = 0;
    if (rest) {
        // 억 뒤가 있으면 반드시 "…만" 으로 끝나야 한다("4억5000" 처럼 단위가 없으면 뜻이 모호하다).
        // 천·백 앞은 한 자리만 — "500백만원"(팀리그 MVP 칸의 오타, 실측) 을 5억으로 읽지 않게
        const r = /^(?:([1-9])천)?(?:([1-9])백)?(\d{1,4})?만$/.exec(rest);
        if (!r || (!r[1] && !r[2] && !r[3])) return null;
        man = (r[1] ? Number(r[1]) * 1000 : 0) + (r[2] ? Number(r[2]) * 100 : 0) + (r[3] ? Number(r[3]) : 0);
    }
    const won = eok * 1e8 + man * 1e4;
    return won > 0 && Number.isSafeInteger(won) ? won : null;
}

const cleanWinner = (v: unknown): string | null => {
    const s = capStr(v, 40);
    return s && s !== "-" ? s : null;
};

/** 한 시즌의 일정·투어 목록 → 저장할 행. 순수 함수(테스트 대상). */
export function buildSeasonRows(season: number, schedule: any[], tours: any[]): TourRowDraft[] {
    const tourByCode = new Map<number, any>();
    for (const t of tours) {
        const code = intOf(t?.["투어코드"]);
        const league = pbaLeagueOf(t?.["PBA타입"]);
        if (!code || !league || league === "TEAM") continue;
        if (t?.["시즌코드"] != null && Number(t["시즌코드"]) !== season) continue;
        tourByCode.set(code, t);
    }
    const used = new Set<number>();
    const out = new Map<string, TourRowDraft>();

    for (const s of schedule) {
        const league = pbaLeagueOf(s?.LEAGUE_GUBUN);
        const start = isoObj(s?.MATCH_START_DATE);
        const title = capStr(s?.TITLE, 120);
        if (!league || !start || !title) continue;
        const endRaw = isoObj(s?.MATCH_END_DATE) ?? start;
        // 팀리그 코드는 따로 번호를 매긴다(2025-26 팀리그 85~90 = 2021-22 투어 85~90) — 투어 코드 칸에 넣지 않는다
        let code = league !== "TEAM" ? intOf(s?.MATCH_CODE) : null;
        let t = code ? tourByCode.get(code) : undefined;
        if (!code && league !== "TEAM") {
            const cands = [...tourByCode.entries()].filter(([c, x]) =>
                !used.has(c) && pbaLeagueOf(x["PBA타입"]) === league && isoStr(x["투어시작일자"]) === start);
            if (cands.length === 1) [code, t] = cands[0];
        }
        const seq = capStr(s?.SEQ, 40);
        const id = code ? `T${code}` : seq ? `S${seq}` : null;
        if (!id || out.has(id)) continue;
        if (code) used.add(code);
        const place = capStr(s?.PLACE, 100);
        const participants = intOf(s?.JOIN_PLAYER);
        out.set(id, {
            id, tourCode: code, season, league, title,
            titleEn: capStr(s?.TITLE_EN, 160),
            startDate: start,
            endDate: endRaw < start ? start : endRaw,
            place: place && place !== "미정" ? place : null,
            totalPrize: parseKrw(s?.TOTAL_PRIZE),
            winnerPrize: parseKrw(s?.WINNING_PRIZE),
            winnerName: t ? cleanWinner(t["우승자"]) : null,
            participants: participants && participants > 0 ? participants : null,
            // 공식 일정이 '자세히보기'를 여는 개인 투어만 안내 페이지가 있다(팀리그는 공식도 링크하지 않는다)
            officialSeq: seq && Number(s?.DETAIL_BTN_ACTIVE_YN) === 1 && league !== "TEAM" ? seq : null,
        });
    }

    for (const [code, t] of tourByCode) {
        if (used.has(code)) continue;
        const league = pbaLeagueOf(t["PBA타입"])!;
        const start = isoStr(t["투어시작일자"]);
        const title = capStr(t["투어명"], 120);
        if (!start || !title) continue;
        const end = isoStr(t["투어종료일자"]) ?? start;
        out.set(`T${code}`, {
            id: `T${code}`, tourCode: code, season, league, title, titleEn: null,
            startDate: start, endDate: end < start ? start : end,
            place: null, totalPrize: null, winnerPrize: null,
            winnerName: cleanWinner(t["우승자"]), participants: null, officialSeq: null,
        });
    }
    return [...out.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

/** 이름 첫·끝 낱말("다니엘 산체스" → 다니엘·산체스, "스롱 피아비" → 스롱·피아비) */
const edgeTokens = (name: string) => {
    const t = name.trim().split(/\s+/);
    return t.length < 2 ? [] : [t[0], t[t.length - 1]];
};

/** 우승자 이름 → memCode(하나로만 맞을 때). 규칙은 파일 머리 주석. id → memCode */
export async function resolveWinners(rows: TourRowDraft[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const withWinner = rows.filter((r) => r.winnerName);
    if (!withWinner.length) return out;
    const names = [...new Set(withWinner.map((r) => r.winnerName!))];
    const exact = await db.select({ memCode: pbaPlayers.memCode, league: pbaPlayers.league, nameKo: pbaPlayers.nameKo })
        .from(pbaPlayers).where(inArray(pbaPlayers.nameKo, names));

    const seasons = [...new Set(withWinner.filter((r) => r.league === "PBA" || r.league === "LPBA").map((r) => r.season))];
    const ranked = seasons.length ? await db.select({
        season: pbaSeasonRanks.season, league: pbaSeasonRanks.league, memCode: pbaPlayers.memCode, nameKo: pbaPlayers.nameKo,
        prize: pbaSeasonRanks.prize,
    }).from(pbaSeasonRanks)
        .innerJoin(pbaPlayers, eq(pbaPlayers.memCode, pbaSeasonRanks.memCode))
        .where(and(inArray(pbaSeasonRanks.season, seasons), gt(pbaSeasonRanks.prize, 0))) : [];

    for (const r of withWinner) {
        const name = r.winnerName!;
        // 드림·챌린지투어는 남자 선수 대회 — 남자(PBA) 풀에서 찾는다
        const pool = r.league === "LPBA" ? "LPBA" : "PBA";
        const hits = exact.filter((p) => p.league === pool && p.nameKo === name);
        if (hits.length === 1) { out.set(r.id, hits[0].memCode); continue; }
        if (hits.length > 1) continue; // 동명이인 — 판별 불가
        if ((r.league !== "PBA" && r.league !== "LPBA") || !/^[가-힣]{2,}$/.test(name)) continue;
        // 우승상금을 알면 그 시즌 상금이 그 이상인 사람만 — 상금 랭킹이 대회 직후 아직 안 바뀌어 진짜 우승자가 빠진 날,
        // 같은 성(“응우옌”)을 쓰는 다른 선수 한 명에게 잘못 붙지 않게
        const cands = ranked.filter((p) => p.season === r.season && p.league === r.league && edgeTokens(p.nameKo).includes(name)
            && (!r.winnerPrize || p.prize >= r.winnerPrize));
        const ids = new Set(cands.map((c) => c.memCode));
        if (ids.size === 1) out.set(r.id, cands[0].memCode);
    }
    return out;
}

/** 공식 시즌 목록(SeasonCode). 실패하면 출범 시즌부터 현재+1 까지 */
export async function fetchPbaSeasonCodes(): Promise<number[]> {
    try {
        const json = await fetchJson("/ko/tournament/schedule/ajax/season");
        const list: number[] = (Array.isArray(json?.list) ? json.list : [])
            .map((r: any) => intOf(r?.SeasonCode))
            .filter((n: number | null): n is number => n !== null && n >= PBA_FIRST_SEASON && n <= 2100);
        if (list.length) return [...new Set(list)].sort((a, b) => a - b);
    } catch (e) {
        console.warn("[pba-tournaments] 시즌 목록 실패:", (e as Error)?.message);
    }
    const cur = currentPbaSeason();
    return Array.from({ length: cur + 1 - PBA_FIRST_SEASON + 1 }, (_, i) => PBA_FIRST_SEASON + i);
}

export interface SeasonSyncResult { rows: number; winners: number; linked: number; removed: number }

async function syncOneSeason(season: number): Promise<SeasonSyncResult | null> {
    const sched = await fetchJson(`/ko/tournament/schedule/ajax/list?leagueCode=&season=${season}`);
    await sleep(300);
    const tourList = await fetchJson(`/ko/service/ajax/tour/getTourList?seasonCode=${season}&pbaType=PBA1`);
    const schedule = Array.isArray(sched?.list) ? sched.list : [];
    const tours = Array.isArray(tourList?.list) ? tourList.list : [];
    const rows = buildSeasonRows(season, schedule, tours);
    if (!rows.length) return null; // 아직 일정이 없는 시즌(다음 시즌) — 아무것도 쓰지 않는다

    // 두 응답 중 하나만 빈 날(상대 서버 이상)에 덮어쓰면 장소·상금(일정 쪽)이나 우승자(투어 목록 쪽)가 시즌 통째로 null 이 된다.
    // 이미 적재한 시즌인데 한쪽이 비었으면 이상 응답으로 보고 이 시즌은 건드리지 않는다(부른 쪽이 실패로 기록).
    const before = await db.select({ id: pbaTournaments.id, winnerName: pbaTournaments.winnerName })
        .from(pbaTournaments).where(eq(pbaTournaments.season, season));
    if (before.length && !schedule.length) throw new Error("일정 응답이 비었다 — 기존 행 보존");
    if (before.some((b) => b.winnerName) && !tours.length) throw new Error("투어 목록 응답이 비었다 — 기존 우승자 보존");

    const memCodes = await resolveWinners(rows);
    const now = new Date();
    const values = rows.map((r) => ({ ...r, winnerMemCode: memCodes.get(r.id) ?? null, updatedAt: now }));
    const ids = rows.map((r) => r.id);

    let removed = 0;
    await db.transaction(async (tx) => {
        // 일정에서 사라진 행 정리 — 예정 대회에 코드가 붙으면 "S{seq}" 행이 "T{code}" 로 옮겨 가 옛 행이 남는다.
        // 응답이 기존의 절반도 안 되면 이상 응답으로 보고 지우지 않는다(덮어쓰기만).
        if (rows.length * 2 >= before.length) {
            const del = await tx.delete(pbaTournaments)
                .where(and(eq(pbaTournaments.season, season), notInArray(pbaTournaments.id, ids)))
                .returning({ id: pbaTournaments.id });
            removed = del.length;
        }
        for (let i = 0; i < values.length; i += 100) {
            await tx.insert(pbaTournaments).values(values.slice(i, i + 100)).onConflictDoUpdate({
                target: pbaTournaments.id,
                set: {
                    tourCode: sqlExcluded("tour_code"), season: sqlExcluded("season"), league: sqlExcluded("league"),
                    title: sqlExcluded("title"), titleEn: sqlExcluded("title_en"),
                    startDate: sqlExcluded("start_date"), endDate: sqlExcluded("end_date"), place: sqlExcluded("place"),
                    totalPrize: sqlExcluded("total_prize"), winnerPrize: sqlExcluded("winner_prize"),
                    // 끝난 대회의 우승자는 사라지지 않는다 — 투어 목록이 그 대회만 빼먹은 날 이미 적은 우승자를 null 로 덮지 않는다.
                    // 새 응답에 우승자가 있으면 이름·연결 둘 다 새 값(연결이 모호해져 풀리는 것도 반영)
                    winnerName: sql.raw(`coalesce(excluded.winner_name, pba_tournaments.winner_name)`),
                    winnerMemCode: sql.raw(`case when excluded.winner_name is null then pba_tournaments.winner_mem_code else excluded.winner_mem_code end`),
                    participants: sqlExcluded("participants"), officialSeq: sqlExcluded("official_seq"),
                    updatedAt: sqlExcluded("updated_at"),
                },
            });
        }
    });
    return {
        rows: rows.length,
        winners: rows.filter((r) => r.winnerName).length,
        linked: memCodes.size,
        removed,
    };
}

// upsert 의 set — 들어온 값(excluded)으로 덮는다
const sqlExcluded = (col: string) => sql.raw(`excluded.${col}`);

/** 시즌들을 차례로 동기화한다(멱등). 한 시즌 실패가 다른 시즌을 막지 않는다. */
export async function syncPbaTournaments(opts: { seasons: number[] }): Promise<{ seasons: Record<string, SeasonSyncResult | "empty">; errors: string[] }> {
    const seasons: Record<string, SeasonSyncResult | "empty"> = {};
    const errors: string[] = [];
    for (const season of opts.seasons) {
        try {
            seasons[season] = (await syncOneSeason(season)) ?? "empty";
        } catch (e) {
            const msg = `${season}: ${(e as Error)?.message}`;
            console.warn("[pba-tournaments] 시즌 동기화 실패", msg);
            errors.push(msg);
        }
        await sleep(300);
    }
    return { seasons, errors };
}

/**
 * 일일 크론 — 현재 시즌 + 다음 시즌(4요청). 다음 시즌 일정은 5월 중순부터 올라오는데(2026-27 첫 대회 5/16 실측)
 * currentPbaSeason 은 6월에야 넘어가서, 다음 시즌까지 같이 봐야 개막 대회가 허브의 '다가오는 대회'에 뜬다.
 */
export async function runPbaTournamentsCron() {
    const cur = currentPbaSeason();
    return syncPbaTournaments({ seasons: [cur, cur + 1] });
}
