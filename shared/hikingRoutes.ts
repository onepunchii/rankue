/**
 * 등산로 조각을 이어 '코스'를 만든다(2026-10-13).
 *
 * 옛 묶음(한국등산트레킹지원센터 '전국 주요 봉우리 코스')의 GPX 파일 하나는 코스 하나가 아니라 **그 봉우리의 등산로 그물**이다 —
 * 갈림길마다 끊은 조각(trk)이 여럿 들어 있다(객산 17조각). 그것을 한 줄로 이어 붙여 코스 하나로 실었더니 조각 사이를 직선으로 건너뛴 거리까지
 * 길이에 들어가 292m 산의 코스가 29.6km 가 됐다(코스 6,077개 가운데 2,016개 · 산 1,869곳).
 *
 * 여기서는 조각의 끝점이 서로 가까우면(JOIN_M) 같은 갈림길로 보고 그물을 만든 뒤:
 *   · 정상이 그물 위에 있으면(SUMMIT_ON_M 안) — 막다른 끝(들머리)마다 **정상까지 가장 짧은 길**을 코스로 삼는다(들머리 → 정상).
 *     거의 겹치는 길(짧은 가지에서 시작해 곧 본길에 붙는 길)은 하나만 남긴다.
 *   · 정상이 그물 위에 없으면 — 이어진 덩어리마다 끝에서 끝까지 가장 긴 길 하나(낮은 쪽에서 시작).
 * 조각이 하나뿐인 파일은 그대로 한 코스다.
 * 실측(2026-10-13): 조각의 끝 81% 가 다른 조각의 끝과 30m 안에서 닿고, 조각의 가운데에 닿는 끝은 0.7% 다 — 가운데 닿음은 다루지 않는다.
 * 순수 함수(파일 · DB 를 모른다). 점은 [위도, 경도, 높이].
 */
import { distM } from "./hikingGeo.js";

export type RoutePoint = readonly [lat: number, lng: number, ele: number];
/** 조각의 끝점이 이 안이면 같은 갈림길 */
export const JOIN_M = 30;
/** 정상이 그물의 점에서 이 안이면 그물이 정상을 지난다 */
export const SUMMIT_ON_M = 150;
/** 이미 고른 길과 겹치지 않는 부분이 이보다 짧으면(그리고 제 길이의 10% 에도 못 미치면) 같은 길로 본다 */
export const UNIQUE_MIN_M = 300;
/** 한 파일에서 만드는 코스의 수 */
export const MAX_ROUTES = 8;
/** 이보다 짧은 길은 코스로 삼지 않는다 */
export const ROUTE_MIN_M = 200;

export interface BuiltRoutes {
    /** summit: 들머리 → 정상 · span: 덩어리의 끝에서 끝 · single: 조각 하나 그대로 */
    kind: "summit" | "span" | "single";
    routes: RoutePoint[][];
}

const lenM = (s: readonly RoutePoint[]) => { let m = 0; for (let i = 1; i < s.length; i++) m += distM(s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]); return m; };

interface Edge { a: number; b: number; len: number; pts: readonly RoutePoint[] }

/** 끝점을 묶어 그물을 만든다 — 마디 번호와 줄 */
function graph(segs: readonly (readonly RoutePoint[])[]): { edges: Edge[]; nodes: number; adj: { e: number; to: number }[][] } {
    const ends: RoutePoint[] = [];
    for (const s of segs) { ends.push(s[0], s[s.length - 1]); }
    const parent = ends.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
        // 위도 차가 크면 재지도 않는다(1도 ≈ 111km)
        if (Math.abs(ends[i][0] - ends[j][0]) > 0.001) continue;
        if (distM(ends[i][0], ends[i][1], ends[j][0], ends[j][1]) <= JOIN_M) parent[find(i)] = find(j);
    }
    const id = new Map<number, number>();
    const node = (x: number) => { const r = find(x); let n = id.get(r); if (n == null) { n = id.size; id.set(r, n); } return n; };
    const edges: Edge[] = segs.map((s, k) => ({ a: node(k * 2), b: node(k * 2 + 1), len: lenM(s), pts: s }));
    const adj: { e: number; to: number }[][] = Array.from({ length: id.size }, () => []);
    edges.forEach((e, k) => { adj[e.a].push({ e: k, to: e.b }); if (e.b !== e.a) adj[e.b].push({ e: k, to: e.a }); });
    return { edges, nodes: id.size, adj };
}

/** 한 마디에서 모든 마디까지 가장 짧은 거리와 온 길 */
function dijkstra(adj: { e: number; to: number }[][], edges: Edge[], from: number): { dist: number[]; via: number[] } {
    const dist = adj.map(() => Infinity), via = adj.map(() => -1), done = adj.map(() => false);
    dist[from] = 0;
    for (;;) {
        let u = -1;
        for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0) break;
        done[u] = true;
        for (const { e, to } of adj[u]) { const d = dist[u] + edges[e].len; if (d < dist[to]) { dist[to] = d; via[to] = e; } }
    }
    return { dist, via };
}

