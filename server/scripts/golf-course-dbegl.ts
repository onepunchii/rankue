/**
 * 골프장 페이지 보강(2026-09-24) — 오너가 준 골프장 자료 304곳(golf_courses.json + logos/)을 붙인다.
 *
 *   얻는 것: 로고, 잔디(한국잔디·양잔디·벤트그라스), 플레이 방식(3인·2인·노캐디), 대표 전화, 홈페이지,
 *           대표 그린피(그린피 표가 없는 곳의 참고값), 지금 이름(개명한 골프장), 도·광역시까지 적힌 주소.
 *   싣지 않는 것: 평점(naverRating)·즐겨찾기 수(bookmarkCount) — 남의 사이트 숫자다. 즐겨찾기 수는 목록 정렬(popularity)에만.
 *
 * 이름 규칙: 그 자료의 이름이 **지금 이름**이다(로제비앙GC ← 구 큐로CC). 다만 우리 한 페이지가 회원제+대중제를 합친 곳이면
 * 자료에 대중제 쪽 이름만 있을 수 있다(서원밸리 ← 서원힐스CC) — 그래서 **비슷하거나(≥0.6) "(구 X)" 로 옛 이름이 우리 이름일 때만** 바꾸고,
 * 아니면 우리 이름을 두고 그 이름을 별칭(aliases)으로 남긴다. 별칭은 본문에 적혀 두 이름 어느 쪽으로도 검색에 걸린다.
 *
 * 짝 규칙(2026-09-24 검토 — 304곳 중 278곳이 우리 페이지에 붙고 18곳은 새 페이지, 중복 2곳은 합친다):
 *   1) 수동 판정(OVERRIDE·FORCE_NEW)  2) 주소 핵심(도로명+번호) 일치 — 한 주소에 둘이면 이름으로  3) 이름 유사 + 같은 시군.
 *   이름 포함(contains) 짝은 짧은 쪽이 긴 쪽의 절반 이상일 때만 — "밀양"이 "밀양에스파크"를 삼키지 않게.
 */
import fs from "node:fs";
import { normName, addrKey, cityOf } from "./golf-course-pages";

export type Dbegl = {
    id: number; name: string; nameWithoutCC?: string; region?: string; address?: string; phone?: string;
    greenFee?: number; bookmarkCount?: number; website?: string; tags?: string[]; logoFile?: string;
};

/** 자료 id → 정적 목록 id(그 id 를 가진 우리 페이지에 붙인다). 주소·이름으로 못 가른 것. */
const OVERRIDE: Record<number, number> = {
    342: 65,   // 김포씨사이드CC → 김포 SEASIDE(우리 주소 2081번길 오타)
    372: 60,   // 파주CC → 우리 파주CC(자료 주소가 서원밸리의 서원길 333 으로 잘못 적혀 있다)
    301: 157,  // 동래베네스트GC → 동래베네스트골프클럽(우리 주소 도로명이 다르다)
    788: 191,  // 베이스타즈CC(울산) → 베이스타즈CC(우리 주소는 지번)
    495: 230,  // 클럽모우GC → 클럽모우골프 &라이프스타일(이름이 너무 달라 포함 규칙에 안 걸린다)
};
/** 우리 명부에 없는 골프장 — 이름이 닮아도 다른 곳이다. 새 페이지로 만든다. */
const FORCE_NEW = new Set([
    824, // 밀양에스파크CC(단장면) ≠ 밀양CC(부북면)
    310, // 오렌지듄스GC 영종 ≠ 오렌지듄스 송도(연수구)
    311, // 유니아일랜드(강화) ≠ 아일랜드CC(안산 대부도)
    826, // 포천힐마루CC ≠ 포천힐스CC · 창녕 힐마루
]);

const GRASS = ["한국잔디", "양잔디", "벤트그라스"];
const PLAY = ["3인가능", "2인가능", "노캐디"];
const METRO = ["서울", "인천", "부산", "대구", "울산", "광주", "대전", "세종"];

