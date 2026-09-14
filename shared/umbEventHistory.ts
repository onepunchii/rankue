/**
 * 대회 이력 표(2026-09-13 오너 제안 4번, 9/14 구현) — "같은 대회의 연도별 포인트, 전년 대비".
 *
 * UMB 랭킹은 회차(주간)마다 선수의 대회별 포인트(eventPoints: 열 키 → 점수)와 열 키의 라벨(umb_events)을 따로 둔다.
 * 같은 대회는 매년 열리고 약 13개월 뒤 점수가 빠지므로, 회차를 거슬러 **같은 대회(종류+도시)** 끼리 연도별로 묶으면
 * "월드컵 Antwerp: 2024 40점 → 2025 64점 ▲24" 가 나온다. 새 수집 없이 이미 저장된 회차만으로 계산한다.
 *
 * 묶는 키: 월드컵은 종류+도시(주최 연맹은 도시에 따라오므로 생략), 세계선수권은 종류 하나(도시는 해마다 바뀐다),
 * 대륙·국가선수권은 종류 하나. 연도: 대회일의 연도, 선수권류는 라벨에 적힌 마지막 연도, 없으면 회차 연도.
 * 같은 (키, 연도)가 여러 회차에 보이면 점수는 최대값(라벨 표기가 회차마다 조금 달라도 점수는 한 번 준 값), 라벨은 최신.
 */
import { parseEventLabel, type EventKind } from "./umbEventLabel.js";
import { eventDateOf } from "./umbExpiry.js";

export interface EventYearCell {
    readonly year: string;
    readonly points: number;
    /** 대회일 ISO — 선수권류는 null */
    readonly date: string | null;
    readonly label: string;
}

export interface EventHistoryRow {
    readonly key: string;
    readonly kind: EventKind;
    readonly org: string | null;
    readonly city: string | null;
    readonly country: string | null;
    /** 대표 라벨(최신 연도) — 화면이 파싱해 제목·이모지를 만든다 */
    readonly label: string;
    /** 연도 오름차순 */
    readonly cells: EventYearCell[];
    /** 가장 최근 연도 점수 */
    readonly latest: number;
    /** 직전 연도 대비(같은 대회에 두 해 이상 있을 때만) */
    readonly delta: number | null;
}

export interface EventHistory {
    /** 표의 열 — 오름차순, 최근 MAX_YEARS 개 */
    readonly years: string[];
    /** 최신 연도 점수 내림차순 */
    readonly rows: EventHistoryRow[];
    /** 최신 연도 점수가 가장 큰 대회의 key */
    readonly strongest: string | null;
    /** 전년 대비 가장 많이 오른 대회의 key(상승이 있을 때만) */
    readonly mostImproved: string | null;
}

export interface EditionEvents {
    readonly edition: string;
    readonly editionDate: Date | string;
    readonly eventPoints: Record<string, number> | null;
}

const MAX_YEARS = 4;

export function eventKeyOf(label: string): string {
    const p = parseEventLabel(label);
    switch (p.kind) {
        case "worldcup": return `worldcup:${(p.city ?? "").toLowerCase()}`;
        case "worldchamp": return "worldchamp";
        case "confederal": return "confederal";
        case "national": return "national";
        default: return `other:${label.replace(/\d{4}(-\d{2}-\d{2})?/g, "").replace(/\s+/g, " ").trim().toLowerCase()}`;
    }
}

export function eventYearOf(label: string, editionDate: Date | string): string {
    const p = parseEventLabel(label);
    if (p.date) return p.date.slice(0, 4);
    // 대륙·국가선수권 "2024 / 2025 / 2026" 은 그 회차에 합산된 시즌들 — 마지막 연도를 열로 쓴다("2024/26" 같은 별도 열을 만들지 않는다)
    if (p.season) { const ys = label.match(/\d{4}/g)!; return ys[ys.length - 1]; }
    const d = eventDateOf(label);
    if (d) return String(d.getUTCFullYear());
    const m = label.match(/\d{4}/);
    if (m) return m[0];
    return String(new Date(editionDate).getUTCFullYear());
}

/** 연도 열 정렬 — "2024" < "2024/25" < "2025" 가 되도록 앞 4자리로 비교, 같으면 문자열 */
function compareYear(a: string, b: string): number {
    const ya = Number(a.slice(0, 4)), yb = Number(b.slice(0, 4));
    return ya !== yb ? ya - yb : a.localeCompare(b);
}

export function buildEventHistory(
    editions: readonly EditionEvents[],
    labelsByEdition: ReadonlyMap<string, ReadonlyMap<string, string>>,
): EventHistory {
    // (키, 연도) → 셀
    const cells = new Map<string, Map<string, EventYearCell>>();
    const meta = new Map<string, { kind: EventKind; org: string | null; city: string | null; country: string | null; label: string; labelYear: string }>();

    for (const ed of editions) {
        if (!ed.eventPoints) continue;
        const labels = labelsByEdition.get(ed.edition);
        if (!labels) continue;
        for (const [colKey, pts] of Object.entries(ed.eventPoints)) {
            if (!(pts > 0)) continue;
            const label = labels.get(colKey);
            if (!label) continue;
            const key = eventKeyOf(label);
            const year = eventYearOf(label, ed.editionDate);
            const p = parseEventLabel(label);
            const byYear = cells.get(key) ?? new Map<string, EventYearCell>();
            const prev = byYear.get(year);
            if (!prev || pts > prev.points) byYear.set(year, { year, points: pts, date: p.date, label });
            cells.set(key, byYear);
            const m = meta.get(key);
            if (!m || compareYear(year, m.labelYear) >= 0) meta.set(key, { kind: p.kind, org: p.org, city: p.city, country: p.country, label, labelYear: year });
        }
    }

    const allYears = new Set<string>();
    for (const byYear of cells.values()) for (const y of byYear.keys()) allYears.add(y);
    const years = [...allYears].sort(compareYear).slice(-MAX_YEARS);
    const yearSet = new Set(years);

    const rows: EventHistoryRow[] = [];
    for (const [key, byYear] of cells) {
        const kept = [...byYear.values()].filter((c) => yearSet.has(c.year)).sort((a, b) => compareYear(a.year, b.year));
        if (!kept.length) continue;
        const m = meta.get(key)!;
        const last = kept[kept.length - 1];
        const before = kept.length >= 2 ? kept[kept.length - 2] : null;
        rows.push({
            key, kind: m.kind, org: m.org, city: m.city, country: m.country, label: m.label,
            cells: kept, latest: last.points, delta: before ? last.points - before.points : null,
        });
    }
    rows.sort((a, b) => b.latest - a.latest || b.cells.length - a.cells.length || a.key.localeCompare(b.key));

    const strongest = rows[0]?.key ?? null;
    const improved = rows.filter((r) => (r.delta ?? 0) > 0).sort((a, b) => b.delta! - a.delta!)[0];
    return { years, rows, strongest, mostImproved: improved?.key ?? null };
}