/** from 에서 시작해 온 길(via)을 거슬러 뿌리까지 — 줄의 번호들과 이어 붙인 점(from → 뿌리) */
function walk(edges: Edge[], via: number[], from: number): { used: number[]; pts: RoutePoint[] } {
    const used: number[] = [], pts: RoutePoint[] = [];
    let at = from;
    for (let guard = 0; via[at] >= 0 && guard < edges.length + 1; guard++) {
        const e = edges[via[at]];
        const forward = e.a === at;
        const seg = forward ? e.pts : [...e.pts].reverse();
        // 이음매의 점은 한 번만
        for (let i = pts.length ? 1 : 0; i < seg.length; i++) pts.push(seg[i]);
        used.push(via[at]);
        at = forward ? e.b : e.a;
    }
    return { used, pts };
}

export function buildRoutes(input: readonly (readonly RoutePoint[])[], summit: { lat: number; lng: number } | null): BuiltRoutes {
    let segs = input.filter((s) => s.length >= 2);
    if (segs.length <= 1) return { kind: "single", routes: segs.map((s) => [...s]) };

    // 정상에 가장 가까운 점 — 조각의 가운데면 그 자리에서 조각을 둘로 나눈다(정상이 마디가 된다)
    let summitAt: RoutePoint | null = null;
    if (summit) {
        let best = Infinity, bs = -1, bi = -1;
        segs.forEach((s, k) => s.forEach((p, i) => { const d = distM(p[0], p[1], summit.lat, summit.lng); if (d < best) { best = d; bs = k; bi = i; } }));
        if (best <= SUMMIT_ON_M) {
            const s = segs[bs];
            summitAt = s[bi];
            if (bi > 0 && bi < s.length - 1) segs = [...segs.slice(0, bs), s.slice(0, bi + 1), s.slice(bi), ...segs.slice(bs + 1)];
        }
    }
    const { edges, nodes, adj } = graph(segs);

    if (summitAt) {
        const top = summitAt;
        // 정상의 마디 — 그 점을 끝으로 가진 줄의 마디
        let root = -1;
        for (const e of edges) {
            if (e.pts[0] === top) { root = e.a; break; }
            if (e.pts[e.pts.length - 1] === top) { root = e.b; break; }
        }
        if (root >= 0) {
            const { dist, via } = dijkstra(adj, edges, root);
            const heads = Array.from({ length: nodes }, (_, n) => n).filter((n) => n !== root && adj[n].length === 1 && dist[n] < Infinity && dist[n] >= ROUTE_MIN_M);
            const cand = heads.map((n) => ({ ...walk(edges, via, n), len: dist[n] })).sort((x, y) => y.len - x.len);
            const taken = new Set<number>();
            const kept: { pts: RoutePoint[]; len: number; unique: number }[] = [];
            for (const c of cand) {
                const unique = c.used.filter((e) => !taken.has(e)).reduce((m, e) => m + edges[e].len, 0);
                if (kept.length && unique < Math.max(UNIQUE_MIN_M, c.len * 0.1)) continue;
                c.used.forEach((e) => taken.add(e));
                kept.push({ pts: c.pts, len: c.len, unique });
            }
            if (kept.length) {
                const pick = kept.sort((x, y) => y.unique - x.unique).slice(0, MAX_ROUTES).sort((x, y) => x.len - y.len);
                return { kind: "summit", routes: pick.map((k) => k.pts) };
            }
        }
    }

    // 정상을 지나지 않는 그물 — 덩어리마다 끝에서 끝까지 가장 긴 길
    const seen = new Array<boolean>(nodes).fill(false);
    const spans: { pts: RoutePoint[]; len: number }[] = [];
    for (let n = 0; n < nodes; n++) {
        if (seen[n]) continue;
        const first = dijkstra(adj, edges, n);
        const comp = first.dist.map((d, i) => (d < Infinity ? i : -1)).filter((i) => i >= 0);
        comp.forEach((i) => { seen[i] = true; });
        const far = (d: number[]) => comp.reduce((a, b) => (d[b] > d[a] ? b : a), comp[0]);
        const u = far(first.dist);
        const second = dijkstra(adj, edges, u);
        const v = far(second.dist);
        if (!(second.dist[v] >= ROUTE_MIN_M)) continue;
        const { pts } = walk(edges, second.via, v);
        // 낮은 쪽에서 시작한다
        spans.push({ pts: pts.length > 1 && pts[0][2] > pts[pts.length - 1][2] ? pts.reverse() : pts, len: second.dist[v] });
    }
    return { kind: "span", routes: spans.sort((x, y) => y.len - x.len).slice(0, 4).map((s) => s.pts) };
}
