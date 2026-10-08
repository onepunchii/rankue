/**
 * 로고의 여백 잘라 내기(2026-10-08) — 골프장 카드(로고 판)에서 로고를 크게 보이려고.
 *
 * 운영 로고에는 여백이 큰 것이 많다(설해원: 그림은 가운데 작게, 둘레가 전부 흰색). 판에 그대로 올리면 로고가 점처럼 보인다 —
 * 예전 카드의 "흰 네모 안에 작은 얼룩"이 그것이다. 잉크(투명하지 않고, 흰 판에 놓을 것은 거의 흰색이 아닌 픽셀)의 경계만 남긴다.
 *
 * 서버에 그림 라이브러리(sharp·pngjs)가 없다 — **카드 엔진(resvg)으로 한다**: PNG 를 SVG 의 <image> 로 감싸 그리면 픽셀을 준다.
 * 경계를 재고, viewBox 를 그 경계로 잡아 한 번 더 그리면 잘린 PNG 가 나온다. 새 의존성이 없다(번들에 wasm·바이너리를 더하지 않는다).
 * 실패하면(깨진 PNG·너무 큰 그림) null — 부르는 쪽이 로고 없이 그린다.
 */
import { engines } from "../services/playerCard.js";

export interface TrimmedLogo { uri: string; width: number; height: number }

/** 한 변이 이보다 크면 재지 않는다(메모리) */
const MAX_SIDE = 2048;
/** 잉크로 치는 알파의 문턱 */
const ALPHA_MIN = 24;
/** 이보다 밝으면 흰색으로 본다(흰 판에 놓을 로고) */
const WHITE_MIN = 244;

/** PNG 의 가로·세로(IHDR). PNG 가 아니면 null */
export function pngSize(buf: Uint8Array): { w: number; h: number } | null {
    if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const w = view.getUint32(16), h = view.getUint32(20);
    return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * RGBA 픽셀에서 잉크의 경계 상자. skipWhite = 거의 흰 픽셀은 잉크가 아니다(흰 판에 놓을 로고의 흰 바탕).
 * 잉크가 없으면(통째로 투명·통째로 흰색) null.
 */
export function inkBounds(px: Uint8Array, w: number, h: number, skipWhite: boolean): { x: number; y: number; w: number; h: number } | null {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (px[i + 3] <= ALPHA_MIN) continue;
            if (skipWhite && px[i] > WHITE_MIN && px[i + 1] > WHITE_MIN && px[i + 2] > WHITE_MIN) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 여백을 잘라 낸 로고. light = 흰색뿐인 로고(-light.png) — 어두운 판에 놓을 것이라 흰색도 잉크다.
 */
export async function trimLogo(png: Uint8Array, light = false): Promise<TrimmedLogo | null> {
    try {
        const size = pngSize(png);
        if (!size || size.w > MAX_SIDE || size.h > MAX_SIDE) return null;
        const { Resvg } = await engines();
        const href = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
        const full = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}"><image href="${href}" width="${size.w}" height="${size.h}"/></svg>`).render();
        const b = inkBounds(full.pixels, full.width, full.height, !light);
        if (!b || b.w < 4 || b.h < 4) return null;
        const cut = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}"><image href="${href}" width="${size.w}" height="${size.h}"/></svg>`).render();
        return { uri: `data:image/png;base64,${cut.asPng().toString("base64")}`, width: b.w, height: b.h };
    } catch (e) {
        console.warn("[logoTrim] 실패:", String((e as Error)?.message ?? e).slice(0, 120));
        return null;
    }
}
