/**
 * 골프장 페이지 적재(2026-09-24) — 세 벌로 갈라진 골프장 명부를 golf_course_pages 한 표로 묶는다.
 *
 *   정적 목록 525곳   client/src/golf/data/golfCourses.ts  — 부킹·조인 글의 course_id 가 가리킨다(기준)
 *   좌표 517곳        client/src/golf/data/courseCoords.ts
 *   랭큐매치 명부     rankue_golf_clubs 652 + rankue_golf_courses 1,088(코스별 파)
 *   TGM 234종목       golf_data_final.json(그린피·기본정보·시세) · golf-intros.json(소개) · price-history.json
 *
 * 실행(저장소 루트):
 *   node --env-file=.env --import tsx server/scripts/golf-course-pages.ts <TGM data 폴더>          # 미리보기
 *   node --env-file=.env --import tsx server/scripts/golf-course-pages.ts <TGM data 폴더> --write  # 적재
 *   node --env-file=.env --import tsx server/scripts/golf-course-pages.ts <TGM data 폴더> --sync   # 매일 동기화 대조(쓰지 않음)
 *     — 로컬 TGM 파일을 피드(app/api/feed/golf-prices)와 같은 모양으로 만들어 크론과 같은 함수에 넣고 결과만 찍는다.
 *
 * 다시 돌려도 된다 — slug 기준 upsert. 시세만 매일 바뀌므로 매일 도는 동기화는 syncMembershipPrices() 만 쓴다.
 *
 * ⚠️ 정적 목록의 rating·difficulty·vibe·grass·imageUrl·phone 은 가짜 자리채움 값이라 옮기지 않는다
 *   (평점 4.5/4.9 두 값뿐, 전화는 031-107-1013 → 031-114-1026 등차수열). 검색 페이지에 올리면 거짓 정보다.
 * ⚠️ TGM '기본정보.소개'는 동아에서 온 문장이라 쓰지 않는다 — 소개문은 TGM 이 직접 쓴 golf-intros.json 만.
 * ⚠️ '요금_특이사항'은 "2022년 4월부로 조정예정" 같은 지난 공지라 싣지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { COURSES } from "../../client/src/golf/data/golfCourses";
import { COURSE_COORDS } from "../../client/src/golf/data/courseCoords";
import { applyDbegl, readDbegl } from "./golf-course-dbegl";
// 라벨·이름 다듬기·시세 쓰기는 서버(매일 동기화 크론)도 쓴다 — 이 파일은 client 목록을 끌고 와서 서버가 못 임포트한다.
import { normName, itemLabel, manText, writePrices, parseFeed, pricesFromFeed, syncMembershipPrices } from "../services/golfPriceSync.js";
export { normName, itemLabel, manText, writePrices, parseFeed, pricesFromFeed, syncMembershipPrices };

type Part = { courseId: number; kind: string; holes: number | null };

// ── 이름·주소 다듬기 ──────────────────────────────────────────────
const PART_TOKENS = /\s*(회원제|대중제|대중|퍼블릭|public)\s*(골프장)?|\s*9홀\s*(골프장)?/gi;
/** 주소의 핵심 — 도로명 + 번호. 같은 값이면 같은 골프장이다(회원제·대중제 두 줄이 여기로 합쳐진다). */
export function addrKey(a?: string | null): string | null {
    if (!a) return null;
    const m = a.replace(/\s+/g, " ").match(/([가-힣0-9]+(?:로|길)(?:\s?[0-9]+번?길)?)\s?([0-9]+(?:-[0-9]+)?)/);
    return m ? `${m[1].replace(/\s/g, "")} ${m[2]}` : null;
}
/** 시군구 — "강원도 원주시 …" 도 "원주시 …" 도 원주시. 광역시의 구는 그대로 둔다(부산 기장군 등은 군). */
export function cityOf(a?: string | null): string | null {
    if (!a) return null;
    const toks = a.replace(/\s+/g, " ").split(" ");
    for (const t of toks) if (/^[가-힣]+(시|군)$/.test(t) && !/특별시|광역시|특별자치시/.test(t)) return t;
    return null;
}
const PROVINCE: Record<string, string> = {
    경기: "경기", 경기도: "경기", 강원: "강원", 강원도: "강원", 강원특별자치도: "강원",
    충북: "충북", 충청북도: "충북", 충남: "충남", 충청남도: "충남", 전북: "전북", 전라북도: "전북", 전북특별자치도: "전북",
    전남: "전남", 전라남도: "전남", 경북: "경북", 경상북도: "경북", 경남: "경남", 경상남도: "경남",
    제주: "제주", 제주도: "제주", 제주특별자치도: "제주", 서울: "서울", 인천: "인천", 부산: "부산", 대구: "대구",
    대전: "대전", 광주: "광주", 울산: "울산", 세종: "세종",
};
/** 정적 목록과 같은 넓은 체계 — 경기·강원·충청·전라·경상·제주. 페이지 지역 허브가 이 값을 쓴다. */
const BROAD: Record<string, string> = { 충북: "충청", 충남: "충청", 대전: "충청", 세종: "충청", 전북: "전라", 전남: "전라", 광주: "전라", 경북: "경상", 경남: "경상", 부산: "경상", 대구: "경상", 울산: "경상", 서울: "경기", 인천: "경기" };
const regionFromAddr = (a?: string | null) => {
    const t = a?.trim().split(/\s+/)[0]?.replace(/특별시|광역시|특별자치시/, "") ?? "";
    const p = PROVINCE[t]; return p ? BROAD[p] ?? p : null;
};
/** 표시 이름 — 회원제·대중제 꼬리표를 떼고, 공백을 하나로. */
export function displayName(names: string[]): string {
    // 회사명 앞머리는 뗀다 — "삼성물산(주)안양컨트리클럽" 을 찾는 사람은 "안양CC" 로 검색한다.
    const cleaned = [...new Set(names.map((n) => n.replace(PART_TOKENS, "").replace(/㈜|\(주\)/g, "").replace(/^(삼성물산|주식회사|호텔)\s*/g, "").replace(/\s+/g, " ").trim()).filter((n) => n.length >= 3))];
    // 꼬리표를 떼니 너무 짧아졌으면(J-PUBLIC → "J-") 원래 이름을 쓴다
    if (!cleaned.length) return names.map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? "";
    if (cleaned.length <= 1) return cleaned[0] ?? names[0];
    // 하나가 나머지 전부의 앞부분이면 그것(센추리21컨트리클럽 · 센추리21컨트리클럽Ⅱ → 앞의 것)
    const prefix = cleaned.find((a) => cleaned.every((b) => b.startsWith(a)));
    if (prefix) return prefix;
    // 공통 앞부분에서 꼬리 번호를 뗀다(로얄링스1 · 로얄링스2 → 로얄링스)
    let lcp = cleaned[0];
    for (const b of cleaned) { let i = 0; while (i < lcp.length && i < b.length && lcp[i] === b[i]) i++; lcp = lcp.slice(0, i); }
    lcp = lcp.replace(/[\s0-9ⅠⅡⅢⅣ-]+$/, "").trim();
    if (lcp.length >= 3) return lcp;
    // 그 밖엔 가장 긴 이름(대개 회원제 쪽의 정식 이름) — "웰리힐리컨트리클럽" vs "웰리힐리"
    return cleaned.sort((a, b) => b.length - a.length)[0];
}
export function slugOf(name: string): string {
    return name.normalize("NFC").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
const sim = (a: string, b: string) => {
    const bg = (s: string) => { const r: string[] = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
    const A = bg(a), B = bg(b); if (!A.length || !B.length) return a === b ? 1 : 0;
    let h = 0; const p = [...B]; for (const x of A) { const k = p.indexOf(x); if (k >= 0) { h++; p.splice(k, 1); } }
    return (2 * h) / (A.length + B.length);
};
const dist = (a: number, b: number, c: number, d: number) => {
    const R = 6371000, t = Math.PI / 180;
    const x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
};
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

// ── TGM 수동 판정(2026-09-24 짝 맞추기 검토) ────────────────────────
/** 정적 목록에 없는 골프장 — TGM 데이터만으로 페이지를 만든다(좌표·코스 파 없음). */
const TGM_ONLY = new Set(["서울cc", "벨라45", "오크힐스cc", "해내다cc", "고흥썬밸리"]);
/** 이름·주소로 못 가르는 것 — 정적 목록 id 로 못 박는다. */
const TGM_OVERRIDE: Record<string, number> = { "플라자설악cc": 221, "김포씨사이드cc": 65 };

// ── 1. 정적 목록 → 골프장 단위로 묶기 ──────────────────────────────
type Club = { ids: number[]; names: string[]; parts: Part[]; address: string | null; region: string; city: string | null; lat: number | null; lng: number | null };
function groupStatic(): Club[] {
    const list = COURSES as any[];
    const parent = new Map<number, number>();
    const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    const byAddr = new Map<string, number>(), byName = new Map<string, number>();
    for (const c of list) {
        parent.set(c.id, c.id);
        // 주소가 같아도 **이름이 비슷할 때만** 합친다 — 용평리조트·버치힐은 한 리조트 안의 다른 골프장이다.
        const ak = addrKey(c.address);
        if (ak) {
            const hit = byAddr.get(ak);
            const hitName = hit != null ? list.find((x) => x.id === hit)?.name : null;
            const blank = !String(c.name ?? "").trim() || !String(hitName ?? "").trim();
            if (hit != null && (blank || (hitName && sim(normName(hitName), normName(c.name)) >= 0.6))) union(hit, c.id);
            else if (hit == null) byAddr.set(ak, c.id);
        }
        const nk = `${normName(c.name)}|${cityOf(c.address) ?? c.region}`;
        const hit2 = byName.get(nk); if (hit2) union(hit2, c.id); else byName.set(nk, c.id);
    }
    const groups = new Map<number, any[]>();
    for (const c of list) { const r = find(c.id); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(c); }
    return [...groups.values()].map((cs) => {
        const coord = cs.map((c) => (COURSE_COORDS as any)[c.id]).find(Boolean) as [number, number] | undefined;
        const address = (cs.find((c) => c.subType === "회원제") ?? cs[0]).address ?? null;
        return {
            ids: cs.map((c) => c.id).sort((a, b) => a - b),
            names: cs.map((c) => c.name),
            parts: cs.map((c) => ({ courseId: c.id, kind: c.subType, holes: num(c.holes) })),
            address,
            region: cs[0].region,
            city: cityOf(address),
            lat: coord?.[0] ?? null, lng: coord?.[1] ?? null,
        };
    });
}

// ── 2. TGM 읽기 ───────────────────────────────────────────────────
type Tgm = { items: any[]; intros: Record<string, string>; history: Record<string, { d: string; p: number }[]> };
function readTgm(dir: string): Tgm {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const items = read("golf_data_final.json");
    return { items: Array.isArray(items) ? items : Object.values(items), intros: read("golf-intros.json"), history: read("price-history.json") };
}

// ── 3. 조립 ───────────────────────────────────────────────────────
export async function buildPages(tgmDir: string, opts: { dbeglFile?: string; logoDir?: string } = {}) {
    const clubs = groupStatic();
    const tgm = readTgm(tgmDir);

    // 랭큐매치 명부: 좌표 400m 이내 + 이름으로 짝
    const rc: any = await db.execute(sql`select id, name, latitude, longitude from rankue_golf_clubs`);
    const rclubs = (rc.rows ?? rc) as any[];
    const rcs: any = await db.execute(sql`select club_id, name, pars from rankue_golf_courses order by name`);
    const coursesByClub = new Map<string, { name: string; par: number; holes: number }[]>();
    for (const r of (rcs.rows ?? rcs) as any[]) {
        const pars: number[] = Array.isArray(r.pars) ? r.pars.map(Number).filter((n: number) => n > 0) : [];
        if (!pars.length) continue;
        if (!coursesByClub.has(r.club_id)) coursesByClub.set(r.club_id, []);
        coursesByClub.get(r.club_id)!.push({ name: r.name, par: pars.reduce((a, b) => a + b, 0), holes: pars.length });
    }
    const clubIdFor = (c: Club): string | null => {
        const n = normName(displayName(c.names)); let best: any = null;
        for (const k of rclubs) {
            const s = sim(n, normName(k.name));
            const dm = c.lat != null && k.latitude != null ? dist(c.lat, c.lng!, k.latitude, k.longitude) : 1e9;
            const score = (dm < 400 ? 0.5 : dm < 1500 ? 0.2 : 0) + s;
            if (!best || score > best.score) best = { k, score, dm, s };
        }
        return best && (best.score >= 0.95 || (best.dm < 400 && best.s >= 0.3)) ? best.k.id : null;
    };

    // TGM 그룹(골프장명) → 골프장
    const tgmGroups = new Map<string, any[]>();
    for (const it of tgm.items) { const k = String(it.골프장명); if (!tgmGroups.has(k)) tgmGroups.set(k, []); tgmGroups.get(k)!.push(it); }
    // 주소 하나에 골프장이 둘일 수 있다(용평리조트·버치힐) — 목록으로 들고, 둘 이상이면 이름으로 가른다.
    const clubByAddr = new Map<string, Club[]>();
    for (const c of clubs) { const k = addrKey(c.address); if (k) clubByAddr.set(k, [...(clubByAddr.get(k) ?? []), c]); }
    const tgmFor = new Map<Club, any[]>(); const tgmOnly: { g: string; its: any[] }[] = []; const review: string[] = [];
    for (const [g, its] of tgmGroups) {
        if (TGM_ONLY.has(g)) { tgmOnly.push({ g, its }); continue; }
        let club: Club | undefined;
        if (TGM_OVERRIDE[g] != null) club = clubs.find((c) => c.ids.includes(TGM_OVERRIDE[g]));
        const addr = its.find((x) => x.기본정보?.주소)?.기본정보?.주소;
        if (!club) {
            const ak = addrKey(addr); const same = ak ? clubByAddr.get(ak) ?? [] : [];
            club = same.length <= 1 ? same[0] : same.slice().sort((x, y) => sim(normName(g), normName(displayName(y.names))) - sim(normName(g), normName(displayName(x.names))))[0];
        }
        if (!club) {
            const gn = normName(g), gc = cityOf(addr);
            const scored = clubs.map((c) => {
                const cn = normName(displayName(c.names));
                const s = Math.max(sim(gn, cn), cn.length >= 2 && gn.length >= 2 && (cn.includes(gn) || gn.includes(cn)) ? 0.85 : 0);
                return { c, t: s + (gc && c.city === gc ? 0.3 : 0), s };
            }).sort((a, b) => b.t - a.t);
            if (scored[0].t >= 1.05 && (!scored[1] || scored[0].t - scored[1].t >= 0.1)) { club = scored[0].c; review.push(`${g} → ${displayName(club.names)} (${scored[0].t.toFixed(2)})`); }
        }
        if (!club) { review.push(`?? ${g} [${addr ?? "-"}] — 짝 없음, 건너뜀`); continue; }
        tgmFor.set(club, [...(tgmFor.get(club) ?? []), ...its]);
    }

    // 페이지 행
    const rows: any[] = []; const slugs = new Set<string>();
    /**
     * 슬러그 — 이름에서. **숫자만인 슬러그는 만들지 않는다**: /golf/course/123 은 옛 주소(정적 목록 id)라
     * "1.2.3" 골프장이 "123" 을 가지면 옛 주소 이동과 부딪힌다(2026-09-24 검토).
     */
    const uniqueSlug = (name: string, city: string | null) => {
        let base = slugOf(name);
        if (!base || /^\d+$/.test(base)) base = slugOf(`${name} 골프장`);
        let s = base; if (!slugs.has(s)) { slugs.add(s); return s; }
        s = slugOf(`${name} ${city ?? ""}`); if (!slugs.has(s)) { slugs.add(s); return s; }
        let i = 2; while (slugs.has(`${s}-${i}`)) i++; slugs.add(`${s}-${i}`); return `${s}-${i}`;
    };
    const fromTgm = (its: any[]) => {
        const first = its.find((x) => x.기본정보) ?? its[0];
        const b = first?.기본정보 ?? {};
        const intro = its.map((x) => tgm.intros[x.id]).find((v) => typeof v === "string" && v.trim()) ?? null;
        const feeRows = (first?.요금표 ?? []).map((r: any) => ({
            day: String(r.구분 ?? ""), nonMember: num(r.비회원), member: num(r.정회원), family: num(r.가족회원),
        })).filter((r: any) => r.day && (r.nonMember || r.member || r.family));
        const extra = first?.기타비용 ? { caddie: num(first.기타비용.캐디피), cart: num(first.기타비용.카트피) } : null;
        return {
            intro,
            info: {
                opened: b.개장일 || null, members: num(b.회원수), homepage: b.홈페이지 || null,
                membershipTypes: b.회원권종류 || null, membershipNotes: b.특징 || null,
            },
            fees: feeRows.length || (extra && (extra.caddie || extra.cart)) ? { rows: feeRows, extra } : null,
            holes: num(b.홀수), address: b.주소 || null,
            items: its.map((x) => String(x.id)),
        };
    };
    for (const c of clubs) {
        const name = displayName(c.names);
        const its = tgmFor.get(c) ?? [];
        const t = its.length ? fromTgm(its) : null;
        const kinds = [...new Set(c.parts.map((p) => p.kind).filter(Boolean))];
        const clubId = clubIdFor(c);
        rows.push({
            slug: "", name, region: c.region, city: c.city, address: c.address,
            lat: c.lat, lng: c.lng, courseIds: c.ids, clubId,
            kind: kinds.length > 1 ? "회원제+대중제" : kinds[0] ?? null,
            holes: c.parts.reduce((a, p) => a + (p.holes ?? 0), 0) || t?.holes || null,
            parts: c.parts, courses: clubId ? coursesByClub.get(clubId) ?? null : null,
            intro: t?.intro ?? null, info: t?.info ?? null, fees: t?.fees ?? null, tgmItems: t?.items ?? [],
        });
    }
    for (const { g, its } of tgmOnly) {
        const t = fromTgm(its);
        const name = g.replace(/cc$/i, "CC");
        rows.push({
            slug: "", name, region: regionFromAddr(t.address) ?? "기타", city: cityOf(t.address), address: t.address,
            lat: null, lng: null, courseIds: [], clubId: null, kind: "회원제", holes: t.holes, parts: null, courses: null,
            intro: t.intro, info: t.info, fees: t.fees, tgmItems: t.items,
        });
    }

    // 오너가 준 골프장 자료(로고·잔디·플레이·연락처·지금 이름) — 붙이고, 우리 명부에 없는 곳은 새 행으로
    let dbegl: ReturnType<typeof applyDbegl> | null = null;
    if (opts.dbeglFile) dbegl = applyDbegl(rows, readDbegl(opts.dbeglFile), { logoDir: opts.logoDir });
    // 이름이 없는 줄은 페이지가 될 수 없다
    for (let i = rows.length - 1; i >= 0; i--) if (!String(rows[i].name ?? "").trim()) rows.splice(i, 1);
    // 슬러그 — 부킹·조인이 붙는(정적 목록) 줄부터, 그 안에선 인기 많은 곳부터 깨끗한 이름을 가져간다
    rows.sort((a, b) => Number(!!b.courseIds?.length) - Number(!!a.courseIds?.length) || (b.popularity ?? 0) - (a.popularity ?? 0));
    for (const r of rows) {
        r.slug = uniqueSlug(r.name, r.city);
        r.aliases = r.aliases ?? []; r.grass = r.grass ?? []; r.play = r.play ?? []; r.extIds = r.extIds ?? [];
    }

    // 시세
    const prices: any[] = []; const history: any[] = [];
    const slugByItem = new Map<string, string>(); for (const r of rows) for (const i of r.tgmItems) slugByItem.set(i, r.slug);
    for (const it of tgm.items) {
        const slug = slugByItem.get(String(it.id)); if (!slug) continue;
        const p = it.회원권시세 ?? {}; const price = num(p.현재시세); if (!price) continue;
        const h = (tgm.history[String(it.id)] ?? []).filter((x) => x && x.d && x.p > 0).sort((a, b) => a.d.localeCompare(b.d));
        const last = h[h.length - 1], prev = h[h.length - 2];
        prices.push({
            itemId: String(it.id), slug, label: itemLabel(it), price,
            yearHigh: num(p.연간최고가), yearLow: num(p.연간최저가),
            change: last && prev ? last.p - prev.p : null,
            asOf: p.기준일 || last?.d || null,
        });
        for (const x of h) history.push({ itemId: String(it.id), d: x.d, price: Math.round(x.p) });
    }
    return { rows, prices, history, review, tgmOnly: tgmOnly.map((x) => x.g), dbegl };
}

/** Postgres text[] 리터럴 — 따옴표·역슬래시는 이스케이프한다(별칭에 "(구, 실크리버)" 같은 문자가 온다). */
function pgTextArray(a: readonly string[] | null | undefined): string {
    return `{${(a ?? []).map((x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export async function writePages(built: Awaited<ReturnType<typeof buildPages>>) {
    const { rows, prices, history } = built;
    for (const r of rows) {
        await db.execute(sql`
            insert into golf_course_pages (slug, name, region, city, address, lat, lng, course_ids, club_id, kind, holes, parts, courses, intro, info, fees, tgm_items,
                                           logo, grass, play, phone, website, fee_from, popularity, aliases, ext_ids, updated_at)
            values (${r.slug}, ${r.name}, ${r.region}, ${r.city}, ${r.address}, ${r.lat}, ${r.lng},
                    ${`{${r.courseIds.join(",")}}`}::int[], ${r.clubId}::uuid, ${r.kind}, ${r.holes},
                    ${JSON.stringify(r.parts)}::jsonb, ${JSON.stringify(r.courses)}::jsonb, ${r.intro},
                    ${JSON.stringify(r.info)}::jsonb, ${JSON.stringify(r.fees)}::jsonb,
                    ${pgTextArray(r.tgmItems)}::text[],
                    ${r.logo ?? null}, ${pgTextArray(r.grass)}::text[], ${pgTextArray(r.play)}::text[], ${r.phone ?? null}, ${r.website ?? null},
                    ${r.feeFrom ?? null}, ${r.popularity ?? 0}, ${pgTextArray(r.aliases)}::text[], ${`{${(r.extIds ?? []).join(",")}}`}::int[], now())
            on conflict (slug) do update set name = excluded.name, region = excluded.region, city = excluded.city,
                address = excluded.address, lat = excluded.lat, lng = excluded.lng, course_ids = excluded.course_ids,
                club_id = excluded.club_id, kind = excluded.kind, holes = excluded.holes, parts = excluded.parts,
                courses = excluded.courses, intro = excluded.intro, info = excluded.info, fees = excluded.fees,
                tgm_items = excluded.tgm_items, logo = excluded.logo, grass = excluded.grass, play = excluded.play,
                phone = excluded.phone, website = excluded.website, fee_from = excluded.fee_from, popularity = excluded.popularity,
                aliases = excluded.aliases, ext_ids = excluded.ext_ids, updated_at = now()`);
    }
    await writePrices(prices, history);
}

/** 로컬 TGM data 폴더 → 피드 본문(TGM app/api/feed/golf-prices 와 같은 모양: 종목 + 최근 30점). */
export function feedFromTgmDir(dir: string) {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const data = read("golf_data_final.json"); const hist = read("price-history.json") as Record<string, { d: string; p: number }[]>;
    const items = (Array.isArray(data) ? data : Object.values(data)).map((x: any) => ({ id: String(x.id), 수집명: x.수집명, 골프장명: x.골프장명, 회원권시세: x.회원권시세 ?? {} }));
    const history: Record<string, { d: string; p: number }[]> = {};
    let latest = "";
    for (const it of items) {
        const pts = (hist[it.id] ?? []).filter((p) => p && p.d && p.p > 0).sort((a, b) => a.d.localeCompare(b.d)).slice(-30);
        if (pts.length) history[it.id] = pts;
        if ((pts[pts.length - 1]?.d ?? "") > latest) latest = pts[pts.length - 1].d;
    }
    return { data: { generatedAt: latest || null, items, history }, timestamp: new Date().toISOString() };
}

// CLI
if (process.argv[1]?.endsWith("golf-course-pages.ts")) {
    const dir = process.argv[2];
    if (!dir) { console.error("TGM data 폴더를 주세요"); process.exit(1); }
    if (process.argv.includes("--sync")) {
        // 대조 전용 — --sync 는 --write 를 무시한다(운영 DB 에 쓰려면 크론을 부른다).
        const r = await syncMembershipPrices({ body: feedFromTgmDir(dir), dryRun: true });
        if (!r.ok) { console.error("실패:", r.reason); process.exit(1); }
        console.log(`피드 ${r.feedItems}종목 → 골프장에 붙음 ${r.written} · 이력 ${r.historyPoints}점 · 기준 ${r.generatedAt}`);
        console.log(`  못 붙은 것 ${r.unmatched.length}` + (r.unmatched.length ? "\n  " + r.unmatched.join("\n  ") : ""));
        process.exit(0);
    }
    const argOf = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
    const built = await buildPages(dir, { dbeglFile: argOf("--dbegl"), logoDir: argOf("--logos") });
    const { rows, prices, history, review, tgmOnly } = built;
    const withTgm = rows.filter((r) => r.tgmItems.length);
    console.log(`골프장 ${rows.length}곳 (정적 목록 묶음 ${rows.length - tgmOnly.length} + TGM 전용 ${tgmOnly.length})`);
    console.log(`  TGM 붙음 ${withTgm.length} · 소개 ${rows.filter((r) => r.intro).length} · 그린피 ${rows.filter((r) => r.fees).length} · 코스 파 ${rows.filter((r) => r.courses?.length).length} · 좌표 ${rows.filter((r) => r.lat).length}`);
    console.log(`  시세 종목 ${prices.length} · 이력 ${history.length}행`);
    console.log(`  회원제+대중제로 합친 곳 ${rows.filter((r) => r.courseIds.length > 1).length}`);
    console.log("\n[이름으로 짝지은 것]\n  " + review.join("\n  "));
    if (process.argv.includes("--write")) { await writePages(built); console.log("\n적재 완료"); }
    process.exit(0);
}
