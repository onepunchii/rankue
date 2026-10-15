export const TANK_MAX = 12;

export interface TankFish {
    species: string;
    count: number;
    color: string;
    fin: string;
    size: number;
    length: number;
    depth: number;
    speed: number;
    phase: number;
    rangeX: number;
    y: number;
    z: number;
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

export function aquariumFish(list: readonly { species: string; count: number }[]): TankFish[] {
    const by = new Map<string, number>();
    for (const c of list) {
        const name = c.species.trim();
        if (name) by.set(name, (by.get(name) ?? 0) + Math.max(1, c.count || 1));
    }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TANK_MAX);
    const most = top[0]?.[1] ?? 1;
    return top.map(([species, count], i) => {
        const h = hash(species);
        const hue = h % 360;
        const r = (k: number) => ((h >>> k) & 255) / 255;
        return {
            species, count,
            color: `hsl(${hue}, 55%, 58%)`,
            fin: `hsl(${(hue + 25) % 360}, 60%, 42%)`,
            size: 0.55 + 0.6 * Math.sqrt(count / most),
            length: 0.85 + 0.4 * r(3),
            depth: 0.8 + 0.5 * r(11),
            speed: 0.25 + 0.35 * r(7),
            phase: r(17) * Math.PI * 2,
            rangeX: 2.2 + 1.6 * r(5),
            y: -1.5 + ((i * 0.61) % 1) * 3.2,
            z: -1.5 + r(21) * 2.5,
        };
    });
}
