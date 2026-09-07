/**
 * shareShot 검증(부수효과 주입): 링크는 항상 먼저 복사 → 네이티브(파일 쓰기 + Share) / Web Share(파일+텍스트 → 파일만) /
 * 다운로드 / 클립보드 폴백 순서, 공유 시트 닫음은 성공, 렌더 실패는 링크 복사만으로 성공.
 * useShare 는 "@/..." 별칭 모듈을 import 하므로 먼저 vi.mock 한다(README 규칙).
 */
import { describe, it, expect, vi } from "vitest";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { TABLES, DEFAULT_PARAMS } from "@shared/sim/params";

vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (k: string) => k, locale: "ko" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => undefined }) }));

import { isDismissal, shareShot, type ShareDeps, type ShareMeta, type WebShareData } from "./useShare";

const result = simulateShot(openingLayout("3c", TABLES.DAEDAE, "white"), { cueBallId: "white", phi: 1.25, V0: 3, a: 0, b: 0, theta: 0 }, DEFAULT_PARAMS);
const URL_ = "https://www.rankue.co.kr/online-game?replay=abc";
const meta: ShareMeta = {
    table: TABLES.DAEDAE, gameType: "3c", cueBallId: "white", badge: "3쿠션", title: "연습 샷", subtitle: "대대 · 3쿠션 UMB · 3.0 m/s",
    footer: "랭큐 시뮬레이터 · rankue.co.kr", replayText: "rankue.co.kr/online-game?replay=abc", replayUrl: URL_, date: "2026.09.07",
    filename: "shot.png",
};

function fakeCanvas(withContext = true): HTMLCanvasElement {
    const gradient = { addColorStop: () => undefined };
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
        get(_t, prop: string) {
            if (prop in store) return store[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
            if (prop === "measureText") return (s: string) => ({ width: String(s).length * 14 });
            return () => undefined;
        },
        set(_t, prop: string, value) { store[prop] = value; return true; },
    });
    return { width: 0, height: 0, getContext: () => (withContext ? ctx : null) } as unknown as HTMLCanvasElement;
}

interface Fake {
    deps: ShareDeps;
    log: string[];
    shared: { native: unknown[]; web: WebShareData[] };
}

function fake(over: Partial<ShareDeps> & { native?: boolean; blob?: Blob | null } = {}): Fake {
    const log: string[] = [];
    const shared = { native: [] as unknown[], web: [] as WebShareData[] };
    const blob = over.blob === undefined ? ({ size: 10, type: "image/png" } as Blob) : over.blob;
    const deps: ShareDeps = {
        isNative: () => over.native === true,
        writeCacheFile: async (name, base64) => { log.push(`write:${name}:${base64}`); return `file:///cache/${name}`; },
        nativeShare: async (o) => { shared.native.push(o); log.push("native"); },
        webShare: () => null,
        download: () => { log.push("download"); return true; },
        copy: async (text) => { log.push(`copy:${text}`); return true; },
        blobToBase64: async () => "QUJD",
        createCanvas: () => fakeCanvas(),
        toBlob: async () => blob,
        makeFile: (_b, filename) => ({ name: filename } as unknown as File),
        ...over,
    };
    return { deps, log, shared };
}