const sim = (a: string, b: string) => {
    const bg = (s: string) => { const r: string[] = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
    const A = bg(a), B = bg(b); if (!A.length || !B.length) return a === b ? 1 : 0;
    let h = 0; const p = [...B]; for (const x of A) { const k = p.indexOf(x); if (k >= 0) { h++; p.splice(k, 1); } }
    return (2 * h) / (A.length + B.length);
};

/** 비교용 — "세레니티cc(구, 실크리버)" 의 (구 …) 꼬리를 떼고 normName. */
const bare = (s: string) => normName(s.replace(/\(\s*구\s*[,:：]?[^)]*\)/g, ""));

/** "태광CC | 회원제" → { name: "태광CC", old: [] } · "로제비앙GC (구 큐로CC)" → { name: "로제비앙GC", old: ["큐로CC"] } */
export function cleanDbeglName(raw: string): { name: string; old: string[] } {
    const old: string[] = [];
    let n = raw.replace(/\s*\|\s*(회원제|퍼블릭|대중제)\s*$/, "");
    n = n.replace(/\s*\(구\s*[:：]?\s*([^)]+)\)\s*/g, (_m, x: string) => { old.push(x.trim()); return " "; });
    return { name: n.replace(/\s+/g, " ").trim(), old };
}

/** 시군 — 광역시는 "인천 중구 …" 처럼 시군이 없으니 광역시 이름을 시로 쓴다(검색어 "인천 골프장"). */
export function cityOfFull(address?: string | null): string | null {
    if (!address) return null;
    const c = cityOf(address); if (c) return c;
    const first = address.trim().split(/\s+/)[0]?.replace(/광역시|특별시|특별자치시/, "") ?? "";
    return METRO.includes(first) ? `${first}시` : null;
}

/** 여러 자료 이름에서 대표 이름 — 공통 앞부분("라비에벨CC 올드코스" · "라비에벨CC 듄스코스" → "라비에벨CC"). */
function commonName(names: string[]): string {
    const u = [...new Set(names)]; if (u.length === 1) return u[0];
    let lcp = u[0]; for (const b of u) { let i = 0; while (i < lcp.length && i < b.length && lcp[i] === b[i]) i++; lcp = lcp.slice(0, i); }
    lcp = lcp.replace(/[\s,·-]+$/, "").trim();
    return lcp.length >= 3 ? lcp : u.sort((a, b) => a.length - b.length)[0];
}

export function readDbegl(file: string): Dbegl[] {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(d) ? d : (d.courses ?? Object.values(d));
}

/**
 * buildPages() 가 만든 행에 자료를 붙이고, 짝 없는 자료는 새 행으로 더한다(제자리에서 바꾼다).
 * 행에는 logo·grass·play·phone·website·feeFrom·popularity·aliases·extIds 가 채워진다.
 */
