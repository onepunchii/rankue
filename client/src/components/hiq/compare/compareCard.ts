/**
 * "나 vs 선수" 공유 카드(2026-09-27) — 정사각형 1080×1080 PNG 를 **화면에서** 캔버스로 그린다.
 * 서버 선수 카드(/og/…)와 달리 내 기록이 들어가 사람마다 다르고 저장할 필요가 없다 — 그래서 서버를 거치지 않는다.
 * 디자인은 선수 카드와 같은 언어: 당구대 펠트(딥 그린) 위 흰 카드 한 장, 큰 숫자 하나 + 막대 3줄.
 * 색은 실제 물건 색(펠트·금)이라 테마 토큰이 아니다(카드는 앱 밖으로 나간다).
 */
export interface CompareCardInput {
    title: string;           // "나 vs 강민재"
    meLabel: string;         // "나" / 회원 이름
    proLabel: string;        // "강민재"
    heroValue: string;       // "51%"
    heroLabel: string;       // "강민재 선수 대비 에버리지"
    sub: string;             // "랭큐 회원 상위 30% · 이 선수까지 +0.770"
    rows: { label: string; me: number | null; pro: number | null; fmt: (v: number) => string }[];
    footer: string;          // "rankue.co.kr · 랭큐에서 나와 비교해 보세요"
}

const W = 1080;
const FELT_A = "#127a4f", FELT_B = "#094a2f";
const GOLD = "#F5B721", GREEN = "#006241", INK = "rgba(0,0,0,.87)", INK3 = "rgba(0,0,0,.5)", TRACK = "rgba(0,0,0,.07)";
const FONT = `"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
}

export async function drawCompareCard(input: CompareCardInput): Promise<Blob> {
    try { await (document as any).fonts?.ready; } catch { /* 폰트 준비를 못 기다려도 그린다 */ }
    const c = document.createElement("canvas");
    c.width = W; c.height = W;
    const ctx = c.getContext("2d")!;

    // 펠트 배경 + 가는 점무늬
    const g = ctx.createRadialGradient(W * 0.3, W * 0.25, 60, W * 0.5, W * 0.5, W * 0.85);
    g.addColorStop(0, FELT_A); g.addColorStop(1, FELT_B);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = "rgba(255,255,255,.06)";
    for (let y = 18; y < W; y += 36) for (let x = 18; x < W; x += 36) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }

    // 흰 카드
    const PAD = 64, CX = PAD, CY = PAD, CW = W - PAD * 2, CH = W - PAD * 2 - 56;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    roundRect(ctx, CX, CY, CW, CH, 40); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();

    const L = CX + 64, R = CX + CW - 64;
    ctx.textBaseline = "alphabetic";
    // 머리
    ctx.fillStyle = GREEN; ctx.font = `700 34px ${FONT}`;
    ctx.fillText("RANKUE", L, CY + 92);
    ctx.fillStyle = INK; ctx.font = `800 64px ${FONT}`;
    ctx.fillText(fitText(ctx, input.title, R - L), L, CY + 178);

    // 큰 숫자
    ctx.fillStyle = GREEN; ctx.font = `800 150px ${FONT}`;
    ctx.fillText(input.heroValue, L - 4, CY + 350);
    const heroW = ctx.measureText(input.heroValue).width;
    ctx.fillStyle = INK3; ctx.font = `600 32px ${FONT}`;
    ctx.fillText(fitText(ctx, input.heroLabel, R - L - heroW - 28), L + heroW + 24, CY + 350);
    ctx.fillStyle = INK; ctx.font = `600 34px ${FONT}`;
    ctx.fillText(fitText(ctx, input.sub, R - L), L, CY + 412);

    // 막대 3줄 — 줄마다 두 막대(나 = 금, 선수 = 초록), 같은 줄의 큰 값이 100%
    let y = CY + 488;
    const labelW = 150, valueW = 120, barX = L + labelW, barW = R - L - labelW - valueW;
    for (const row of input.rows) {
        const max = Math.max(row.me ?? 0, row.pro ?? 0) || 1;
        ctx.fillStyle = INK3; ctx.font = `700 28px ${FONT}`;
        ctx.fillText(row.label, L, y);
        const pairs: [string, number | null, string][] = [[input.meLabel, row.me, GOLD], [input.proLabel, row.pro, GREEN]];
        pairs.forEach(([who, v, color], i) => {
            const by = y + 20 + i * 44;
            ctx.fillStyle = color === GOLD ? "#8a6a0a" : GREEN; ctx.font = `700 24px ${FONT}`;
            ctx.fillText(fitText(ctx, who, labelW - 20), L, by + 22);
            roundRect(ctx, barX, by, barW, 24, 12); ctx.fillStyle = TRACK; ctx.fill();
            if (v != null && v > 0) { roundRect(ctx, barX, by, Math.max(24, (v / max) * barW), 24, 12); ctx.fillStyle = color; ctx.fill(); }
            ctx.fillStyle = INK; ctx.font = `800 28px ${FONT}`;
            const txt = v != null ? row.fmt(v) : "—";
            ctx.fillText(txt, R - ctx.measureText(txt).width, by + 23);
        });
        y += 136;
    }

    // 바닥글(카드 밖, 펠트 위)
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = `700 30px ${FONT}`;
    const f = fitText(ctx, input.footer, W - PAD * 2);
    ctx.fillText(f, (W - ctx.measureText(f).width) / 2, W - 44);

    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
