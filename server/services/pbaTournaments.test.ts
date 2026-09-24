import { describe, it, expect } from "vitest";
import { buildSeasonRows, parseKrw } from "./pbaTournaments.js";
import { parseUmbCalendar } from "./umbCalendar.js";

const d = (y: number, m: number, day: number) => ({ year: y, monthValue: m, dayOfMonth: day });

describe("parseKrw — 공식 상금 표기(실측)", () => {
    it("금액 한 개만 읽는다", () => {
        expect(parseKrw("2억 5천만원")).toBe(250_000_000);
        expect(parseKrw("4000만원")).toBe(40_000_000);
        expect(parseKrw("1억 2천 5백만원")).toBe(125_000_000);
        expect(parseKrw("1천 500만원")).toBe(15_000_000);
        expect(parseKrw("9천3백만원")).toBe(93_000_000);
        expect(parseKrw("4억")).toBe(400_000_000);
        expect(parseKrw("1억원")).toBe(100_000_000);
    });
    it("모르는 글·여러 금액·오타는 null", () => {
        expect(parseKrw("미정")).toBeNull();
        expect(parseKrw("")).toBeNull();
        expect(parseKrw("우승 1억, 준우승 5천만원")).toBeNull();
        expect(parseKrw("500백만원")).toBeNull();
        expect(parseKrw("4억5000")).toBeNull();
        expect(parseKrw(undefined)).toBeNull();
    });
});

describe("buildSeasonRows — 일정 + 투어 목록 합치기", () => {
    const schedule = [
        { SEQ: "tour1", MATCH_CODE: "240", TITLE: "휴온스 PBA 챔피언십", TITLE_EN: "Huons PBA Championship", LEAGUE_GUBUN: "PBA1",
          MATCH_START_DATE: d(2025, 10, 22), MATCH_END_DATE: d(2025, 10, 28), PLACE: "고양 킨텍스 PBA 스타디움",
          TOTAL_PRIZE: "2억 5천만원", WINNING_PRIZE: "1억원", JOIN_PLAYER: "128", DETAIL_BTN_ACTIVE_YN: 1 },
        // 팀리그 — 코드가 투어 코드와 겹쳐도 투어 코드 칸에 넣지 않는다
        { SEQ: "tlg1", MATCH_CODE: " 88", TITLE: "PBA 팀리그 - 4라운드", LEAGUE_GUBUN: "TLG",
          MATCH_START_DATE: d(2025, 11, 16), MATCH_END_DATE: d(2025, 11, 24), PLACE: "고양", TOTAL_PRIZE: "우승 1억, 준우승 5천만원",
          WINNING_PRIZE: "", JOIN_PLAYER: "74", DETAIL_BTN_ACTIVE_YN: 1 },
        // 코드 없는 일정인데 투어 목록엔 같은 리그·같은 시작일로 있다
        { SEQ: "dream0", MATCH_CODE: "", TITLE: "빌리보드 PBA 드림투어 개막전", LEAGUE_GUBUN: "PBA2",
          MATCH_START_DATE: d(2025, 7, 5), MATCH_END_DATE: d(2025, 7, 8), PLACE: "미정", TOTAL_PRIZE: "4천만원", WINNING_PRIZE: "1천만원", JOIN_PLAYER: "" },
        // 아직 코드가 없는 예정 대회
        { SEQ: "plan4", MATCH_CODE: "", TITLE: "PBA 제4차 투어", LEAGUE_GUBUN: "PBA1",
          MATCH_START_DATE: d(2026, 10, 6), MATCH_END_DATE: d(2026, 10, 12), PLACE: "미정", TOTAL_PRIZE: "", WINNING_PRIZE: "", JOIN_PLAYER: "" },
    ];
    const tours = [
        { "투어코드": 240, "투어명": "휴온스 PBA 챔피언십", "PBA타입": "PBA", "시즌코드": 2025, "투어시작일자": "2025-10-22", "투어종료일자": "2025-10-28", "우승자": "김영원" },
        { "투어코드": 4, "투어명": "PBA Billiboard Dream Tour 1차", "PBA타입": "PBA2", "시즌코드": 2025, "투어시작일자": "2025-07-05", "투어종료일자": "2025-07-08", "우승자": "윤균호" },
        { "투어코드": 3, "투어명": "PBA Tour Panasonic Open", "PBA타입": "PBA", "시즌코드": 2025, "투어시작일자": "2025-06-03", "투어종료일자": "2025-06-07", "우승자": "카시도코스타스" },
    ];
    const rows = buildSeasonRows(2025, schedule, tours);
    const by = (id: string) => rows.find((r) => r.id === id)!;

    it("코드 있는 투어: 일정 칸 + 투어 목록 우승자", () => {
        expect(by("T240")).toMatchObject({
            tourCode: 240, league: "PBA", totalPrize: 250_000_000, winnerPrize: 100_000_000, participants: 128,
            winnerName: "김영원", officialSeq: "tour1", place: "고양 킨텍스 PBA 스타디움",
        });
    });
    it("팀리그는 S{seq}, 투어 코드·공식 안내 없음, 상금 글은 읽지 않는다", () => {
        expect(by("Stlg1")).toMatchObject({ tourCode: null, league: "TEAM", totalPrize: null, officialSeq: null, participants: 74 });
    });
    it("코드 빈 일정은 같은 리그·같은 시작일 투어와 잇는다", () => {
        expect(by("T4")).toMatchObject({ tourCode: 4, league: "DREAM", winnerName: "윤균호", place: null, participants: null });
    });
    it("투어 목록에만 있는 대회도 싣는다(이름·날짜·우승자)", () => {
        expect(by("T3")).toMatchObject({ tourCode: 3, title: "PBA Tour Panasonic Open", winnerName: "카시도코스타스", totalPrize: null });
    });
    it("예정 대회는 S{seq} 로, 날짜순", () => {
        expect(by("Splan4")).toMatchObject({ tourCode: null, league: "PBA", place: null });
        expect(rows.map((r) => r.id)).toEqual(["T3", "T4", "T240", "Stlg1", "Splan4"]);
    });
});