export function applyDbegl(rows: any[], dbegl: Dbegl[], opts: { logoDir?: string } = {}) {
    const logoPath = (d: Dbegl) => `/img/golf-logos/${d.id}.png`;
    const hasLogo = (d: Dbegl) => !opts.logoDir || fs.existsSync(`${opts.logoDir}/${d.id}.png`);
    const byAddr = new Map<string, any[]>(); for (const r of rows) { const k = addrKey(r.address); if (k) byAddr.set(k, [...(byAddr.get(k) ?? []), r]); }
    const byCourse = new Map<number, any>(); for (const r of rows) for (const id of r.courseIds ?? []) byCourse.set(id, r);

    const attach = new Map<any, Dbegl[]>(); const fresh: Dbegl[] = []; const log: string[] = [];
    for (const d of dbegl) {
        if (FORCE_NEW.has(d.id)) { fresh.push(d); continue; }
        let row: any = OVERRIDE[d.id] != null ? byCourse.get(OVERRIDE[d.id]) : null;
        const { name, old } = cleanDbeglName(d.name);
        const dn = bare(name), dc = cityOfFull(d.address);
        const oldNs = old.map(bare);
        if (!row) {
            const same = byAddr.get(addrKey(d.address) ?? "") ?? [];
            row = same.length <= 1 ? same[0] : same.slice().sort((a, b) => sim(dn, bare(b.name)) - sim(dn, bare(a.name)))[0];
        }
        if (!row) {
            const scored = rows.map((r) => {
                const rn = bare(r.name);
                const sameCity = !!dc && (r.city === dc || cityOfFull(r.address) === dc);
                // 이름 포함은 짧은 쪽이 긴 쪽의 절반 이상일 때만 — 같은 시군이면 0.3 까지 봐 준다(한맥CC ⊂ 한맥CC노블리아)
                const ratio = Math.min(rn.length, dn.length) / Math.max(rn.length, dn.length);
                const contains = rn.length >= 2 && dn.length >= 2 && (rn.includes(dn) || dn.includes(rn)) && ratio >= (sameCity ? 0.3 : 0.5);
                // 옛 이름이 우리 이름이면 같은 곳이다(로제비앙GC 구 큐로CC · 코브스윙 구 참밸리CC)
                const byOld = oldNs.some((o) => o.length >= 2 && (o === rn || sim(o, rn) >= 0.8));
                const s = Math.max(sim(dn, rn), contains ? 0.85 : 0, byOld ? 1 : 0);
                return { r, s, t: s + (sameCity ? 0.3 : 0) };
            }).sort((a, b) => b.t - a.t);
            if (scored[0] && scored[0].t >= 1.05 && (!scored[1] || scored[0].t - scored[1].t >= 0.1)) { row = scored[0].r; log.push(`${d.id}:${d.name} → ${row.name} (${scored[0].t.toFixed(2)})`); }
        }
        if (!row) { fresh.push(d); continue; }
        attach.set(row, [...(attach.get(row) ?? []), d]);
    }

    const fill = (row: any, ds: Dbegl[]) => {
        // 대표 자료 — 회원제 쪽, 없으면 즐겨찾기 많은 쪽
        const primary = ds.slice().sort((a, b) => (/회원제/.test(b.name) ? 1 : 0) - (/회원제/.test(a.name) ? 1 : 0) || (b.bookmarkCount ?? 0) - (a.bookmarkCount ?? 0))[0];
        const cleaned = ds.map((d) => cleanDbeglName(d.name));
        const current = commonName(cleaned.map((c) => c.name));
        const olds = cleaned.flatMap((c) => c.old);
        const ours = row.name as string;
        const renamedFromOurs = olds.some((o) => sim(bare(o), bare(ours)) >= 0.6);
        const aliases = new Set<string>(row.aliases ?? []);
        if (renamedFromOurs || sim(bare(current), bare(ours)) >= 0.6) {
            if (current !== ours) aliases.add(ours);
            row.name = current;
        } else {
            for (const c of cleaned) if (c.name !== ours) aliases.add(c.name);
        }
        for (const o of olds) if (o !== row.name) aliases.add(o);
        row.aliases = [...aliases].filter((a) => a && a !== row.name);
        const tags = new Set(ds.flatMap((d) => d.tags ?? []));
        row.grass = GRASS.filter((g) => tags.has(g));
        row.play = PLAY.filter((p) => tags.has(p));
        row.logo = hasLogo(primary) ? logoPath(primary) : null;
        row.phone = primary.phone || null;
        row.website = primary.website || row.info?.homepage || null;
        const fees = ds.map((d) => Number(d.greenFee)).filter((n) => n > 0);
        row.feeFrom = fees.length ? Math.min(...fees) : null;
        row.popularity = Math.max(0, ...ds.map((d) => Number(d.bookmarkCount) || 0));
        row.extIds = ds.map((d) => d.id);
        // 우리 주소는 도·광역시가 빠져 있다("북구 어물동 …") — 자료 주소가 더 온전하면 그걸 쓴다.
        if (primary.address && (!row.address || !/^(서울|인천|부산|대구|울산|광주|대전|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(row.address))) row.address = primary.address;
        if (!row.city) row.city = cityOfFull(row.address);
        if (!row.holes) { const h = (tags.has("18홀") ? 18 : 0) + (tags.has("9홀") ? 9 : 0); if (h) row.holes = h; }
    };
    for (const [row, ds] of attach) fill(row, ds);

    // 새 페이지 — 우리 명부에 없는 곳. 부킹·조인 글은 아직 붙을 수 없다(course_ids 가 비어 있다).
    const BROAD: Record<string, string> = { 경기: "경기", 서울: "경기", 인천: "경기", 강원: "강원", 충북: "충청", 충남: "충청", 충청북도: "충청", 충청남도: "충청", 대전: "충청", 세종: "충청", 전북: "전라", 전남: "전라", 전라북도: "전라", 전라남도: "전라", 광주: "전라", 경북: "경상", 경남: "경상", 경상북도: "경상", 경상남도: "경상", 부산: "경상", 대구: "경상", 울산: "경상", 제주: "제주" };
    const groupFresh = new Map<string, Dbegl[]>();
    for (const d of fresh) { const k = `${addrKey(d.address) ?? d.id}`; groupFresh.set(k, [...(groupFresh.get(k) ?? []), d]); }
    let added = 0;
    for (const ds of groupFresh.values()) {
        const p = ds[0];
        const first = (p.address ?? "").trim().split(/\s+/)[0]?.replace(/광역시|특별시|특별자치시|특별자치도|도$/, "") ?? "";
        const region = BROAD[first] ?? BROAD[(p.region ?? "").split(/\s+/)[0]] ?? "기타";
        const row: any = {
            slug: "", name: "", region, city: cityOfFull(p.address), address: p.address ?? null, lat: null, lng: null,
            courseIds: [], clubId: null, kind: ds.some((d) => /회원제/.test(d.name)) ? (ds.some((d) => /퍼블릭|대중제/.test(d.name)) ? "회원제+대중제" : "회원제") : ds.some((d) => /퍼블릭|대중제/.test(d.name)) ? "대중제" : null,
            holes: null, parts: null, courses: null, intro: null, info: null, fees: null, tgmItems: [], aliases: [],
        };
        fill(row, ds);
        row.name = commonName(ds.map((d) => cleanDbeglName(d.name).name));
        row.aliases = row.aliases.filter((a: string) => a !== row.name);
        rows.push(row); added++;
    }

    // 같은 골프장이 두 줄이 된 것 합치기 — TGM 에만 있던 줄(course_ids 없음)이 이름이 바뀐 우리 줄과 같은 곳일 때
    // (TGM '해내다cc' = 우리 '인터불고' → 해내다CC). 이름(별칭 포함)+시군이 같으면 TGM 데이터를 우리 줄로 옮기고 지운다.
    let merged = 0;
    const key = (n: string, c: string | null) => `${bare(n)}|${c ?? ""}`;
    const withIds = new Map<string, any>();
    for (const r of rows) if ((r.courseIds ?? []).length) for (const n of [r.name, ...(r.aliases ?? [])]) withIds.set(key(n, r.city), r);
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]; if ((r.courseIds ?? []).length) continue;
        const target = [r.name, ...(r.aliases ?? [])].map((n) => withIds.get(key(n, r.city))).find(Boolean);
        if (!target || target === r) continue;
        target.tgmItems = [...new Set([...(target.tgmItems ?? []), ...(r.tgmItems ?? [])])];
        for (const k of ["intro", "info", "fees", "logo", "phone", "website", "feeFrom"]) if (!target[k] && r[k]) target[k] = r[k];
        for (const k of ["grass", "play", "extIds"]) target[k] = [...new Set([...(target[k] ?? []), ...(r[k] ?? [])])];
        target.aliases = [...new Set([...(target.aliases ?? []), r.name])].filter((a) => a !== target.name);
        target.popularity = Math.max(target.popularity ?? 0, r.popularity ?? 0);
        rows.splice(i, 1); merged++;
    }
    return { attached: attach.size, attachedEntries: [...attach.values()].reduce((a, v) => a + v.length, 0), added, merged, log };
}
