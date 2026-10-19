/**
 * 지도 번호표 비켜 놓기(2026-10-19) — 좁은 폰에서 유럽 대회(포르투 · 그라디냥 · 블루아 · 리르)가 몇 px 안에 몰려
 * 14px 묶음으로는 '6·8·9'가 포르투 자리에 붙는 식으로 다른 도시까지 한 표가 됐다.
 * 이제 같은 도시(몇 px)만 한 표로 묶고, 겹치는 표는 서로 밀어내되 제자리로 당기는 힘을 둔다 — 밀려난 표는 화면이 제자리 점까지 가는 선을 긋는다.
 * 결정적(같은 입력 → 같은 자리)이라 화면이 다시 그려져도 표가 흔들리지 않는다.
 */
export interface PinBox { x: number; y: number; w: number; h: number }

const overlap = (a: PinBox, b: PinBox, gap: number) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

/** 표 자리를 고른다 — 판(width × height) 밖으로 나가지 않고, 표끼리 gap 만큼 띄운다(못 띄우면 덜 겹치게라도) */
export function relaxPins(pins: readonly PinBox[], width: number, height: number, gap = 2, rounds = 160): { x: number; y: number }[] {
    const p = pins.map((q) => ({ ...q }));
    const clamp = (q: PinBox) => {
        q.x = Math.min(width - q.w / 2 - 1, Math.max(q.w / 2 + 1, q.x));
        q.y = Math.min(height - q.h / 2 - 1, Math.max(q.h / 2 + 1, q.y));
    };
    p.forEach(clamp);
    for (let r = 0; r < rounds; r++) {
        let moved = false;
        for (let i = 0; i < p.length; i++) {
            for (let j = i + 1; j < p.length; j++) {
                const a = p[i], b = p[j];
                if (!overlap(a, b, gap)) continue;
                moved = true;
                // 겹친 만큼을 가로 · 세로 중 덜 미는 쪽으로 나눠 민다(같은 자리면 i 는 위, j 는 아래)
                const ox = (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x);
                const oy = (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y);
                if (ox < oy && a.x !== b.x) {
                    const s = a.x < b.x ? -1 : 1;
                    a.x += (s * ox) / 2; b.x -= (s * ox) / 2;
                } else {
                    const s = a.y < b.y || (a.y === b.y && i < j) ? -1 : 1;
                    a.y += (s * oy) / 2; b.y -= (s * oy) / 2;
                }
                clamp(a); clamp(b);
            }
        }
        // 제자리로 살짝 — 겹치지 않을 때만(겹침 풀기가 먼저)
        for (let i = 0; i < p.length; i++) {
            const q = p[i], o = pins[i];
            const tx = q.x + (o.x - q.x) * 0.08, ty = q.y + (o.y - q.y) * 0.08;
            const trial = { ...q, x: tx, y: ty };
            if (!p.some((z, k) => k !== i && overlap(trial, z, gap))) { q.x = tx; q.y = ty; clamp(q); }
        }
        if (!moved && r > 8) break;
    }
    return p.map(({ x, y }) => ({ x, y }));
}
