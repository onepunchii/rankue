/**
 * 어드민 '방문자 발자국' 날짜별 줄 — 방문 · 가입 · 전환(2026-11-06).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { conversionPct, conversionText, dailyTotals, mergeDaily } from "./visitorDaily";

describe("날짜별 방문 · 가입 합치기", () => {
    it("날짜로 합치고, 한쪽에만 있는 날도 남기고, 해가 바뀌어도 순서가 맞다", () => {
        const rows = mergeDaily(
            [{ day: "2026-12-31", guests: 800, members: 10 }, { day: "2027-01-01", guests: 700, members: 9 }],
            [{ day: "2027-01-01", total: 9, here: 8 }, { day: "2027-01-02", total: 2, here: 1 }],
        );
        expect(rows.map((r) => r.d)).toEqual(["12.31", "01.01", "01.02"]);
        expect(rows[0]).toMatchObject({ guests: 800, members: 10, signups: 0, signupsAll: 0 });
        expect(rows[1]).toMatchObject({ guests: 700, signups: 8, signupsAll: 9 });
        expect(rows[2]).toMatchObject({ guests: 0, members: 0, signups: 1 });
    });
    it("꼴이 틀린 날짜는 버린다", () => {
        expect(mergeDaily([{ day: "11.05", guests: 1, members: 0 }], [{ day: "", total: 1, here: 1 }])).toEqual([]);
    });
});

describe("전환", () => {
    it("가입 ÷ 비회원, 소수 한 자리 · 비회원이 없으면 —", () => {
        expect(conversionPct(8, 849)).toBe(0.9);
        expect(conversionText(16, 955)).toBe("1.7%");
        expect(conversionText(0, 300)).toBe("0.0%");
        expect(conversionText(3, 0)).toBe("—");
    });
    it("기간 합계", () => {
        const t = dailyTotals(mergeDaily(
            [{ day: "2026-11-05", guests: 849, members: 12 }, { day: "2026-11-04", guests: 786, members: 13 }],
            [{ day: "2026-11-05", total: 9, here: 8 }, { day: "2026-11-04", total: 12, here: 12 }],
        ));
        expect(t).toEqual({ guests: 1635, signups: 20, signupsAll: 21, pct: "1.2%" });
    });
});

describe("고정: 서버와 화면이 이 셈을 쓴다", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
    it("서버 — 한국 날짜 · 첫 발자국으로 웹/앱 가르기", () => {
        const r = read("server/routes/modules/adminVisitors.ts");
        expect(r).toContain('import { mergeDaily, type DailySignups, type DailyVisits } from "../../../shared/visitorDaily.js";');
        expect(r).toContain("(select (u.meta ? 'a') from ui_events u where u.member_id = m.id order by u.created_at, u.id limit 1) as app");
        expect(r).toContain("to_char((j.created_at at time zone 'UTC') at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day");
        expect(r).toContain("const daily = mergeDaily(dailyVisits, dailyJoins);");
    });
    it("화면 — 줄마다 가입 · 전환", () => {
        const v = read("client/src/pages/admin/VisitorsView.tsx");
        expect(v).toContain("<DailyRows rows={list<DailyRow>(s.daily)} where={where} />");
        expect(v).toContain("전환 <b className=\"text-brand\">{conversionText(num(r.signups), num(r.guests))}</b>");
    });
});
