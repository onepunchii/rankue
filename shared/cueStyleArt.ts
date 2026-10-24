/**
 * 상대 · 공 꾸미기의 그림(2026-10-24) — 그림 파일 대신 모양 정의(shared/cueStyles)에서 SVG 를 만든다.
 * 큐 케이스 · 관리자 · 증정 · 공유 카드가 caseImage() 하나로 같은 그림을 본다(data: 주소).
 *  - 상대: 큐 그림과 같은 1000×80 틀(왼쪽 이음쇠 → 오른쪽 팁) — 큐 케이스의 긴 홈에 그대로 들어간다.
 *  - 공: 200×200 — 비스듬히 본 흰 공(점 셋이 보인다). 바탕은 흰 공(노란 공에도 같은 무늬가 들어간다).
 * ⚠️ 서버도 부른다 — 상대 임포트는 ./x.js. 숫자만 쓴다(브라우저 · 캔버스 · satori 어디서든 그려지게).
 */
import { RAINBOW_DOTS, type BallDotShape, type BallStyle, type ShaftStyle } from "./cueStyles.js";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** 상대 그림 — 1000×80. 이음쇠(왼쪽) 지름 44 → 팁(오른쪽) 24 */
export function shaftSvg(st: ShaftStyle, id = "s"): string {
    const top = (x: number) => 18 + (x / 1000) * 10, bot = (x: number) => 62 - (x / 1000) * 10;
    const body = `M0 ${top(0)} L950 ${top(950)} L950 ${bot(950)} L0 ${bot(0)} Z`;
    const defs: string[] = [`<clipPath id="${id}k"><path d="${body}"/></clipPath>`];
    const layers: string[] = [];
    const fill = st.fade ? `url(#${id}f)` : esc(st.base);
    if (st.fade) defs.push(`<linearGradient id="${id}f" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${esc(st.fade[0])}"/><stop offset="1" stop-color="${esc(st.fade[1])}"/></linearGradient>`);
    layers.push(`<path d="${body}" fill="${fill}"/>`);
    // 결 · 고리 · 광택은 몸통 윤곽 안에서만(가늘어지는 끝에서 삐져나오지 않게)
    const inner: string[] = [];
    if (st.grain && st.finish === "wood") {
        for (let i = 0; i < 7; i++) {
            const y0 = 22 + i * 5.2;
            inner.push(`<path d="M0 ${y0} C250 ${y0 - 2.5} 500 ${y0 + 2.5} 950 ${y0 + (i - 3) * 1.2}" fill="none" stroke="${esc(st.grain)}" stroke-width="1.4" opacity="0.55"/>`);
        }
    }
    if (st.grain && st.finish === "carbon") {
        defs.push(`<pattern id="${id}c" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="10" fill="${esc(st.grain)}" opacity="0.55"/></pattern>`);
        inner.push(`<rect width="950" height="80" fill="url(#${id}c)"/>`);
    }
    if (st.ring) for (const x of [40, 58, 76]) inner.push(`<rect x="${x}" y="0" width="${x === 58 ? 8 : 4}" height="80" fill="${esc(st.ring)}"/>`);
    // 광택 — 위쪽 반사 띠
    inner.push(`<path d="M0 ${top(0) + 4} L950 ${top(950) + 3} L950 ${top(950) + 7} L0 ${top(0) + 9} Z" fill="#FFFFFF" opacity="${st.finish === "wood" ? 0.12 : 0.28}"/>`);
    layers.push(`<g clip-path="url(#${id}k)">${inner.join("")}</g>`);
    // 페룰 · 팁 · 이음쇠
    layers.push(`<rect x="950" y="${top(950)}" width="40" height="${bot(950) - top(950)}" fill="${esc(st.ferrule)}"/>`);
    layers.push(`<rect x="988" y="${top(988) + 0.5}" width="12" height="${bot(988) - top(988) - 1}" rx="2" fill="${esc(st.tip)}"/>`);
    layers.push(`<rect x="0" y="${top(0) - 2}" width="14" height="${bot(0) - top(0) + 4}" rx="2" fill="#C9CDD2"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 80" width="1000" height="80"><defs>${defs.join("")}</defs>${layers.join("")}</svg>`;
}

/** 점 하나의 모양(SVG) — 가운데 (cx, cy), 가로 반지름 rx · 세로 반지름 ry */
function dotShape(shape: BallDotShape, cx: number, cy: number, rx: number, ry: number, color: string): string {
    const c = esc(color);
    const P = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(cx + x * rx).toFixed(1)} ${(cy + y * ry).toFixed(1)}`).join(" ") + " Z";
    switch (shape) {
        case "star": {
            const pts: [number, number][] = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1.15; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
            return `<path d="${P(pts)}" fill="${c}"/>`;
        }
        case "ring": return `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.78}" ry="${ry * 0.78}" fill="none" stroke="${c}" stroke-width="${Math.max(2, rx * 0.42)}"/>`;
        case "heart": return `<path d="M${cx} ${cy + ry * 0.95} C${cx - rx * 1.5} ${cy - ry * 0.1} ${cx - rx * 0.9} ${cy - ry * 1.25} ${cx} ${cy - ry * 0.45} C${cx + rx * 0.9} ${cy - ry * 1.25} ${cx + rx * 1.5} ${cy - ry * 0.1} ${cx} ${cy + ry * 0.95} Z" fill="${c}"/>`;
        case "five": return [[0, 0], [-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, y]) => `<ellipse cx="${cx + x * rx}" cy="${cy + y * ry}" rx="${rx * 0.34}" ry="${ry * 0.34}" fill="${c}"/>`).join("");
        case "globe": return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/><ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.45}" ry="${ry}" fill="none" stroke="#FFFFFF" stroke-width="${Math.max(1, rx * 0.14)}" opacity="0.85"/><line x1="${cx - rx}" y1="${cy}" x2="${cx + rx}" y2="${cy}" stroke="#FFFFFF" stroke-width="${Math.max(1, rx * 0.14)}" opacity="0.85"/>`;
        case "crown": return `<path d="${P([[-1, 0.7], [-1, -0.45], [-0.5, 0.05], [0, -0.8], [0.5, 0.05], [1, -0.45], [1, 0.7]])}" fill="${c}"/>`;
        default: return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
    }
}