describe("shareShot", () => {
    it("네이티브: 링크 복사 → 캐시에 PNG → Share.share(files) · 텍스트에 제목과 링크", async () => {
        const f = fake({ native: true });
        const r = await shareShot(result, meta, f.deps);
        expect(r).toEqual({ ok: true, method: "native", copied: true, url: URL_ });
        expect(f.log).toEqual([`copy:${URL_}`, "write:shot.png:QUJD", "native"]);
        expect(f.shared.native[0]).toEqual({ title: "연습 샷", text: `연습 샷\n${URL_}`, files: ["file:///cache/shot.png"] });
    });

    it("네이티브: 공유 시트를 닫은 것은 성공, 그 밖의 실패는 복사 여부로", async () => {
        const closed = fake({ native: true, nativeShare: async () => { throw new Error("Share canceled"); } });
        expect((await shareShot(result, meta, closed.deps)).ok).toBe(true);
        const broken = fake({ native: true, nativeShare: async () => { throw new Error("boom"); } });
        expect(await shareShot(result, meta, broken.deps)).toMatchObject({ ok: true, method: "clipboard", copied: true });
        const brokenNoCopy = fake({ native: true, nativeShare: async () => { throw new Error("boom"); }, copy: async () => false });
        expect(await shareShot(result, meta, brokenNoCopy.deps)).toEqual({ ok: false, method: null, copied: false, url: URL_ });
    });

    it("웹: Web Share 가 파일+텍스트를 받으면 그대로, 텍스트를 거부하면 파일만", async () => {
        const both = fake({ webShare: () => ({ canShare: () => true, share: async (d) => { both.shared.web.push(d); } }) });
        expect(await shareShot(result, meta, both.deps)).toMatchObject({ ok: true, method: "web-share" });
        expect(both.shared.web[0].text).toBe(`연습 샷\n${URL_}`);
        expect(both.shared.web[0].files?.[0]).toEqual({ name: "shot.png" });

        const filesOnly = fake({ webShare: () => ({ canShare: (d) => d.text === undefined, share: async (d) => { filesOnly.shared.web.push(d); } }) });
        expect(await shareShot(result, meta, filesOnly.deps)).toMatchObject({ ok: true, method: "web-share" });
        expect(filesOnly.shared.web[0]).toEqual({ files: [{ name: "shot.png" }] });
        expect(filesOnly.log).not.toContain("download");
    });

    it("웹: 시트를 닫으면(AbortError) 성공, 파일 공유 불가면 다운로드", async () => {
        const abort = fake({ webShare: () => ({ canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } }) });
        expect(await shareShot(result, meta, abort.deps)).toMatchObject({ ok: true, method: "web-share" });
        const none = fake({ webShare: () => ({ canShare: () => false, share: async () => undefined }) });
        expect(await shareShot(result, meta, none.deps)).toMatchObject({ ok: true, method: "download" });
        expect(none.log).toContain("download");
        const plain = fake();
        expect(await shareShot(result, meta, plain.deps)).toMatchObject({ ok: true, method: "download" });
    });

    it("이미지 경로가 전부 막혀도 링크가 복사됐으면 clipboard 로 성공, 아니면 실패", async () => {
        const noDl = fake({ download: () => false });
        expect(await shareShot(result, meta, noDl.deps)).toMatchObject({ ok: true, method: "clipboard", copied: true });
        const nothing = fake({ download: () => false, copy: async () => false });
        expect(await shareShot(result, meta, nothing.deps)).toEqual({ ok: false, method: null, copied: false, url: URL_ });
    });

    it("렌더 실패(컨텍스트 없음·toBlob null)는 링크 복사만으로 성공하고 공유는 부르지 않는다", async () => {
        const noCtx = fake({ native: true, createCanvas: () => fakeCanvas(false) });
        expect(await shareShot(result, meta, noCtx.deps)).toMatchObject({ ok: true, method: "clipboard" });
        expect(noCtx.log).toEqual([`copy:${URL_}`]);
        const noBlob = fake({ native: true, blob: null });
        expect(await shareShot(result, meta, noBlob.deps)).toMatchObject({ ok: true, method: "clipboard" });
        expect(noBlob.shared.native).toHaveLength(0);
        const copyThrows = fake({ copy: async () => { throw new Error("denied"); }, createCanvas: () => fakeCanvas(false) });
        expect(await shareShot(result, meta, copyThrows.deps)).toEqual({ ok: false, method: null, copied: false, url: URL_ });
    });

    it("기본 파일 이름·문구, isDismissal", async () => {
        const f = fake({ native: true });
        await shareShot(result, { ...meta, filename: undefined, text: "custom" }, f.deps);
        expect(f.log[1]).toMatch(/^write:rankue-shot-\d{8}-[0-9a-f]{8}\.png:QUJD$/);
        expect((f.shared.native[0] as { text: string }).text).toBe("custom");
        expect(isDismissal({ name: "AbortError" })).toBe(true);
        expect(isDismissal(new Error("User dismissed the share sheet"))).toBe(true);
        expect(isDismissal("cancelled")).toBe(true);
        expect(isDismissal(new Error("boom"))).toBe(false);
        expect(isDismissal(null)).toBe(false);
    });
});
