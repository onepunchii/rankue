/**
 * 캔버스 안에서 쓰는 디자인 토큰 읽기. 렌더러(강조 링·공 색)와 오버레이(조준선·라벨)가 같은 팔레트를 쓰도록
 * :root 의 CSS 변수(--brand, --ink-1, --surface-1, --surface-line, --ball-*)를 한 곳에서 읽는다.
 * 읽을 수 없으면(테스트·초기화 전) index.css 의 기본값으로 대체한다.
 *
 * 라사·레일·큐대 같은 물리적 사물의 색은 여기 두지 않는다 — 그건 렌더러 안의 리터럴이다.
 */

export type RGBA = readonly [number, number, number, number];

/**
 * CSS 색 문자열 → RGBA. 지원: #rgb/#rrggbb/#rrggbbaa, rgb()/rgba() (쉼표·공백·슬래시), "r g b"(채널 토큰).
 * 그 밖의 형식은 null.
 */
export function parseColor(input: string | null | undefined): RGBA | null {
    if (!input) return null;
    const s = input.trim();
    if (!s) return null;
    if (s[0] === "#") {
        const h = s.slice(1);
        if (h.length === 3 || h.length === 4) {
            const n = h.split("").map((c) => parseInt(c + c, 16));
            if (n.some(Number.isNaN)) return null;
            return [n[0], n[1], n[2], h.length === 4 ? n[3] / 255 : 1];
        }
        if (h.length === 6 || h.length === 8) {
            const n = [0, 2, 4, 6].slice(0, h.length / 2).map((i) => parseInt(h.slice(i, i + 2), 16));
            if (n.some(Number.isNaN)) return null;
            return [n[0], n[1], n[2], h.length === 8 ? n[3] / 255 : 1];
        }
        return null;
    }
    const m = /^rgba?\((.*)\)$/i.exec(s);
    const body = m ? m[1] : s;
    const parts = body.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const num = parts.map((p) => (p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p)));
    if (num.some(Number.isNaN)) return null;
    const r = parts[0].endsWith("%") ? num[0] * 255 : num[0];
    const g = parts[1].endsWith("%") ? num[1] * 255 : num[1];
    const b = parts[2].endsWith("%") ? num[2] * 255 : num[2];
    const a = parts.length === 4 ? Math.max(0, Math.min(1, num[3])) : 1;
    return [r, g, b, a];
}

/** RGBA 에 알파 배수를 곱해 canvas 색 문자열로. */
export function rgba(c: RGBA, alphaMul = 1): string {
    const a = Math.max(0, Math.min(1, c[3] * alphaMul));
    return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

/** 각 채널에 배수를 곱한 색(명암용). 알파는 그대로. */
export function scaleColor(c: RGBA, mul: number): RGBA {
    const k = Math.max(0, mul);
    return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), c[3]];
}

export interface Palette {
    readonly brand: RGBA;
    readonly ink1: RGBA;
    readonly surface1: RGBA;
    readonly surfaceLine: RGBA;
    readonly ballWhite: RGBA;
    readonly ballYellow: RGBA;
    readonly ballRed: RGBA;
}

/** index.css :root 기본값. 토큰을 못 읽을 때만 쓴다. */
export const DEFAULT_PALETTE: Palette = {
    brand: [0, 98, 65, 1],
    ink1: [0, 0, 0, 0.87],
    surface1: [255, 255, 255, 1],
    surfaceLine: [0, 0, 0, 0.09],
    ballWhite: [247, 244, 237, 1],
    ballYellow: [232, 179, 37, 1],
    ballRed: [200, 68, 46, 1],
};

/** :root 에서 토큰을 읽는다. doc 이 없거나 getComputedStyle 이 없으면 기본값. */
export function readPalette(doc: Document | null | undefined): Palette {
    if (!doc || typeof getComputedStyle !== "function" || !doc.documentElement) return DEFAULT_PALETTE;
    let cs: CSSStyleDeclaration;
    try { cs = getComputedStyle(doc.documentElement); } catch { return DEFAULT_PALETTE; }
    const pick = (name: string, fallback: RGBA): RGBA => {
        try { return parseColor(cs.getPropertyValue(name)) ?? fallback; } catch { return fallback; }
    };
    return {
        brand: pick("--brand", DEFAULT_PALETTE.brand),
        ink1: pick("--ink-1", DEFAULT_PALETTE.ink1),
        surface1: pick("--surface-1", DEFAULT_PALETTE.surface1),
        surfaceLine: pick("--surface-line", DEFAULT_PALETTE.surfaceLine),
        ballWhite: pick("--ball-white", DEFAULT_PALETTE.ballWhite),
        ballYellow: pick("--ball-yellow", DEFAULT_PALETTE.ballYellow),
        ballRed: pick("--ball-red", DEFAULT_PALETTE.ballRed),
    };
}
