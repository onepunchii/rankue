import { describe, it, expect } from "vitest";
import { editionSignature, klpgaRankingFromStats, mapKpgaStatRow, mapOwgrRow, mapRolexItem, parseKlpgaRows, parseRankText, parseRolexHtml } from "./parse";

describe("OWGR", () => {
    it("JSON 한 행 → 공통 행(평균 포인트가 순위 기준, 지난주 순위 보존)", () => {
        const r = mapOwgrRow({
            rank: 13, pointsTotal: 202.1, pointsAverage: 4.81, divisorActual: 42, lastWeekRank: 13, endLastYearRank: 47,
            player: { id: 20000, fullName: "Si Woo Kim", birthDate: "1995-06-21T00:00:00", isAmateur: false, country: { iocCode: "KOR", code3: "KOR", name: "Korea" } },
        })!;
        expect(r).toMatchObject({ rank: 13, playerId: "20000", playerName: "Si Woo Kim", country: "KOR", points: 4.81, pointsTotal: 202.1, events: 42, prevRank: 13 });
        expect(r.extra).toMatchObject({ endLastYearRank: 47, birthDate: "1995-06-21", isAmateur: false });
    });
    it("선수 id 가 없으면 버린다", () => {
        expect(mapOwgrRow({ rank: 1, player: { id: 0 as any, fullName: "?" } })).toBeNull();
    });
});

describe("Rolex HTML", () => {
    const html = `<p>Rankings as of 2026-09-07</p><table>
<tr><th>rank</th><th>change</th><th>country</th><th>player</th><th>average points</th><th>total points</th><th>events played</th></tr>
<tr><td>1</td><td>0</td><td>USA</td><td> <a href="/players/5394">Nelly Korda</a> </td><td>13.51</td><td>486.35</td><td>36</td></tr>
<tr><td>3</td><td>+2</td><td>KOR</td><td> <a href="/players/9001">Haeran Ryu</a> </td><td>8.41</td><td>369.98</td><td>44</td></tr>
<tr><td>4</td><td>-1</td><td>KOR</td><td> <a href="/players/9002">Hyojoo Kim</a> </td><td>7.80</td><td>335.58</td><td>43</td></tr>
</table>`;
    it("회차·행·변동", () => {
        const p = parseRolexHtml(html);
        expect(p.asOf).toBe("2026-09-07");
        expect(p.rows).toHaveLength(3);
        expect(p.rows[0]).toMatchObject({ rank: 1, playerId: "5394", playerName: "Nelly Korda", country: "USA", points: 13.51, pointsTotal: 486.35, events: 36, prevRank: 1 });
        expect(p.rows[1].prevRank).toBe(5);   // +2 상승 → 지난주 5위
        expect(p.rows[2].prevRank).toBe(3);   // -1 하락 → 지난주 3위
    });
});

describe("Rolex JSON", () => {
    it("항목 → 공통 행. rank_delta 로 지난주 순위", () => {
        const r = mapRolexItem({ id: 7331, name_first: "Jeeno", name_last: "Thitikul", country_code: "THA", rank: 2, rank_delta: 1, points_average: 10.73, points_total: 450.7, tournament_count: 42 })!;
        expect(r).toMatchObject({ rank: 2, playerId: "7331", playerName: "Jeeno Thitikul", country: "THA", points: 10.73, pointsTotal: 450.7, events: 42, prevRank: 3 });
    });
});

describe("KPGA", () => {
    it("record → 기록 행. 'T3' 는 3", () => {
        expect(parseRankText("T3")).toBe(3);
        const r = mapKpgaStatRow({ playerCode: "00056815", playerName: "장유빈", enPlayerName: "Yubin JANG", ranking: "1", record: "4230.70", countryShortName: "KOR", affilation: "신한금융그룹", gameJoinCount: "12", winCnt: 2, top10Cnt: 4 })!;
        expect(r).toMatchObject({ rank: 1, playerId: "00056815", playerName: "장유빈", value: 4230.7 });
        expect(r.extra).toMatchObject({ nameEn: "Yubin JANG", country: "KOR", events: 12, wins: 2, top10: 4 });
    });
});

describe("KLPGA HTML 조각", () => {
    const html = `<tr><th>FAV</th><th>순위</th></tr>
<tr><td><i></i></td><td>1</td><td><img src="kr.png"></td><td><a href="/web/profile/mainRecord?playerCode=9752">김나현2</a><span>삼천리</span></td><td>261.5829 0.31</td><td></td><td>35</td><td>18</td><td></td></tr>
<tr><td></td><td>T2</td><td></td><td><a href="/web/profile/mainRecord?playerCode=10725">김민솔</a></td><td>258.7386</td><td>3</td><td>8</td><td>19</td><td></td></tr>`;
    it("순위·선수·값(보조 숫자는 무시)", () => {
        const rows = parseKlpgaRows(html);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ rank: 1, playerId: "9752", playerName: "김나현2", value: 261.5829 });
        expect(rows[1]).toMatchObject({ rank: 2, playerId: "10725", playerName: "김민솔", value: 258.7386 });
    });
    it("대상포인트 목록 → 투어 랭킹(우승·톱10·대회 수 보존)", () => {
        const rk = klpgaRankingFromStats(parseKlpgaRows(html));
        expect(rk[1]).toMatchObject({ rank: 2, playerId: "10725", country: "KOR", points: 258.7386, events: 19 });
        expect(rk[1].extra).toMatchObject({ wins: 3, top10: 8 });
    });
});

describe("editionSignature", () => {
    it("상위 300명 순위·값이 같으면 같다 — 대회 없는 날 스냅샷을 안 쌓는 근거", () => {
        const a = [{ rank: 1, playerId: "a", points: 1.2345 }, { rank: 2, playerId: "b", points: 1.1 }];
        expect(editionSignature(a)).toBe(editionSignature([...a]));
        expect(editionSignature(a)).not.toBe(editionSignature([{ ...a[0], points: 1.2355 }, a[1]]));
    });
});
