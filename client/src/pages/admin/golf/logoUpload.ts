/**
 * 로고 그림을 올릴 꼴로 다시 그린다(2026-10-07, 어드민 '골프장 데이터' 로고 올리기 — 규칙은 shared/golfLogo.ts).
 *
 * 받은 그림(파일 · 붙여넣은 그림 · 서버가 대신 받아 준 다른 사이트의 그림)을 캔버스에 그려 PNG 로 내보낸다:
 *  - 긴 변 512 로 줄이고(작은 그림은 키우지 않는다. 벡터는 크기가 없어 512 로 그린다)
 *  - 투명 여백을 잘라 로고가 판을 채우게 하고
 *  - 흰색뿐인 로고인지 본다(흰 판에서 안 보인다 → 어두운 판에 얹는다. 사람이 바꿀 수 있다).
 * 원본 파일은 올리지 않는다 — SVG 의 스크립트, 사진의 메타 정보가 캔버스를 지나며 사라진다.
 */
import { GOLF_LOGO_MAX_BYTES, GOLF_LOGO_MAX_PX, fitLogoSize, looksLightLogo, opaqueBounds } from "@shared/golfLogo";

export interface LogoDraft {
    /** data:image/png;base64,… */
    png: string;
    width: number;
    height: number;
    bytes: number;
    /** 흰색뿐인 로고로 보인다 — 어두운 판에 얹는다 */
    light: boolean;
}

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

export async function rasterizeLogo(blob: Blob): Promise<LogoDraft> {
    if (!blob.size) throw new Error("빈 파일입니다");
    const { img, release } = await loadImage(blob);
    try {
        const vector = /svg/i.test(blob.type);
        for (const max of [GOLF_LOGO_MAX_PX, 384, 256]) {
            const size = fitLogoSize(img.naturalWidth, img.naturalHeight, max, vector);
            const canvas = document.createElement("canvas");
            canvas.width = size.w;
            canvas.height = size.h;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("이 브라우저에서는 그림을 다시 그릴 수 없습니다");
            ctx.drawImage(img, 0, 0, size.w, size.h);
            const full = ctx.getImageData(0, 0, size.w, size.h);
            const box = opaqueBounds(full.data, size.w, size.h);
            if (!box) throw new Error("비어 있는(전부 투명한) 그림입니다");
            if (box.w < 16 || box.h < 16) throw new Error("그림이 너무 작습니다 — 더 큰 로고를 써 주세요");
            const cut = ctx.getImageData(box.x, box.y, box.w, box.h);
            const out = document.createElement("canvas");
            out.width = box.w;
            out.height = box.h;
            out.getContext("2d")!.putImageData(cut, 0, 0);
            const png = out.toDataURL("image/png");
            const bytes = dataUrlBytes(png);
            if (bytes <= GOLF_LOGO_MAX_BYTES) return { png, width: box.w, height: box.h, bytes, light: looksLightLogo(cut.data) };
        }
        throw new Error("로고로 쓰기엔 너무 복잡한 그림입니다(사진처럼 보입니다)");
    } finally {
        release();
    }
}

/** 서버가 대신 받아 준 그림(base64) → Blob */
export function blobFromBase64(base64: string, mime: string): Blob {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}