describe("parseUmbCalendar — 공식 달력 표(실측 모양)", () => {
    const html = `<table class="min-w-full"><thead><tr><th>Date</th><th>Tournament</th><th>Place</th><th>Type</th><th>Organization</th></tr></thead><tbody>
<tr class="bg"><td colspan="5">September 2026</td></tr>
<tr><td>23 - 27 Sep</td><td>World Championship 3-Cushion</td><td>BLOIS / France</td><td>World Championship</td><td>UMB</td></tr>
<tr class="bg"><td colspan="5">October 2026</td></tr>
<tr><td>12 - 15 Oct</td><td>WCBS Games</td><td>POSTPONED - DOHA / Qatar</td><td>Games</td><td>WCBS</td></tr>
<tr><td>24 Oct</td><td>34th UMB General Assembly</td><td>ISTANBUL / Turkey</td><td>General Assembly</td><td>UMB</td></tr>
<tr><td>26 - 30 Oct</td><td>World Cup 3-Cushion</td><td>CANCELLED - CAIRO / Egypt</td><td>World Cup</td><td>UMB / AMECC</td></tr>
<tr class="bg"><td colspan="5">November 2026</td></tr>
<tr><td>02 - 08 Nov</td><td>World Cup 3-Cushion<span class="badge"><svg></svg> Registration Open </span></td><td>N/A / Korea</td><td>World Cup</td><td>UMB / ACBC</td></tr>
<tr class="bg"><td colspan="5">August 2027</td></tr>
<tr><td>30 Aug - 05 Sep</td><td>World Cup 3-Cushion</td><td>LIER / Belgium</td><td>World Cup</td><td>UMB / CEB</td></tr>
</tbody></table>`;
    const items = parseUmbCalendar(html);
    it("대회 줄만, 총회·취소된 대회는 뺀다", () => {
        expect(items.map((x) => x.name)).toEqual(["World Championship 3-Cushion", "WCBS Games", "World Cup 3-Cushion", "World Cup 3-Cushion"]);
    });
    it("날짜·장소·배지·연기", () => {
        expect(items[0]).toMatchObject({ startDate: "2026-09-23", endDate: "2026-09-27", city: "Blois", country: "France", countryCode: "FR", postponed: false });
        expect(items[1]).toMatchObject({ city: "Doha", countryCode: "QA", postponed: true });
        expect(items[2]).toMatchObject({ name: "World Cup 3-Cushion", city: null, countryCode: "KR", organization: "UMB / ACBC" });
        expect(items[3]).toMatchObject({ startDate: "2027-08-30", endDate: "2027-09-05", city: "Lier" });
    });
    it("표가 없으면 빈 목록", () => {
        expect(parseUmbCalendar("<html></html>")).toEqual([]);
    });
});