/** 공 그림 — 200×200, 흰 공을 비스듬히: 앞 점 하나 + 양옆 점 둘 + 위 극점 */
export function ballSvg(st: BallStyle, opts: { base?: string; defaultDot?: string; id?: string } = {}): string {
    const id = opts.id ?? "b";
    const base = opts.base ?? "#F7F4ED";
    const colorAt = (i: number) => (st.dot === "rainbow" ? RAINBOW_DOTS[i % RAINBOW_DOTS.length] : st.dot === "default" ? opts.defaultDot ?? "#C8442E" : st.dot);
    const defs: string[] = [`<clipPath id="${id}k"><circle cx="100" cy="100" r="90"/></clipPath>`,
        `<radialGradient id="${id}s" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="${st.finish === "chrome" ? 0.42 : 0.22}"/></radialGradient>`];
    const layers: string[] = [`<circle cx="100" cy="100" r="90" fill="${esc(base)}"/>`];
    const inner: string[] = [];
    if (st.finish === "carbon") {
        defs.push(`<pattern id="${id}c" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="#1C1E22" opacity="0.10"/></pattern>`);
        inner.push(`<rect width="200" height="200" fill="url(#${id}c)"/>`);
    }
    if (st.finish === "marble") for (const d of ["M10 70 C60 40 90 110 190 60", "M20 140 C70 110 120 170 190 120", "M60 10 C80 60 50 120 90 190"]) inner.push(`<path d="${d}" fill="none" stroke="#8A8F98" stroke-width="2.2" opacity="0.45"/>`);
    if (st.finish === "pearl") {
        defs.push(`<linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5C6E0" stop-opacity="0.55"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#BFD8F5" stop-opacity="0.55"/></linearGradient>`);
        inner.push(`<rect width="200" height="200" fill="url(#${id}p)"/>`);
    }
    // 점 — 앞(크게) · 왼쪽 · 오른쪽(가장자리라 납작하게) · 위 극점
    inner.push(dotShape(st.shape, 100, 112, 22, 22, colorAt(0)));
    inner.push(dotShape(st.shape, 22, 104, 7, 18, colorAt(1)));
    inner.push(dotShape(st.shape, 178, 104, 7, 18, colorAt(2)));
    inner.push(dotShape(st.shape, 100, 24, 18, 7, colorAt(3)));
    layers.push(`<g clip-path="url(#${id}k)">${inner.join("")}</g>`);
    layers.push(`<circle cx="100" cy="100" r="90" fill="url(#${id}s)"/>`);
    if (st.finish === "chrome") layers.push(`<ellipse cx="70" cy="62" rx="26" ry="14" fill="#FFFFFF" opacity="0.75" transform="rotate(-30 70 62)"/>`);
    layers.push(`<circle cx="100" cy="100" r="89.5" fill="none" stroke="#000000" stroke-opacity="0.12"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><defs>${defs.join("")}</defs>${layers.join("")}</svg>`;
}
