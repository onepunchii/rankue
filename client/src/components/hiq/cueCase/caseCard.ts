/**
 * 큐 케이스 공유 카드(2026-10-16) — 1080×1350 그림 한 장. 큐 케이스 화면과 같은 판: 가죽 뚜껑 · 금실 바느질 · 놋쇠 명판,
 * 그 아래 남색 벨벳에 받은 큐가 한 줄씩(대표 큐가 맨 위, 많아도 일곱 자루). 글자 · 숫자는 그림에 없다 — 여기서 그린다.
 * 내보내기는 샷 카드와 같은 길(sim/share/useShare shareBlob — 네이티브 공유 → Web Share → 다운로드).
 */
import { caseImage, type CaseItem } from "@shared/cueCase";

export const CASE_CARD_W = 1080;
export const CASE_CARD_H = 1350;
const MAX_CUES = 7;

export interface CaseCardInput {
    /** 명판 글자("김랭큐님의 큐 케이스") */
    plate: string;
    /** [["큐", "18/77"], ["초크", "5/16"], ["장갑", "3/16"]] */
    counts: readonly (readonly [string, string])[];
    /** 대표 큐가 맨 앞 */
    cues: readonly CaseItem[];
    /** 큐 이름(지금 언어) */
    cueName: (x: CaseItem) => string;
    /** 큐가 일곱 자루를 넘으면 "외 n개"(마지막 줄 왼쪽) */
    more: (n: number) => string;
    footer: string;
    url: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`;

/** 카드를 그린다 — 그림을 다 불러온 뒤에 그려야 해서 비동기 */
export async function renderCaseCard(input: CaseCardInput, createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): Promise<HTMLCanvasElement> {
    const cues = input.cues.slice(0, MAX_CUES);
    const imgs = await Promise.all(cues.map((x) => loadImage(caseImage(x))));
    if (typeof document !== "undefined" && document.fonts?.ready) { try { await document.fonts.ready; } catch { /* 시스템 글꼴로 */ } }
    const cv = createCanvas();
    cv.width = CASE_CARD_W; cv.height = CASE_CARD_H;
    const c = cv.getContext("2d");
    if (!c) throw new Error("case card: 2d context unavailable");
    const W = CASE_CARD_W, H = CASE_CARD_H;

    // 가죽 바탕 · 바느질
    const leather = c.createRadialGradient(W * 0.22, 0, 40, W * 0.4, H * 0.4, H);
    leather.addColorStop(0, "#64321f"); leather.addColorStop(0.45, "#3d1b12"); leather.addColorStop(1, "#1f0d08");
    c.fillStyle = leather; c.fillRect(0, 0, W, H);
    c.save();
    c.setLineDash([14, 10]); c.lineWidth = 3; c.strokeStyle = "rgba(232,196,106,0.45)";
    rounded(c, 34, 34, W - 68, H - 68, 44); c.stroke();
    c.restore();

    // 놋쇠 명판
    c.font = font(700, 44);
    const plateW = Math.min(W - 220, c.measureText(input.plate).width + 150), plateH = 92;
    const px = (W - plateW) / 2, py = 96;
    const brass = c.createLinearGradient(0, py, 0, py + plateH);
    brass.addColorStop(0, "#f6dfa8"); brass.addColorStop(0.42, "#d6a956"); brass.addColorStop(0.58, "#b0823a"); brass.addColorStop(1, "#e2bf78");
    c.save(); c.shadowColor = "rgba(0,0,0,0.55)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
    rounded(c, px, py, plateW, plateH, 14); c.fillStyle = brass; c.fill(); c.restore();
    for (const sx of [px + 26, px + plateW - 26]) {
        const g = c.createRadialGradient(sx - 3, py + plateH / 2 - 3, 1, sx, py + plateH / 2, 9);
        g.addColorStop(0, "#fff3cf"); g.addColorStop(0.55, "#b48a45"); g.addColorStop(1, "#6b4a1c");
        c.beginPath(); c.arc(sx, py + plateH / 2, 9, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    }
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "rgba(255,244,214,0.65)"; c.fillText(input.plate, W / 2, py + plateH / 2 + 3, plateW - 110);
    c.fillStyle = "#3a230f"; c.fillText(input.plate, W / 2, py + plateH / 2 + 1, plateW - 110);

    // 모은 수
    const cy = 268, colW = (W - 200) / input.counts.length;
    input.counts.forEach(([label, value], i) => {
        const x = 100 + colW * i + colW / 2;
        c.font = font(600, 30); c.fillStyle = "rgba(232,196,106,0.92)"; c.fillText(label, x, cy);
        c.font = font(700, 64); c.fillStyle = "#ffffff"; c.fillText(value, x, cy + 66);
    });

    // 벨벳 판과 큐 자리
    const vx = 80, vy = 410, vw = W - 160, vh = 760;
    const velvet = c.createRadialGradient(W / 2, vy, 40, W / 2, vy + vh / 2, vh);
    velvet.addColorStop(0, "#17233a"); velvet.addColorStop(0.5, "#0d1626"); velvet.addColorStop(1, "#080e19");
    rounded(c, vx, vy, vw, vh, 40); c.fillStyle = velvet; c.fill();
    const rowH = Math.min(101, (vh - 50) / Math.max(cues.length, 5));
    const top = vy + 34;
    cues.forEach((x, i) => {
        const y = top + i * rowH;
        const sx = vx + 30, sw = vw - 60, sh = rowH - 30;
        const slot = c.createLinearGradient(0, y, 0, y + sh);
        slot.addColorStop(0, "#050a13"); slot.addColorStop(0.7, "#0c1626"); slot.addColorStop(1, "#111e33");
        rounded(c, sx, y, sw, sh, sh / 2); c.fillStyle = slot; c.fill();
        const img = imgs[i];
        if (img) {
            // 자리보다 그림이 크지 않게 — 높이를 자리에 맞추고 가로는 비율대로(가운데)
            const ih = Math.min(sh - 8, (sw - 40) * 80 / 1000), iw = ih * 1000 / 80;
            c.save(); c.shadowColor = "rgba(0,0,0,0.7)"; c.shadowBlur = 8; c.shadowOffsetY = 4;
            c.drawImage(img, sx + (sw - iw) / 2, y + (sh - ih) / 2, iw, ih); c.restore();
        }
        c.textAlign = i === 0 ? "left" : "right"; c.textBaseline = "alphabetic";
        c.font = font(i === 0 ? 700 : 600, i === 0 ? 26 : 22);
        c.fillStyle = i === 0 ? "#e8c46a" : "rgba(244,234,214,0.6)";
        c.fillText(input.cueName(x), i === 0 ? sx + 14 : sx + sw - 14, y + sh + 22);
    });
    if (input.cues.length > MAX_CUES && cues.length > 1) {
        // 마지막 줄의 이름은 오른쪽에 있다 — 남은 수는 같은 줄 왼쪽에
        const y = top + (cues.length - 1) * rowH + (rowH - 30) + 22;
        c.textAlign = "left"; c.textBaseline = "alphabetic"; c.font = font(600, 22); c.fillStyle = "rgba(232,196,106,0.85)";
        c.fillText(input.more(input.cues.length - MAX_CUES), vx + 44, y);
    }

    // 바닥 글
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.font = font(700, 34); c.fillStyle = "#f4ead6"; c.fillText(input.footer, W / 2, H - 112);
    c.font = font(500, 26); c.fillStyle = "rgba(232,196,106,0.85)"; c.fillText(input.url, W / 2, H - 70);
    return cv;
}
