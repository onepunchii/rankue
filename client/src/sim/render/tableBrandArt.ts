/**
 * 당구대 로고를 천에 놓는 법(2026-10-24 — 규칙 shared/tableBrand). 두 렌더러가 같은 자리 · 같은 그림을 쓴다.
 *  - brandRects: 테이블 좌표(m)의 로고 자리. 로고의 가로는 짧은 변(x) 방향, 위쪽은 +y(풋 쪽 — 위에서 본 화면의 위).
 *    center = 가운데 하나, ends = 헤드 · 풋 쪽에 작게 둘(풋 쪽 것은 반 바퀴 돌려 그쪽 끝에서 바로 읽히게).
 *  - brandArt: tone 'cloth' 면 밝은 실루엣(밝은 곳일수록 진하게)으로 바꾼 캔버스 — 천 색에 녹은 각인처럼. 'original' 이면 그림 그대로.
 * 물리 · 조준과는 상관없다.
 */
import type { TableSpec } from "@shared/sim/params";
import type { TableBrandView } from "@shared/tableBrand";

export interface BrandRect {
    /** 가운데(m) */
    readonly cx: number;
    readonly cy: number;
    /** 가로 · 세로(m) */
    readonly w: number;
    readonly h: number;
    /** 돌림(rad) — 0 또는 π */
    readonly rot: number;
}

export function brandRects(table: Pick<TableSpec, "width" | "length">, brand: Pick<TableBrandView, "scale" | "place">, aspect: number): BrandRect[] {
    const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 2;
    if (brand.place === "ends") {
        const w = table.width * brand.scale * 0.6, h = w / a;
        // 레일과 스팟(¼ · ¾) 사이 — 쿠션에서 로고 높이만큼 띄운다
        const y = Math.max(h * 0.8, table.length * 0.12);
        return [{ cx: table.width / 2, cy: y, w, h, rot: 0 }, { cx: table.width / 2, cy: table.length - y, w, h, rot: Math.PI }];
    }
    const w = table.width * brand.scale;
    return [{ cx: table.width / 2, cy: table.length / 2, w, h: w / a, rot: 0 }];
}

/** 그림 → 천에 찍을 캔버스(긴 변 1024 까지). 못 만들면 그림 그대로 */
export function brandArt(img: HTMLImageElement, tone: TableBrandView["tone"], createCanvas: () => HTMLCanvasElement): CanvasImageSource {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return img;
    const k = Math.min(1, 1024 / Math.max(w, h));
    const c = createCanvas();
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext("2d");
    if (!ctx) return img;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (tone !== "cloth") return c;
    try {
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            d[i + 3] = Math.round(d[i + 3] * (0.35 + 0.65 * lum));
            d[i] = d[i + 1] = d[i + 2] = 255;
        }
        ctx.putImageData(id, 0, 0);
    } catch { /* 다른 출처 그림이면 읽을 수 없다 — 그대로 */ }
    return c;
}

export const brandAspect = (img: HTMLImageElement): number => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    return w && h ? w / h : 2;
};
/** 다시 그려야 하는가를 가르는 열쇠(테이블 · 그림 · 모양) */
export const brandKey = (b: TableBrandView | null, tableId: string): string =>
    b ? `${tableId}|${b.id}|${b.image}|${b.opacity}|${b.scale}|${b.place}|${b.tone}` : `${tableId}|none`;

/**
 * 로고 그림을 한 번만 부른다(큐 손잡이 그림과 같은 방식). 올린 그림은 다른 출처(저장소)라 crossOrigin 으로 불러야
 * 캔버스가 더럽혀지지 않는다(저장소가 access-control-allow-origin: * 를 준다) — 안 그러면 3D 질감이 SecurityError 로 죽는다.
 */
const cache = new Map<string, { img: HTMLImageElement; ready: boolean; failed: boolean }>();
let version = 0;
export function brandImage(url: string | null | undefined): HTMLImageElement | null {
    if (!url || typeof Image === "undefined") return null;
    let e = cache.get(url);
    if (!e) {
        const img = new Image();
        if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
        img.decoding = "async";
        const entry = { img, ready: false, failed: false };
        img.onload = () => { entry.ready = true; version += 1; };
        img.onerror = () => { entry.failed = true; };
        img.src = url;
        cache.set(url, entry);
        e = entry;
    }
    return e.ready ? e.img : null;
}
/** 다 불러온 로고가 늘 때마다 오른다 */
export const brandImageVersion = (): number => version;
