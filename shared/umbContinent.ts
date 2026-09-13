/**
 * UMB 대회 이름 → 대륙(연맹) 묶음(2026-09-13 오너 제안 "대륙별 강세").
 * 대회 라벨에 연맹 약자가 박혀 있다: CEB(유럽) · ACBC(아시아) · CPB(미주) · AMECC(아프리카·중동).
 * 세계선수권·대륙선수권·국가선수권은 따로 센다 — 대륙으로 뭉개면 "유럽 강세" 가 틀린 말이 된다.
 */
export type Continent = "europe" | "asia" | "americas" | "africaMe" | "world" | "confederal" | "national" | "other";

/** 화면 순서이자 i18n 키. */
export const CONTINENTS: readonly Continent[] = ["europe", "asia", "americas", "africaMe", "world", "confederal", "national", "other"];

export function continentOf(label: string): Continent {
    const l = label.toUpperCase();
    if (/\bCEB\b/.test(l)) return "europe";
    if (/\bACBC\b/.test(l)) return "asia";
    if (/\bCPB\b/.test(l)) return "americas";
    if (/\bAMECC\b/.test(l)) return "africaMe";
    if (/WORLD CHAMPIONSHIP/.test(l)) return "world";
    if (/CONFEDERAL/.test(l)) return "confederal";
    if (/NATIONAL CHAMPIONSHIP/.test(l)) return "national";
    return "other";
}

/** 대회별 포인트를 대륙별로 합친다. 패널티(음수)는 빼지 않는다 — 어디서 벌었나를 보는 표다. 0 인 칸은 뺀다. */
export function pointsByContinent(
    eventPoints: Record<string, number> | null | undefined,
    labels: ReadonlyMap<string, string> | Record<string, string>,
): Array<{ continent: Continent; points: number; events: number }> {
    if (!eventPoints) return [];
    const get = (k: string) => (labels instanceof Map ? labels.get(k) : (labels as Record<string, string>)[k]) ?? "";
    const acc = new Map<Continent, { points: number; events: number }>();
    for (const [col, pts] of Object.entries(eventPoints)) {
        if (!(pts > 0)) continue;
        const c = continentOf(get(col));
        const cur = acc.get(c) ?? { points: 0, events: 0 };
        acc.set(c, { points: cur.points + pts, events: cur.events + 1 });
    }
    return CONTINENTS.filter((c) => acc.has(c)).map((c) => ({ continent: c, ...acc.get(c)! }))
        .sort((a, b) => b.points - a.points);
}
