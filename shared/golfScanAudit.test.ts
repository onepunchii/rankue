import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanReason, editedHoles, onSiteTargets, parseOnSiteLog, parseScanMeta, scanFlags, SCAN_DAY_FLAG, SCAN_EDIT_FLAG } from "./golfScanAudit";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const base = { edits: 0, sameDay: 1, cardDay: "2026-10-13", uploadedDay: "2026-10-13" };

describe("골프 스코어카드 라운드 감사", () => {
    it("다시 볼 것 — 고친 칸 · 하루 장수 · 옛 카드 · 낮은 타수", () => {
        expect(scanFlags(base)).toEqual([]);
        expect(scanFlags({ ...base, edits: SCAN_EDIT_FLAG })).toEqual([]);
        expect(scanFlags({ ...base, edits: SCAN_EDIT_FLAG + 1 })).toEqual(["many-edits"]);
        expect(scanFlags({ ...base, sameDay: SCAN_DAY_FLAG + 1 })).toEqual(["many-a-day"]);
        expect(scanFlags({ ...base, cardDay: "2025-10-12" })).toEqual(["old-card"]);
        expect(scanFlags({ ...base, cardDay: "2025-10-14" })).toEqual([]);
        // 파를 알면 파 대비, 모르면 타수로
        expect(scanFlags({ ...base, strokes: 66, relative: -6, parKnown: true })).toEqual(["low-score"]);
        expect(scanFlags({ ...base, strokes: 67, relative: -5, parKnown: true })).toEqual([]);
        expect(scanFlags({ ...base, strokes: 65, relative: null, parKnown: false })).toEqual(["low-score"]);
        // 고친 칸을 모르는 옛 스캔은 그 표시만 없다
        expect(scanFlags({ ...base, edits: null })).toEqual([]);
    });

    it("읽은 값과 다른 홀 — 1번부터, 읽은 값이 없으면 없음", () => {
        const r = Array(18).fill(4), s = [...r];
        s[2] = 5; s[17] = 3;
        expect(editedHoles(r, s)).toEqual([{ hole: 3, read: 4, saved: 5 }, { hole: 18, read: 4, saved: 3 }]);
        expect(editedHoles(null, s)).toEqual([]);
    });

    it("DB 의 칸을 모양을 믿지 않고 읽는다", () => {
        expect(parseScanMeta({ backfill: true })).toEqual({ read: null, edits: null, cardDay: null, backfill: true });
        expect(parseScanMeta({ read: Array(18).fill("4"), edits: 2, cardDay: "2026-10-01" })).toEqual({ read: Array(18).fill(4), edits: 2, cardDay: "2026-10-01", backfill: false });
        expect(parseScanMeta({ read: [1, 2], edits: -1, cardDay: "어제" })).toEqual({ read: null, edits: null, cardDay: null, backfill: false });
        expect(parseScanMeta(null)).toBeNull();
        expect(parseOnSiteLog([{ at: "x", to: false, by: "오너", reason: "남의 카드", from: true }, { at: 1 }, null])).toEqual([{ at: "x", to: false, by: "오너", reason: "남의 카드", from: true }]);
        expect(parseOnSiteLog("nope")).toEqual([]);
    });

    it("바꿀 수 있는 쪽 — 미인증은 공식으로만, 공식 · 옛 기록은 미인증으로만", () => {
        expect(onSiteTargets(false)).toEqual({ toOfficial: true, toUnverified: false });
        expect(onSiteTargets(true)).toEqual({ toOfficial: false, toUnverified: true });
        expect(onSiteTargets(null)).toEqual({ toOfficial: false, toUnverified: true });
    });

    it("사유는 두 글자 넘게, 200자까지", () => {
        expect(cleanReason(" ")).toBeNull();
        expect(cleanReason("a")).toBeNull();
        expect(cleanReason("  남의   카드  ")).toBe("남의 카드");
        expect(cleanReason("가".repeat(300))!.length).toBe(200);
    });

    it("스코어카드로 올리면 출처를 남긴다 · 어드민 '기록으로 끝내기'는 라운드 행을 넘긴다", () => {
        expect(read("server/storage/golf.repo.ts")).toMatch(/update golf_match_sessions set source = 'scan', scan_meta =/);
        expect(read("server/routes/modules/golf.ts")).toMatch(/scan: \{ read: ticket\.r\[d\.row\], edits, cardDay: ticket\.d \}/);
        const rounds = read("server/routes/modules/adminGolf/rounds.ts");
        expect(rounds).toContain("const detail = await roundDetail(session);");
        expect(rounds).not.toMatch(/roundDetail\(req\.params\.id\)/);
        expect(rounds).toMatch(/router\.post\("\/:id\/onsite"/);
        expect(rounds).toMatch(/if \(!reason\) return sendError\(res, 400/);
    });
});
