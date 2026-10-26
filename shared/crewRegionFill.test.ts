/**
 * 크루 만들기 — '현재 위치를 크루 위치로 사용'을 누르면 지역 칸도 채운다(2026-10-26 오너: "크루 개설할 때 위치 설정에 자동으로 주소가 안 뜨네").
 * 예전엔 좌표만 저장하고 '위치 저장됨'만 바뀌었다. 지역은 카카오 좌표→행정구역(시도 시군구 — components/kakao/kakaoSdk regionFromCoords).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("크루 만들기 — 현재 위치로 지역 채우기", () => {
    it("누르면 좌표를 받고 → 지역을 찾아 칸을 채운다(못 찾으면 안내, 좌표는 남는다)", () => {
        const src = read("client/src/pages/hiq/create-club.tsx");
        const fn = src.slice(src.indexOf("const pickMyLocation = async () => {"), src.indexOf("const stepTitle"));
        expect(fn.indexOf("getDevicePosition({ prompt: true")).toBeLessThan(fn.indexOf("set({ latitude: r.fix.lat, longitude: r.fix.lng });"));
        expect(fn.indexOf("set({ latitude: r.fix.lat, longitude: r.fix.lng });")).toBeLessThan(fn.indexOf("await regionFromCoords("));
        expect(fn).toContain('if ("region" in found) set({ region: found.region });');
        expect(fn).toContain('toast({ title: t("createClub.regionNotFound") });');
        for (const l of ["ko", "en", "es", "vi", "tr"]) expect(read(`client/src/lib/i18n/${l}.ts`), l).toContain('"createClub.regionNotFound":');
    });
    it("지역 찾기는 유료 호출이라 하루 상한을 거친다 — 행정동(H) 줄의 시도 + 시군구", () => {
        const sdk = read("client/src/components/kakao/kakaoSdk.ts");
        const fn = sdk.slice(sdk.indexOf("export async function regionFromCoords("));
        expect(fn.indexOf('await askKakao("local")')).toBeLessThan(fn.indexOf("coord2RegionCode("));
        expect(fn).toContain('rows.find((x) => x?.region_type === "H") ?? rows[0]');
        expect(fn).toContain("[r?.region_1depth_name, r?.region_2depth_name]");
    });
});
