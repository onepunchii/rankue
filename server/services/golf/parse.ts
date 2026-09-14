/**
 * 골프 랭킹 출처별 응답 → 공통 행. 순수 함수만(네트워크 없음) — 테스트가 고정 응답으로 돈다.
 *
 * 출처 실측(2026-09-13):
 *  - OWGR: apiweb.owgr.com/api/owgr/rankings/getRankings JSON. 주차는 events/getEventsToDateHeader { weekNumber, endDate }.
 *  - Rolex(여자 세계): rolexrankings.com/rankings 가 서버 렌더 HTML 표(50행/요청)를 준다. "as of 2026-09-07" 문구가 회차.
 *  - KPGA: api.kpga.co.kr/record/detail?tourId=11&year=&menuId= JSON { records: [...] }, 라벨은 records[].title.
 *  - KLPGA: klpga.co.kr/load/record/loadPublicRecord POST(season, menu1, menu2) → HTML 조각 <tr>… 선수 링크에 playerCode.
 */

export interface RankRow {
    readonly rank: number;
    readonly playerId: string;
    readonly playerName: string;
    readonly nameKo: string | null;
    readonly country: string;         // IOC 3자
    readonly points: number;          // 순위 기준 값
    readonly pointsTotal: number | null;
    readonly events: number | null;
    readonly prevRank: number | null;
    readonly extra?: Record<string, unknown>;
}

export interface StatRow {
    readonly rank: number;
    readonly playerId: string;
    readonly playerName: string;
    readonly value: number;
    readonly extra?: Record<string, unknown>;
}

function num(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(n) ? n : null;
}

/** "T3" 같은 공동 순위 표기 → 3 */
export function parseRankText(s: unknown): number | null {
    const m = String(s ?? "").match(/\d+/);
    return m ? Number(m[0]) : null;
}

/* ── OWGR ── */
export interface OwgrRankingJson {
    rank: number; isTied?: boolean; pointsTotal?: number; pointsAverage?: number; divisorActual?: number;
    lastWeekRank?: number | null; endLastYearRank?: number | null;
    player: { id: number; fullName: string; firstName?: string; lastName?: string; birthDate?: string | null; isAmateur?: boolean;
        country?: { iocCode?: string; code3?: string; name?: string } | null };
}

export function mapOwgrRow(r: OwgrRankingJson): RankRow | null {
    if (!r?.player?.id || !Number.isFinite(r.rank)) return null;
    const country = (r.player.country?.iocCode || r.player.country?.code3 || "UNK").toUpperCase();
    return {
        rank: r.rank,
        playerId: String(r.player.id),
        playerName: r.player.fullName?.trim() || `${r.player.firstName ?? ""} ${r.player.lastName ?? ""}`.trim(),
        nameKo: null,
        country,
        points: num(r.pointsAverage) ?? 0,
        pointsTotal: num(r.pointsTotal),
        events: num(r.divisorActual),
        prevRank: num(r.lastWeekRank),
        extra: {
            endLastYearRank: num(r.endLastYearRank),
            birthDate: r.player.birthDate ? String(r.player.birthDate).slice(0, 10) : null,
            isAmateur: !!r.player.isAmateur,
        },
    };
}

/* ── Rolex(여자 세계) ── */
export interface RolexPage { readonly asOf: string | null; readonly rows: RankRow[] }

