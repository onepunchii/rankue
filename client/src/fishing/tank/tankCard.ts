/**
 * 수족관 공유 카드(2026-10-16 오너가 고른 '크루원 구경 + 카드 공유') — 1080×1350 한 장.
 * 위 1080×1000 은 수족관 그대로(같은 엔진 · 장식 · 물고기), 아래 띠에 이름 · 숫자. 잡은 곳 · 날은 적지 않는다.
 */
import { DECOR, type DecorSlot, type TankFishRow } from "@shared/fishingDecor";
import { fishByName } from "@shared/fishingFish";
import { TankEngine, type TankMode } from "./engine";
import { tankRows } from "./tankData";

export const TANK_CARD_W = 1080;
export const TANK_CARD_H = 1350;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

export async function renderTankCard(o: { title: string; fish: readonly TankFishRow[]; seals: ReadonlyMap<string, string>; placed: Partial<Record<DecorSlot, string | null>>; owned: number; mode: TankMode }): Promise<HTMLCanvasElement> {
    const cv = document.createElement("canvas");
    cv.width = TANK_CARD_W; cv.height = TANK_CARD_H;
    const c = cv.getContext("2d");
    if (!c) throw new Error("tank card: 2d context unavailable");
    const night = o.mode === "night";
    const engine = new TankEngine(o.mode, "full", false);
    engine.setWorld(TANK_CARD_W);
    engine.setFish(tankRows(o.fish), o.seals, new Set());
    engine.setDecor(o.placed);
    await engine.ready();
    if (typeof document !== "undefined" && document.fonts?.ready) { try { await document.fonts.ready; } catch { /* 시스템 글꼴로 */ } }
    // 물고기가 한 번씩 꼬리를 친 모습으로
    for (let t = 16; t < 2400; t += 16) engine.step(16, t);
    engine.draw(c, TANK_CARD_W, 1000, { x: TANK_CARD_W / 2, y: 500, z: 1 }, 2400, 1, false);
    engine.destroy();
    c.setTransform(1, 0, 0, 1, 0, 0);

    // 아래 띠
    const y0 = 1000;
    c.fillStyle = night ? "#0B1E2D" : "#EFE6D2"; c.fillRect(0, y0, TANK_CARD_W, TANK_CARD_H - y0);
    c.fillStyle = night ? "#FFFFFF14" : "#0F28381F"; c.fillRect(0, y0, TANK_CARD_W, 2);
    const ink = night ? "#F3ECDD" : "#0F2838", soft = night ? "#F3ECDDB3" : "#0F2838A6";
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.font = `700 52px ${FONT}`; c.fillStyle = ink; c.fillText(o.title, 72, y0 + 104, TANK_CARD_W - 260);
    const species = o.fish.filter((f) => fishByName(f.species)).length;
    c.font = `600 32px ${FONT}`; c.fillStyle = soft;
    c.fillText(`어종 ${species} · 장식 ${o.owned}/${DECOR.length} · 낙관 ${o.seals.size}`, 72, y0 + 160);
    const names = tankRows(o.fish).slice(0, 6).map((r) => r.fish.name);
    if (names.length) { c.font = `500 28px ${FONT}`; c.fillText(names.join(" · "), 72, y0 + 214, TANK_CARD_W - 144); }
    c.font = `600 26px ${FONT}`; c.fillStyle = night ? "#F4A963" : "#9A5A1E";
    c.fillText("랭큐 낚시 · rankue.co.kr", 72, TANK_CARD_H - 56);
    // 붉은 낙관
    c.save(); c.translate(TANK_CARD_W - 150, y0 + 92); c.rotate(-0.06);
    c.fillStyle = "#C8372D"; c.fillRect(-56, -56, 112, 112);
    c.strokeStyle = "#FFF4EC"; c.lineWidth = 3; c.strokeRect(-46, -46, 92, 92);
    c.fillStyle = "#FFF4EC"; c.font = `700 34px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("수족", 0, -16); c.fillText("관", 0, 22);
    c.restore();
    return cv;
}
