/**
 * 당구대 광고 그림을 올릴 꼴로(2026-10-24 — 규칙 shared/tableBrand). 골프장 로고 올리기(golf/logoUpload)와 같은 길:
 * 캔버스에 다시 그려 PNG 로만 올린다(원본의 메타 정보 · SVG 스크립트가 지나가며 사라진다). 긴 변 1024 · 투명 여백은 잘라 낸다.
 * 협찬사가 주는 그림은 바탕이 칠해진 JPG 가 많다 — '검은 바탕 지우기' · '흰 바탕 지우기'로 바탕을 투명하게 할 수 있다
 * (우리 로고를 따낸 것과 같은 식: 바탕과의 거리를 알파로, 반쯤 섞인 가장자리는 바탕을 걷어 낸 색으로).
 */
import { BRAND_MAX_BYTES, BRAND_MAX_PX } from "@shared/tableBrand";

export type BgKey = "none" | "black" | "white";
export interface BrandDraft { png: string; width: number; height: number; bytes: number }

const dataUrlBytes = (u: string) => Math.floor((u.length - u.indexOf(",") - 1) * 3 / 4);

function loadImage(blob: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("그림을 열지 못했습니다 — 다른 그림으로 해 보세요")); };
        img.src = url;
    });
}

/** 네 귀퉁이가 다 검정(또는 흰색)에 가까우면 그 바탕으로 본다 — 처음 고를 값 */
export function guessBg(d: Uint8ClampedArray, w: number, h: number): BgKey {
    const at = (x: number, y: number) => { const o = (y * w + x) * 4; return [d[o], d[o + 1], d[o + 2], d[o + 3]]; };
    const cs = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];
    if (cs.some((c) => c[3] < 250)) return "none";
    if (cs.every((c) => Math.max(c[0], c[1], c[2]) < 24)) return "black";
    if (cs.every((c) => Math.min(c[0], c[1], c[2]) > 232)) return "white";
    return "none";
}

/** 바탕을 투명하게 — 바탕과의 거리(검정이면 가장 밝은 채널, 흰색이면 가장 어두운 채널의 반대)가 작으면 투명 */
export function keyOut(d: Uint8ClampedArray, bg: BgKey): void {
    if (bg === "none") return;
    for (let i = 0; i < d.length; i += 4) {
        const dist = bg === "black" ? Math.max(d[i], d[i + 1], d[i + 2]) : 255 - Math.min(d[i], d[i + 1], d[i + 2]);
        const a = Math.max(0, Math.min(1, (dist - 3) / 14));
        if (a < 1 && a > 0) {
            for (let k = 0; k < 3; k++) {
                const v = d[i + k];
                d[i + k] = bg === "black" ? Math.min(255, v / a) : Math.max(0, 255 - (255 - v) / a);
            }
        }
        d[i + 3] = Math.round(d[i + 3] * a);
    }
}

export async function prepBrandImage(blob: Blob, bg: BgKey | "auto" = "auto"): Promise<BrandDraft & { bg: BgKey }> {
    if (!blob.size) throw new Error("빈 파일입니다");
    const { img, release } = await loadImage(blob);
    try {
        for (const max of [BRAND_MAX_PX, 768, 512]) {
            const k = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
            const w = Math.max(1, Math.round((img.naturalWidth || max) * k)), h = Math.max(1, Math.round((img.naturalHeight || max / 2) * k));
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("이 브라우저에서는 그림을 다시 그릴 수 없습니다");
            ctx.drawImage(img, 0, 0, w, h);
            const id = ctx.getImageData(0, 0, w, h);
            const key = bg === "auto" ? guessBg(id.data, w, h) : bg;
            keyOut(id.data, key);
            // 투명 여백 잘라 내기
            let x0 = w, y0 = h, x1 = -1, y1 = -1;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (id.data[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            if (x1 < 0) throw new Error("비어 있는(전부 투명한) 그림입니다");
            ctx.putImageData(id, 0, 0);
            const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
            if (cw < 32 || ch < 16) throw new Error("그림이 너무 작습니다");
            const out = document.createElement("canvas");
            out.width = cw; out.height = ch;
            out.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
            const png = out.toDataURL("image/png");
            const bytes = dataUrlBytes(png);
            if (bytes <= BRAND_MAX_BYTES) return { png, width: cw, height: ch, bytes, bg: key };
        }
        throw new Error("그림이 너무 큽니다 — 더 단순한 로고를 써 주세요");
    } finally {
        release();
    }
}
