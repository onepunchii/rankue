/**
 * 친구 초대 카드(2026-10-16 오너: "해당 큐대로 친구초대 하기 버튼") — 1080×1350 한 장. 카톡 · 문자에 그림과 링크가 함께 간다.
 * 위: 핫핑크 만화 바탕(물방울 점 · 별 터짐) 위에 "OO님이 랭큐로 초대했어요". 가운데: 벨벳 자리에 초대한 사람의 대표 큐(없으면 말랑 큐볼).
 * 아래: 환영 초크 캐릭터 · 초대 코드 · 주소. 글자는 여기서 그린다(그림에는 글자가 없다).
 */
import { caseImage, caseItem } from "@shared/cueCase";

export const INVITE_CARD_W = 1080;
export const INVITE_CARD_H = 1350;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const font = (w: number, px: number) => `${w} ${px}px ${FONT}`;

function load(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => { const im = new Image(); im.decoding = "async"; im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; });
}
function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export async function renderInviteCard(o: { title: string; sub: string; codeLabel: string; code: string; url: string; hero: string | null; gift: string }): Promise<HTMLCanvasElement> {
    const heroItem = (o.hero ? caseItem(o.hero) : null) ?? caseItem("cue-lt-inv-jelly");
    const [cue, chalk] = await Promise.all([heroItem ? load(caseImage(heroItem)) : Promise.resolve(null), load(caseImage(caseItem("chalk-welcome")!))]);
    if (typeof document !== "undefined" && document.fonts?.ready) { try { await document.fonts.ready; } catch { /* 시스템 글꼴로 */ } }
    const cv = document.createElement("canvas");
    cv.width = INVITE_CARD_W; cv.height = INVITE_CARD_H;
    const c = cv.getContext("2d");
    if (!c) throw new Error("invite card: 2d context unavailable");
    const W = INVITE_CARD_W, H = INVITE_CARD_H;

    // 핫핑크 바탕 · 물방울 점(만화의 망점)
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#FF4FA3"); bg.addColorStop(0.55, "#FF2E8A"); bg.addColorStop(1, "#C2187A");
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,255,255,0.12)";
    for (let y = 0; y < H; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W; x += 36) { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
    // 별 터짐(제목 뒤)
    c.save(); c.translate(W / 2, 250);
    c.fillStyle = "#FFE14D"; c.strokeStyle = "#1A0B14"; c.lineWidth = 8; c.lineJoin = "round";
    c.beginPath();
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 300 : 360; const x = Math.cos(a) * r * 1.35, y = Math.sin(a) * r * 0.55; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath(); c.fill(); c.stroke(); c.restore();

    // 제목 — 두꺼운 외곽선 글자
    c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    const title = o.title;
    c.font = font(800, title.length > 14 ? 60 : 72);
    c.lineWidth = 14; c.strokeStyle = "#1A0B14"; c.strokeText(title, W / 2, 230, W - 160);
    c.fillStyle = "#FFFFFF"; c.fillText(title, W / 2, 230, W - 160);
    c.font = font(700, 34); c.fillStyle = "#1A0B14"; c.fillText(o.sub, W / 2, 312, W - 200);

    // 벨벳 자리 + 큐
    const vy = 470, vh = 210;
    c.save(); rounded(c, 60, vy, W - 120, vh, 105); c.fillStyle = "#14102A"; c.fill(); c.lineWidth = 8; c.strokeStyle = "#1A0B14"; c.stroke(); c.restore();
    const slot = c.createLinearGradient(0, vy + 40, 0, vy + vh - 40);
    slot.addColorStop(0, "#07050F"); slot.addColorStop(1, "#231B45");
    rounded(c, 100, vy + 52, W - 200, vh - 104, (vh - 104) / 2); c.fillStyle = slot; c.fill();
    if (cue) {
        const iw = W - 240, ih = iw * 80 / 1000;
        c.save(); c.shadowColor = "rgba(0,0,0,0.6)"; c.shadowBlur = 14; c.shadowOffsetY = 6;
        c.drawImage(cue, 120, vy + vh / 2 - ih / 2, iw, ih); c.restore();
    }

    // 환영 초크 + 코드
    if (chalk) { c.save(); c.translate(250, 930); c.rotate(-0.08); c.drawImage(chalk, -170, -170, 340, 340); c.restore(); }
    c.save(); c.translate(250, 1125); c.rotate(-0.04);
    c.font = font(800, 34); const gw = c.measureText(o.gift).width + 48;
    rounded(c, -gw / 2, -32, gw, 64, 32); c.fillStyle = "#FFFFFF"; c.fill(); c.lineWidth = 6; c.strokeStyle = "#1A0B14"; c.stroke();
    c.fillStyle = "#1A0B14"; c.fillText(o.gift, 0, 2); c.restore();

    const bx = 470, by = 800, bw = W - bx - 70, bh = 300;
    c.save(); rounded(c, bx, by, bw, bh, 36); c.fillStyle = "#FFFFFF"; c.fill(); c.lineWidth = 8; c.strokeStyle = "#1A0B14"; c.stroke(); c.restore();
    c.font = font(700, 32); c.fillStyle = "#C2187A"; c.fillText(o.codeLabel, bx + bw / 2, by + 70);
    c.font = font(800, 96); c.fillStyle = "#1A0B14"; c.fillText(o.code.split("").join(" "), bx + bw / 2, by + 165, bw - 40);
    c.font = font(600, 28); c.fillStyle = "#5A2A46"; c.fillText(o.url.replace(/^https?:\/\//, ""), bx + bw / 2, by + 245, bw - 40);

    c.font = font(800, 40); c.fillStyle = "#FFFFFF"; c.fillText("RANKUE", W / 2, H - 70);
    return cv;
}