const TAG = /<[^>]+>/g;
function text(cell: string): string {
    return cell.replace(TAG, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

/** 표 한 페이지(50행). 열: rank · change · country · player(<a href="/players/ID">) · average · total · events */
export function parseRolexHtml(html: string): RolexPage {
    const asOf = html.match(/as of\s+(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
    const rows: RankRow[] = [];
    for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
        const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
        if (cells.length < 7) continue;
        const rank = num(text(cells[0]));
        const id = cells[3].match(/\/players\/(\d+)/)?.[1];
        if (rank === null || !id) continue;
        const change = num(text(cells[1]));   // +2 / -1 / 0 — 지난 회차 대비. 순위 - 변동 = 지난 순위
        rows.push({
            rank,
            playerId: id,
            playerName: text(cells[3]),
            nameKo: null,
            country: text(cells[2]).toUpperCase() || "UNK",
            points: num(text(cells[4])) ?? 0,
            pointsTotal: num(text(cells[5])),
            events: num(text(cells[6])),
            prevRank: change === null ? null : rank + change,
        });
    }
    return { asOf, rows };
}

/** core/rankings/list JSON 한 항목(2026-09 실측: id·name_first·name_last·country_code·rank·rank_delta·points_average·points_total·tournament_count) */
export interface RolexItemJson {
    id: number; name_first?: string; name_last?: string; country_code?: string; rank: number; rank_delta?: number | null;
    points_average?: number; points_total?: number; tournament_count?: number;
}

export function mapRolexItem(it: RolexItemJson): RankRow | null {
    if (!it?.id || !Number.isFinite(it.rank)) return null;
    const delta = num(it.rank_delta);
    return {
        rank: it.rank, playerId: String(it.id),
        playerName: `${it.name_first ?? ""} ${it.name_last ?? ""}`.replace(/\s+/g, " ").trim(),
        nameKo: null, country: (it.country_code || "UNK").toUpperCase(),
        points: num(it.points_average) ?? 0, pointsTotal: num(it.points_total), events: num(it.tournament_count),
        prevRank: delta === null ? null : it.rank + delta,   // rank_delta: +2 = 두 계단 상승
    };
}

/* ── wwgr.net (여자 세계랭킹 관리 사이트, 롤렉스 대체 경로) ──
 * rolexrankings.com 은 데이터센터 IP(Vercel·GitHub) 를 403 으로 막는다(2026-09-14 실측). wwgr.net/rankings?page=N 은
 * 같은 선수 id 로 100명씩 HTML 표를 주고 봇 차단이 없다. 행:
 *   <td><a name="6925"></a>3</td> <td><span>--</span></td> <td><i class="fa fa-arrow-up"></i><span>10</span></td>
 *   <td><img alt="KOR"> <span class="semi-bold">Ryu, Haeran</span> <small>- 6925</small> <td>44</td> <td>369.9825</td> <td>8.4087</td>
 * 주차는 /rankings/YYYY-MM-DD(주 마감 일요일) 링크 중 가장 늦은 것. 발표일(월요일)=마감+1 이 회차다(롤렉스 JSON 의 publish_date 와 같은 규칙).
 */
export interface WwgrPage { readonly weekEnd: string | null; readonly rows: RankRow[] }

/** "Korda, Nelly" → "Nelly Korda" (롤렉스 JSON 의 이름 표기와 맞춘다) */
export function flipName(s: string): string {
    const m = s.match(/^\s*([^,]+),\s*(.+?)\s*$/);
    return m ? `${m[2]} ${m[1]}`.replace(/\s+/g, " ").trim() : s.replace(/\s+/g, " ").trim();
}

export function parseWwgrPage(html: string): WwgrPage {
    const dates = [...html.matchAll(/\/rankings\/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]).sort();
    const weekEnd = dates.length ? dates[dates.length - 1] : null;
    const rows: RankRow[] = [];
    for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
        const id = tr.match(/<a name="(\d+)"><\/a>\s*(\d+)/);
        if (!id) continue;
        const rank = Number(id[2]);
        const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)(?=<td|<\/tr>)/g)].map((m) => m[1]);
        if (cells.length < 7) continue;
        const change = (() => {
            const n = num(text(cells[1]));
            if (n === null) return 0;                       // "--" = 변동 없음
            return /arrow-down/.test(cells[1]) ? -n : n;   // 화살표 위 = 상승
        })();
        const country = (cells[3].match(/alt="([A-Z]{3})"/)?.[1] ?? "UNK").toUpperCase();
        const name = flipName(text(cells[3].match(/<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ""));
        if (!name) continue;
        rows.push({
            rank, playerId: id[1], playerName: name, nameKo: null, country,
            points: num(text(cells[6])) ?? 0, pointsTotal: num(text(cells[5])), events: num(text(cells[4])),
            prevRank: rank + change,
        });
    }
    return { weekEnd, rows };
}

