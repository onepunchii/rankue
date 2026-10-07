// 골프 관리 · 골프장 이름 고치기 · 좌표 맞추기(2026-10-07 오너: "잘못된 정보라 수정가능하게 — 1.원장좌표 수정시 골프장 좌표가 자동 반영되게
// 2.골프장 명 수정 가능하게"). DB 에 붙지 않는다(.env 는 운영 DB 다) — 가짜 db 가 쿼리 글자를 보고 메모리 표를 읽고 고친다.
// 그래서 여기서 보는 것은 '어떤 순서로 무엇을 확인하고 무엇을 쓰는가'다. SQL 문법 자체는 운영 DB 에 EXPLAIN 으로 따로 확인했다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mem = vi.hoisted(() => {
    const state = {
        pages: new Map<string, any>(),
        clubs: new Map<string, any>(),
        live: new Set<string>(),
        log: [] as string[],
    };
    return { state };
});

vi.mock("../db.js", () => {
    const dialect = new PgDialect();
    const key = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();
    const arr = (lit: string): string[] => (lit === "{}" ? [] : lit.slice(2, -2).split('","').map((x) => x.replace(/\\"/g, '"').replace(/\\\\/g, "\\")));
    const keep = (row: any, lit: string) => { row.admin_keep = [...new Set([...(row.admin_keep ?? []), ...arr(lit)])].sort(); };
    const s = mem.state;
    const run = async (query: SQL) => {
        const { sql: raw, params: p } = dialect.sqlToQuery(query);
        const text = raw.replace(/\s+/g, " ").trim();
        s.log.push(text.slice(0, 60));
        // 진짜 DB 는 읽은 줄을 사본으로 준다 — 같은 객체를 건네면 '고치기 전 값'이 고친 뒤 값으로 보인다
        const rows = (r: any[]) => ({ rows: r.map((x) => ({ ...x })) });
        // ── 이름 ──
        if (text.startsWith("select name, aliases, club_id from golf_course_pages where slug = $1 for update")) { const g = s.pages.get(p[0] as string); return rows(g ? [g] : []); }
        if (text.startsWith("select slug from golf_course_pages where slug <> $1 and lower(regexp_replace(name")) {
            return rows([...s.pages.entries()].filter(([slug, g]) => slug !== p[0] && key(g.name) === p[1]).map(([slug]) => ({ slug })));
        }
        if (text.startsWith("select name from rankue_golf_clubs where id = $1::uuid for update")) { const c = s.clubs.get(p[0] as string); return rows(c ? [c] : []); }
        if (text.startsWith("select 1 as x from golf_course_pages where club_id = $1::uuid and slug <> $2")) {
            return rows([...s.pages.entries()].some(([slug, g]) => g.club_id === p[0] && slug !== p[1]) ? [{ x: 1 }] : []);
        }
        if (text.startsWith("select 1 as x from golf_match_sessions where course_id = $1")) return rows(s.live.has(p[0] as string) ? [{ x: 1 }] : []);
        if (text.startsWith("update rankue_golf_clubs set name = $1, updated_at = now() where id = $2::uuid")) { s.clubs.get(p[1] as string).name = p[0]; return rows([]); }
        if (text.startsWith("update golf_course_pages set name = $1, aliases = $2::text[], admin_keep =")) {
            const g = s.pages.get(p[3] as string); g.name = p[0]; g.aliases = arr(p[1] as string); keep(g, p[2] as string); return rows([]);
        }
        // ── 좌표 ──
        if (text.startsWith("select name, latitude, longitude from rankue_golf_clubs where id = $1::uuid for update")) { const c = s.clubs.get(p[0] as string); return rows(c ? [c] : []); }
        if (text.startsWith("select lat, lng, club_id from golf_course_pages where slug = $1 for update")) { const g = s.pages.get(p[0] as string); return rows(g ? [g] : []); }
        if (text.startsWith("update rankue_golf_clubs set latitude = $1, longitude = $2, updated_at = now() where id = $3::uuid returning")) {
            const c = s.clubs.get(p[2] as string); if (!c) return rows([]); c.latitude = p[0]; c.longitude = p[1]; return rows([{ latitude: c.latitude, longitude: c.longitude }]);
        }
        if (text.startsWith("update golf_course_pages set lat = $1, lng = $2, admin_keep =") && text.endsWith("where slug = $4")) {
            const g = s.pages.get(p[3] as string); g.lat = p[0]; g.lng = p[1]; keep(g, p[2] as string); return rows([]);
        }
        if (text.startsWith("select p.name, p.lat, p.lng, (c.id is not null) as has_club from golf_course_pages p left join rankue_golf_clubs c")) {
            const g = s.pages.get(p[0] as string); return rows(g ? [{ name: g.name, lat: g.lat, lng: g.lng, has_club: !!g.club_id && s.clubs.has(g.club_id) }] : []);
        }
        if (text.startsWith("update golf_course_pages set lat = $1, lng = $2, admin_keep =") && text.endsWith("where c.id = golf_course_pages.club_id) returning lat, lng")) {
            const g = s.pages.get(p[3] as string); if (!g || (g.club_id && s.clubs.has(g.club_id))) return rows([]); g.lat = p[0]; g.lng = p[1]; keep(g, p[2] as string); return rows([{ lat: g.lat, lng: g.lng }]);
        }
        // ── 홈페이지·전화·로고 ──
        if (text.startsWith("select website, phone, logo from golf_course_pages where slug = $1")) { const g = s.pages.get(p[0] as string); return rows(g ? [{ website: g.website, phone: g.phone, logo: g.logo }] : []); }
        if (text.startsWith("update golf_course_pages set ") && text.includes(" returning website, phone, logo")) {
            // 시험에서는 한 칸씩만 고친다: set <칸> = $1[, admin_keep = …$2…], updated_at = now() where slug = $N
            const col = text.match(/^update golf_course_pages set (\w+) = \$1/)![1];
            const g = s.pages.get(p[p.length - 1] as string);
            g[col] = p[0];
            if (text.includes("admin_keep =")) keep(g, p[1] as string);
            return rows([{ website: g.website, phone: g.phone, logo: g.logo }]);
        }
        throw new Error("시험에 없는 쿼리: " + text.slice(0, 140));
    };
    const db: any = { execute: run, transaction: async (cb: (tx: any) => unknown) => cb({ execute: run }) };
    return { db };
});

import { renameCourse, setClubCoords, setPageCoords, patchCoursePage } from "./adminGolfCourses";

const CLUB = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const page = (slug: string) => mem.state.pages.get(slug);

beforeEach(() => {
    const s = mem.state;
    s.log = [];
    s.live = new Set();
    s.clubs = new Map([
        [CLUB, { name: "고성컨트리클럽", latitude: 34.97, longitude: 128.32 }],
        [OTHER, { name: "다른골프장", latitude: null, longitude: null }],
    ]);
    s.pages = new Map([
        ["고성컨트리클럽", { name: "고성컨트리클럽", aliases: ["고성CC"], club_id: CLUB, lat: 35.06986, lng: 128.405289, admin_keep: [], website: "http://old.example/", phone: null, logo: null }],
        ["다른-골프장", { name: "다른 골프장", aliases: [], club_id: OTHER, lat: 36.1, lng: 127.9, admin_keep: [], website: null, phone: null, logo: null }],
        ["짝없는곳", { name: "짝없는곳", aliases: [], club_id: null, lat: null, lng: null, admin_keep: [], website: null, phone: null, logo: null }],
    ]);
});

describe("renameCourse — 골프장 이름 고치기", () => {
    it("이름을 바꾸고 옛 이름을 별칭에 남긴다 — '고친 칸'에 name 이 적힌다. 원장 이름은 시키지 않으면 그대로", async () => {
        const r = await renameCourse("고성컨트리클럽", "고성노벨컨트리클럽", "고성컨트리클럽", false);
        expect(r).toEqual({ ok: true, before: "고성컨트리클럽", after: "고성노벨컨트리클럽", aliases: ["고성CC", "고성컨트리클럽"], club: null, unchanged: false });
        expect(page("고성컨트리클럽")).toMatchObject({ name: "고성노벨컨트리클럽", aliases: ["고성CC", "고성컨트리클럽"], admin_keep: ["name"] });
        expect(mem.state.clubs.get(CLUB).name).toBe("고성컨트리클럽");
    });

    it("alsoClub: 경기 시작 화면의 이름(원장)도 같이 바꾼다", async () => {
        const r = await renameCourse("고성컨트리클럽", "고성노벨컨트리클럽", undefined, true);
        expect(r).toMatchObject({ ok: true, club: { id: CLUB, before: "고성컨트리클럽", after: "고성노벨컨트리클럽" } });
        expect(mem.state.clubs.get(CLUB).name).toBe("고성노벨컨트리클럽");
    });

    it("옛 이름이 이미 별칭에 있으면 또 넣지 않는다 · 새 이름과 같은 별칭은 뺀다(이름이 화면에 두 번 나온다)", async () => {
        page("고성컨트리클럽").aliases = ["고성 컨트리클럽", "고성노벨CC"];
        const r = await renameCourse("고성컨트리클럽", "고성노벨CC", undefined, false);
        expect(r.ok && r.aliases).toEqual(["고성 컨트리클럽"]);
    });

    it("그 사이 이름이 바뀌었으면(expected 불일치) 쓰지 않고 지금 이름을 돌려준다", async () => {
        const r = await renameCourse("고성컨트리클럽", "새 이름", "옛날에 본 이름", true);
        expect(r).toEqual({ ok: false, reason: "changed", current: "고성컨트리클럽" });
        expect(page("고성컨트리클럽").name).toBe("고성컨트리클럽");
        expect(mem.state.clubs.get(CLUB).name).toBe("고성컨트리클럽");
    });

    it("같은 이름의 다른 골프장 페이지가 있으면 막는다 — 띄어쓰기·대소문자만 달라도", async () => {
        expect(await renameCourse("고성컨트리클럽", "다른골프장", undefined, false)).toEqual({ ok: false, reason: "taken" });
        expect(await renameCourse("고성컨트리클럽", " 다른  골프장 ".trim(), undefined, false)).toEqual({ ok: false, reason: "taken" });
        expect(page("고성컨트리클럽").admin_keep).toEqual([]);
    });

    it("원장 이름은 — 진행 중 경기가 있거나 다른 페이지가 그 원장을 같이 쓰면 바꾸지 않는다(페이지 이름도 쓰지 않는다: 반만 바뀌지 않게)", async () => {
        mem.state.live.add(CLUB);
        expect(await renameCourse("고성컨트리클럽", "고성노벨컨트리클럽", undefined, true)).toEqual({ ok: false, reason: "club-live" });
        mem.state.live.clear();
        mem.state.pages.set("고성-퍼블릭", { name: "고성 퍼블릭", aliases: [], club_id: CLUB, lat: 1, lng: 1, admin_keep: [] });
        expect(await renameCourse("고성컨트리클럽", "고성노벨컨트리클럽", undefined, true)).toEqual({ ok: false, reason: "club-shared" });
        expect(page("고성컨트리클럽").name).toBe("고성컨트리클럽");
        expect(mem.state.clubs.get(CLUB).name).toBe("고성컨트리클럽");
        // alsoClub 을 풀면 페이지 이름만 바뀐다
        expect((await renameCourse("고성컨트리클럽", "고성노벨컨트리클럽", undefined, false)).ok).toBe(true);
    });

    it("페이지 이름은 그대로이고 원장 이름만 다를 때 — 원장 이름만 맞춘다(페이지는 건드리지 않는다)", async () => {
        mem.state.clubs.get(CLUB).name = "고성CC(구)";
        const r = await renameCourse("고성컨트리클럽", "고성컨트리클럽", "고성컨트리클럽", true);
        expect(r).toMatchObject({ ok: true, unchanged: false, club: { before: "고성CC(구)", after: "고성컨트리클럽" } });
        expect(page("고성컨트리클럽").admin_keep).toEqual([]);
        // 둘 다 이미 같으면 아무것도 쓰지 않는다
        const again = await renameCourse("고성컨트리클럽", "고성컨트리클럽", undefined, true);
        expect(again).toMatchObject({ ok: true, unchanged: true, club: null });
    });

    it("없는 골프장 · 원장에 짝이 없는 골프장", async () => {
        expect(await renameCourse("없는곳", "이름", undefined, false)).toEqual({ ok: false, reason: "gone" });
        const r = await renameCourse("짝없는곳", "짝없는 골프장", undefined, true);
        expect(r).toMatchObject({ ok: true, club: null, aliases: ["짝없는곳"] });
    });
});

describe("setClubCoords — 원장 좌표를 고치면 골프장 페이지 좌표도 같이", () => {
    it("slug 를 주면 그 페이지의 좌표도 같은 값으로 — '고친 칸'에 coords 가 적힌다", async () => {
        const r = await setClubCoords(CLUB, 34.9712345, 128.3212345, "고성컨트리클럽");
        expect(r).toEqual({
            ok: true, name: "고성컨트리클럽", before: { lat: 34.97, lng: 128.32 }, after: { lat: 34.9712345, lng: 128.3212345 },
            page: { slug: "고성컨트리클럽", before: { lat: 35.06986, lng: 128.405289 } },
        });
        expect(mem.state.clubs.get(CLUB)).toMatchObject({ latitude: 34.9712345, longitude: 128.3212345 });
        expect(page("고성컨트리클럽")).toMatchObject({ lat: 34.9712345, lng: 128.3212345, admin_keep: ["coords"] });
    });

    it("같은 원장을 쓰는 다른 페이지는 건드리지 않는다(잘못 같이 가리키는 페이지가 있다)", async () => {
        mem.state.pages.set("고성-퍼블릭", { name: "고성 퍼블릭", aliases: [], club_id: CLUB, lat: 1, lng: 1, admin_keep: [] });
        await setClubCoords(CLUB, 34.98, 128.33, "고성컨트리클럽");
        expect(page("고성-퍼블릭")).toMatchObject({ lat: 1, lng: 1, admin_keep: [] });
    });

    it("그 페이지가 이 원장에 붙어 있지 않으면 아무것도 쓰지 않는다 — 원장 좌표도", async () => {
        expect(await setClubCoords(CLUB, 34.98, 128.33, "다른-골프장")).toEqual({ ok: false, reason: "page-mismatch" });
        expect(await setClubCoords(CLUB, 34.98, 128.33, "없는곳")).toEqual({ ok: false, reason: "page-mismatch" });
        expect(mem.state.clubs.get(CLUB)).toMatchObject({ latitude: 34.97, longitude: 128.32 });
    });

    it("slug 없이 부르면 예전처럼 원장 좌표만", async () => {
        const r = await setClubCoords(CLUB, 34.98, 128.33);
        expect(r).toMatchObject({ ok: true, page: null });
        expect(page("고성컨트리클럽")).toMatchObject({ lat: 35.06986, lng: 128.405289, admin_keep: [] });
        expect(await setClubCoords("33333333-3333-4333-8333-333333333333", 34.98, 128.33)).toEqual({ ok: false, reason: "gone" });
    });
});

describe("setPageCoords — 원장에 짝이 없는 페이지의 좌표", () => {
    it("짝이 없는 페이지만 고친다 — 짝이 있으면 원장 좌표를 고쳐야 한다(두 좌표가 따로 놀지 않게)", async () => {
        expect(await setPageCoords("짝없는곳", 35.5, 127.5)).toEqual({ ok: true, name: "짝없는곳", before: { lat: null, lng: null }, after: { lat: 35.5, lng: 127.5 } });
        expect(page("짝없는곳")).toMatchObject({ lat: 35.5, lng: 127.5, admin_keep: ["coords"] });
        expect(await setPageCoords("고성컨트리클럽", 35.5, 127.5)).toEqual({ ok: false, reason: "has-club" });
        expect(await setPageCoords("없는곳", 35.5, 127.5)).toEqual({ ok: false, reason: "gone" });
        expect(page("고성컨트리클럽").lat).toBe(35.06986);
        // 원장 줄이 지워진 페이지(club_id 만 남음)는 짝이 없는 것으로 본다 — 좌표를 고칠 길이 막히지 않게
        mem.state.pages.set("원장-지워짐", { name: "원장 지워짐", aliases: [], club_id: "99999999-9999-4999-8999-999999999999", lat: 1, lng: 1, admin_keep: [] });
        expect((await setPageCoords("원장-지워짐", 36.5, 128.5)).ok).toBe(true);
        expect(page("원장-지워짐")).toMatchObject({ lat: 36.5, lng: 128.5, admin_keep: ["coords"] });
    });
});

describe("patchCoursePage — 고친 홈페이지·전화는 '고친 칸'으로 적힌다", () => {
    it("홈페이지를 고치면(지운 것 포함) website 가, 전화를 고치면 phone 이 적힌다", async () => {
        await patchCoursePage("고성컨트리클럽", { website: "https://new.example/" });
        expect(page("고성컨트리클럽")).toMatchObject({ website: "https://new.example/", admin_keep: ["website"] });
        await patchCoursePage("고성컨트리클럽", { phone: "055-000-0000" });
        expect(page("고성컨트리클럽").admin_keep).toEqual(["phone", "website"]);
        await patchCoursePage("고성컨트리클럽", { website: null });
        expect(page("고성컨트리클럽")).toMatchObject({ website: null, admin_keep: ["phone", "website"] });
    });

    it("로고만 고칠 때는 적지 않는다 — 올린 로고는 주소 꼴로 남긴다(shared/golfLogo.ts)", async () => {
        await patchCoursePage("고성컨트리클럽", { logo: null });
        expect(page("고성컨트리클럽").admin_keep).toEqual([]);
    });
});
