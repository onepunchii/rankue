import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAROM_CITIES, caromCity } from "./caromCities";
import { WORLD_DOT_LAT0, WORLD_DOT_ROWS, WORLD_DOT_STEP } from "./worldDots";

/**
 * 세계랭킹의 '이번 랭킹에 들어간 대회' 지도(2026-10-19) — 도시 좌표표와 세계 육지 점.
 */
const isLandDot = (lat: number, lng: number) => {
    const r = Math.round((WORLD_DOT_LAT0 - lat) / WORLD_DOT_STEP);
    const c = Math.floor((lng + 180) / WORLD_DOT_STEP);
    const runs = WORLD_DOT_ROWS[r] ?? [];
    for (let i = 0; i < runs.length; i += 2) if (c >= runs[i] && c < runs[i] + runs[i + 1]) return true;
    return false;
};

describe("대회 지도 — 도시 · 세계 점", () => {
    it("지금 UMB 레전드의 도시는 다 안다(2025-26 시즌 월드컵 여덟 + 세계선수권 둘)", () => {
        for (const c of ["ANTWERP", "GWANGJU", "SHARM EL SHEIKH", "BOGOTA", "HO CHI MINH CITY", "ANKARA", "PORTO", "LIER", "BLOIS", "GRADIGNAN"]) {
            expect(caromCity(c), c).not.toBeNull();
        }
        expect(caromCity(" bogota ")?.ko).toBe("보고타");
        expect(caromCity("ATLANTIS")).toBeNull();
    });
    it("좌표는 그 나라 안 — 위도 · 경도를 뒤바꿔 적지 않았다", () => {
        expect(CAROM_CITIES.GWANGJU.lat).toBeGreaterThan(33); expect(CAROM_CITIES.GWANGJU.lng).toBeGreaterThan(124);
        expect(CAROM_CITIES.BOGOTA.lng).toBeLessThan(-70);
        expect(CAROM_CITIES.PORTO.lng).toBeLessThan(0);
        for (const [k, v] of Object.entries(CAROM_CITIES)) { expect(Math.abs(v.lat), k).toBeLessThan(70); expect(Math.abs(v.lng), k).toBeLessThan(180); }
    });
    it("세계 점은 육지에만 — 한반도 · 남미는 점, 대서양 · 태평양 한가운데는 빈칸", () => {
        expect(isLandDot(36, 127.5)).toBe(true);
        expect(isLandDot(-10, -60)).toBe(true);
        expect(isLandDot(30, -40)).toBe(false);
        expect(isLandDot(0, -150)).toBe(false);
    });
    it("선수 페이지의 대회 줄은 한글 도시('앤트워프 월드컵') · 순위 추이는 1위 눈금을 빼먹지 않는다(2026-10-19)", () => {
        const sheet = readFileSync(resolve(__dirname, "..", "client/src/components/hiq/umb/UmbPlayerSheet.tsx"), "utf8");
        expect(sheet).toContain("ko ? `${city(c)} ${kind}`");
        expect(sheet).not.toContain("eventView(e.label, t, { short: true })");
        const chart = readFileSync(resolve(__dirname, "..", "client/src/components/hiq/charts/RankTrendChart.tsx"), "utf8");
        expect(chart).toContain('interval={ticks ? 0 : "preserveEnd"}');
    });
    it("선수 페이지에 그 선수의 세계 투어 지도 — 표에 받은 점수, 목록은 아래 표가 대신(2026-10-19)", () => {
        const sheet = readFileSync(resolve(__dirname, "..", "client/src/components/hiq/umb/UmbPlayerSheet.tsx"), "utf8");
        expect(sheet).toContain("<UmbEventMap events={tourEvents} locale={locale} showList={false}");
        expect(sheet).toContain("pin: `+${pts}`");
    });
    it("세계랭킹 화면이 지도를 단다", () => {
        const s = readFileSync(resolve(__dirname, "..", "client/src/pages/hiq/world-ranking.tsx"), "utf8");
        expect(s).toContain("<UmbEventMap events={calendar}");
    });
});