/** 주 마감(일요일) → 발표일(월요일) */
export function publishDateOf(weekEnd: string): string {
    const d = new Date(weekEnd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

/* ── KPGA ── */
export interface KpgaRecordJson {
    playerCode: string; playerName: string; enPlayerName?: string | null; ranking: string | number; record: string | number;
    countryShortName?: string | null; affilation?: string | null; gameJoinCount?: string | number | null; totalGameCount?: string | number | null;
    winCnt?: number | null; top10Cnt?: number | null; title?: string | null;
}

export function mapKpgaStatRow(r: KpgaRecordJson): StatRow | null {
    const rank = parseRankText(r.ranking);
    const value = num(r.record);
    if (!r.playerCode || rank === null || value === null) return null;
    return {
        rank, playerId: String(r.playerCode), playerName: String(r.playerName).trim(), value,
        extra: { nameEn: r.enPlayerName ?? null, country: r.countryShortName ?? null, sponsor: r.affilation ?? null, events: num(r.gameJoinCount), wins: num(r.winCnt), top10: num(r.top10Cnt) },
    };
}

/** 제네시스 포인트(menuId 1) 목록이 곧 KPGA 투어 랭킹 */
export function kpgaRankingFromStats(rows: readonly StatRow[]): RankRow[] {
    return rows.map((r) => ({
        rank: r.rank, playerId: r.playerId, playerName: r.playerName, nameKo: r.playerName,
        country: String(r.extra?.country || "KOR").toUpperCase(), points: r.value, pointsTotal: null,
        events: (r.extra?.events as number | null) ?? null, prevRank: null,
        extra: { nameEn: r.extra?.nameEn ?? null, sponsor: r.extra?.sponsor ?? null, wins: (r.extra?.wins as number | null) ?? null, top10: (r.extra?.top10 as number | null) ?? null },
    }));
}

/* ── KLPGA ── */
/**
 * loadPublicRecord HTML 조각. 행: [FAV, 순위, 국적(이미지), 선수명(<a href="…playerCode=N">), 값(+보조), …].
 * 값 칸에 "261.5829 0.31" 처럼 보조 숫자가 붙기도 한다 — 첫 숫자만 값이다.
 */
export function parseKlpgaRows(html: string): StatRow[] {
    const out: StatRow[] = [];
    for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
        const id = tr.match(/playerCode=(\d+)/)?.[1];
        if (!id) continue;
        const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
        if (cells.length < 5) continue;
        const rank = parseRankText(cells[1]);
        const first = cells[4].match(/-?[\d,]+(?:\.\d+)?/)?.[0];
        const value = first ? num(first) : null;
        if (rank === null || value === null) continue;
        const sponsor = cells[3].replace(/\s+/g, " ").trim();
        // 선수명 칸에 소속이 같이 오는 경우가 있다(줄바꿈) — 링크 안 텍스트가 이름
        const name = text(tr.match(/<a[^>]*playerCode=\d+[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? cells[3]);
        out.push({ rank, playerId: id, playerName: name || sponsor, value, extra: { c5: cells[5] ?? null, c6: cells[6] ?? null, c7: cells[7] ?? null } });
    }
    return out;
}

/** 대상포인트(Point/Klpga) 목록이 곧 KLPGA 투어 랭킹 */
export function klpgaRankingFromStats(rows: readonly StatRow[]): RankRow[] {
    return rows.map((r) => ({
        rank: r.rank, playerId: r.playerId, playerName: r.playerName, nameKo: r.playerName, country: "KOR",
        points: r.value, pointsTotal: null, events: num(r.extra?.c7) ?? null, prevRank: null,
        extra: { wins: num(r.extra?.c5), top10: num(r.extra?.c6) },
    }));
}

/**
 * 회차 서명 — 상위 300명의 (순위·값) 을 이어 붙인다. 투어 랭킹(kpga·klpga)은 대회가 없는 날엔 그대로라
 * 서명이 같으면 새 회차를 만들지 않는다(매일 같은 스냅샷이 쌓여 순위 추이가 계단이 되는 걸 막는다).
 */
export function editionSignature(rows: readonly { rank: number; playerId: string; points: number }[]): string {
    // 소수 둘째 자리까지만 — 롤렉스 JSON(13.51)과 wwgr(13.5098)처럼 출처마다 정밀도가 달라 같은 자료가 다른 서명이 되면 중복 회차가 생긴다(2026-09-14 실측)
    return rows.slice(0, 300).map((r) => `${r.rank}:${r.playerId}:${Math.round(r.points * 100)}`).join("|");
}
