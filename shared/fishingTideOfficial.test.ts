import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { officialTurns } from "./fishingPort";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

describe("공식 만조 · 간조(조석예보 고 · 저조)", () => {
    it("이웃보다 높으면 만조 · 낮으면 간조 — 10/17 제주 실측 넷", () => {
        const pts = [{ min: hm("01:13"), cm: 194 }, { min: hm("08:08"), cm: 113 }, { min: hm("15:39"), cm: 227 }, { min: hm("22:17"), cm: 167 }];
        expect(officialTurns(pts)).toEqual([
            { min: hm("01:13"), cm: 194, kind: "high" }, { min: hm("08:08"), cm: 113, kind: "low" },
            { min: hm("15:39"), cm: 227, kind: "high" }, { min: hm("22:17"), cm: 167, kind: "low" },
        ]);
        expect(officialTurns([{ min: 60, cm: 100 }])).toEqual([]);
    });

    it("항구 브리핑은 공식 값이 있으면 그것, 없으면 예측 조위의 꺾임 · 받기는 상태판에", () => {
        expect(read("server/services/fishingPort.ts")).toContain("turns: official ?? tideTurns(points.map(([min, cm]) => ({ min, cm }))),");
        expect(read("server/services/fishingPort.ts")).toContain('khoa("tideFcstHghLw/GetTideFcstHghLwApiService"');
        expect(read("shared/fishingFeeds.ts")).toContain('"khoa:tideFcstHghLw"');
    });
});
