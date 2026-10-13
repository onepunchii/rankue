/**
 * 내 사진첩(2026-10-13 오너: "도장첩에 사진첩 버튼 … 사진으로 해당 산을 볼 수 있어야") — 산마다 흩어진 내 산행 사진을 한 곳에.
 * 묶는 셈은 그대로 부르고, 길 · 화면은 소스의 모양을 고정한다(DB 없이):
 *   내 사진만 · 올린 사람만 읽는다 · 좌표 없음 · 사진첩은 보는 곳(올리기 · 지우기는 산 화면) · 도장첩의 기본은 도장.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
    HIKING_ALBUM_LABEL, HIKING_ALBUM_MAX, HIKING_ALBUM_PATH, albumAllPhotos, albumCountLine, albumCover, albumMonths, albumPhotoCount, albumSlots, albumThumbs,
    groupHikingAlbum, hikingAlbumMountainPath, type AlbumMountainInfo,
} from "./hikingAlbum";
import { HIKING_PHOTOS_ANCHOR, type HikingPhoto } from "./hikingPhotos";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");

const photo = (id: string, mountainId: string, takenAt: string, more: Partial<HikingPhoto> = {}): HikingPhoto => ({
    id, mountainId, url: `https://x/${id}.webp`, thumbUrl: `https://x/${id}-t.webp`, width: 1600, height: 1200, takenAt, isPublic: true, hidden: false, appealed: false, ...more,
});
const MOUNTAINS: AlbumMountainInfo[] = [
    { id: "m-seorak", slug: "설악산", name: "설악산", heightM: 1708, region: "gangwon" },
    { id: "m-jiri", slug: "지리산", name: "지리산", heightM: 1915, region: "gyeongnam" },
    { id: "m-jiri2", slug: "지리산-통영", name: "지리산", heightM: 398, region: "gyeongnam" },
];
const of = (id: string) => MOUNTAINS.find((m) => m.id === id);

describe("산마다 묶기", () => {
    const photos = [
        photo("a", "m-seorak", "2026-10-03T01:00:00.000Z"),
        photo("b", "m-jiri", "2026-10-11T02:00:00.000Z", { isPublic: false }),
        photo("c", "m-seorak", "2026-09-20T05:00:00.000Z", { hidden: true, appealed: true }),
        photo("d", "m-gone", "2026-10-12T00:00:00.000Z"),
        photo("e", "m-seorak", "2026-10-05T09:30:00.000Z"),
    ];

    it("산은 마지막으로 올린 때가 새로운 것부터, 사진은 새 것부터 — 넘겨받은 순서를 믿지 않는다", () => {
        const album = groupHikingAlbum(photos, of);
        expect(album.mountains.map((m) => m.slug)).toEqual(["지리산", "설악산"]);
        expect(album.mountains[1].photos.map((p) => p.id)).toEqual(["e", "a", "c"]);
        expect(album.mountains[1]).toMatchObject({ mountainId: "m-seorak", name: "설악산", heightM: 1708, region: "gangwon", count: 3, latestAt: "2026-10-05T09:30:00.000Z" });
        expect(album.mountains[0]).toMatchObject({ count: 1, latestAt: "2026-10-11T02:00:00.000Z" });
        expect(album.capped).toBe(false);
    });

    it("산의 표에 없는 산의 사진은 뺀다 — 수에도 들지 않는다", () => {
        const album = groupHikingAlbum(photos, of);
        expect(album.total).toBe(4);
        expect(album.mountains.flatMap((m) => m.photos).some((p) => p.id === "d")).toBe(false);
        expect(groupHikingAlbum(photos, () => null)).toEqual({ total: 0, mountains: [], capped: false });
        expect(groupHikingAlbum([], of)).toEqual({ total: 0, mountains: [], capped: false });
    });

    it("비공개 · 가려진 사진도 싣는다(올린 사람의 사진첩이다) — 상태가 그대로 따라온다", () => {
        const all = groupHikingAlbum(photos, of).mountains.flatMap((m) => m.photos);
        expect(all.find((p) => p.id === "b")).toMatchObject({ isPublic: false, hidden: false });
        expect(all.find((p) => p.id === "c")).toMatchObject({ hidden: true, appealed: true });
    });

    it("끝이 있다 — 넘으면 새 것부터 싣고 capped 로 알린다. 끝은 HIKING_ALBUM_MAX 를 넘지 못한다", () => {
        const cut = groupHikingAlbum(photos, of, 2);
        // 새 것 둘은 d(없는 산) · b — 없는 산의 것은 빠져 한 장만 남는다
        expect(cut).toMatchObject({ total: 1, capped: true });
        expect(cut.mountains.map((m) => m.slug)).toEqual(["지리산"]);
        expect(HIKING_ALBUM_MAX).toBe(600);
        const many = Array.from({ length: HIKING_ALBUM_MAX + 1 }, (_, i) => photo(`p${i}`, "m-seorak", new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()));
        const big = groupHikingAlbum(many, of, 5000);
        expect(big.total).toBe(HIKING_ALBUM_MAX);
        expect(big.capped).toBe(true);
        // 빠지는 것은 가장 오래된 한 장이다
        expect(big.mountains[0].photos[0].id).toBe(`p${HIKING_ALBUM_MAX}`);
        expect(big.mountains[0].photos.some((p) => p.id === "p0")).toBe(false);
        expect(groupHikingAlbum(many.slice(0, HIKING_ALBUM_MAX), of).capped).toBe(false);
    });

    it("같은 사진이 두 번 와도 한 번만 — 형제 칸의 key 가 겹치지 않는다", () => {
        const album = groupHikingAlbum([...photos, photos[0]], of);
        const ids = album.mountains.flatMap((m) => m.photos.map((p) => p.id));
        expect(new Set(ids).size).toBe(ids.length);
        expect(album.total).toBe(4);
    });

    it("좌표 · 올린 사람은 딸려 나가지 않는다 — 사진의 칸을 하나씩 골라 담는다", () => {
        const rich = { ...photo("z", "m-seorak", "2026-10-01T00:00:00.000Z"), lat: 38.1, lng: 128.4, memberId: "someone", name: "누구" } as HikingPhoto;
        const album = groupHikingAlbum([rich], (id) => ({ ...of(id)!, lat: 38.1, lng: 128.4 } as AlbumMountainInfo));
        expect(Object.keys(album.mountains[0].photos[0]).sort()).toEqual(["appealed", "height", "hidden", "id", "isPublic", "mountainId", "takenAt", "thumbUrl", "url", "width"]);
        expect(Object.keys(album.mountains[0]).sort()).toEqual(["count", "heightM", "latestAt", "mountainId", "name", "photos", "region", "slug"]);
        expect(JSON.stringify(album)).not.toMatch(/38\.1|128\.4|someone|누구/);
    });
});

describe("표지 · 전체 보기 · 달 · 도장첩의 칸", () => {
    const album = groupHikingAlbum([
        photo("h", "m-seorak", "2026-10-12T00:00:00.000Z", { hidden: true }),
        photo("a", "m-seorak", "2026-10-03T01:00:00.000Z"),
        photo("b", "m-jiri", "2026-10-11T02:00:00.000Z", { isPublic: false }),
        // 한국 시각으로는 10월 1일 새벽이다(UTC 9월 30일 16시)
        photo("k", "m-jiri", "2026-09-30T16:00:00.000Z"),
        photo("o", "m-jiri2", "2025-12-31T14:59:00.000Z", { hidden: true }),
    ], of);

    it("표지는 가장 새 사진 — 가려진 사진은 뒤로 미루고, 가려진 것뿐이면 그것이라도", () => {
        expect(albumCover(album.mountains[0].photos)?.id).toBe("a");
        expect(albumCover(album.mountains.find((m) => m.slug === "지리산-통영")!.photos)?.id).toBe("o");
        expect(albumCover([])).toBeNull();
    });

    it("전체 보기는 새 것부터, 달은 한국 시각으로 나눈다", () => {
        const all = albumAllPhotos(album);
        expect(all.map((p) => p.id)).toEqual(["h", "b", "a", "k", "o"]);
        const months = albumMonths(all);
        expect(months.map((m) => [m.month, m.photos.map((p) => p.id)])).toEqual([["2026년 10월", ["h", "b", "a", "k"]], ["2025년 12월", ["o"]]]);
        // 달의 이름이 겹치지 않는다(구역의 key) · 때를 읽을 수 없는 사진은 맨 끝의 한 묶음
        const odd = albumMonths([photo("x", "m-jiri", "모름"), ...all, photo("y", "m-jiri", "")]);
        expect(new Set(odd.map((m) => m.month)).size).toBe(odd.length);
        expect(odd[odd.length - 1]).toMatchObject({ month: HIKING_ALBUM_LABEL.noDate });
        expect(odd[odd.length - 1].photos.map((p) => p.id)).toEqual(["x", "y"]);
    });

    it("입구의 작은 사진 — 새 것부터 석 장, 가려진 사진은 뺀다", () => {
        expect(albumThumbs(album).map((p) => p.id)).toEqual(["b", "a", "k"]);
        expect(albumThumbs(album, 1).map((p) => p.id)).toEqual(["b"]);
        expect(albumThumbs({ mountains: [] })).toEqual([]);
    });

    it("도장첩의 칸 — 산의 id 로 사진 수 · 표지 · 사진첩 주소의 산", () => {
        const slots = albumSlots(album);
        expect(slots.get("m-seorak")).toMatchObject({ slug: "설악산", count: 2 });
        expect(slots.get("m-seorak")!.cover.id).toBe("a");
        expect(slots.has("m-gone")).toBe(false);
        expect(albumSlots(null).size).toBe(0);
    });

    it("주소 · 글", () => {
        expect(HIKING_ALBUM_PATH).toBe("/hiking/album");
        expect(hikingAlbumMountainPath("지리산-통영")).toBe(`/hiking/album?m=${encodeURIComponent("지리산-통영")}`);
        expect(new URLSearchParams(hikingAlbumMountainPath("지리산-통영").split("?")[1]).get("m")).toBe("지리산-통영");
        expect(albumCountLine(3, 1204)).toBe("산 3곳 · 사진 1,204장");
        expect(albumPhotoCount(12)).toBe("사진 12장");
        expect(HIKING_ALBUM_LABEL.title).toBe("내 사진첩");
        expect(HIKING_ALBUM_LABEL.manage).toBe("이 산에서 사진 올리기 · 관리");
        expect(HIKING_ALBUM_LABEL.capped).toContain(`${HIKING_ALBUM_MAX}장`);
        expect(JSON.stringify(HIKING_ALBUM_LABEL)).not.toMatch(/\p{Extended_Pictographic}/u);
        // 등산의 말만 쓴다
        expect(JSON.stringify(HIKING_ALBUM_LABEL)).not.toMatch(/골프|라운드|당구|볼마커/);
    });
});

describe("길 — 올린 사람만 읽는다", () => {
    const route = code(read("server/routes/modules/hiking.ts"));
    const line = route.split("\n").find((l) => l.startsWith('router.get("/me/album"'));
    const body = route.slice(route.indexOf('router.get("/me/album"'), route.indexOf('router.post("/photos"'));

    it("내 사진과 같은 문(등산을 쓸 수 있는 회원) · 저장하지 않는 답", () => {
        expect(line).toBeTruthy();
        expect(line).toContain("...requireHikingAccess");
        expect(body).toContain('res.set("Cache-Control", "no-store");');
        // 누구나 여는 길(/mountains/:slug/photos)보다 뒤, 올리는 길보다 앞 — 사진의 길 안에 있다
        expect(route.indexOf('router.get("/me/photos"')).toBeLessThan(route.indexOf('router.get("/me/album"'));
    });

    it("내 것만 읽고(회원 id 는 로그인에서), 끝보다 한 장 더 읽어 넘쳤는지를 안다", () => {
        expect(body).toContain("await listPhotos(req.userId!, null, HIKING_ALBUM_MAX + 1)");
        expect(body).not.toMatch(/req\.(?:query|params|body)/);
        expect(body).toContain("groupHikingAlbum(photos,");
        // 올린 사람의 길(모든 질의에 member_id 조건)을 쓴다 — 누구나 보는 길 · 운영자의 길이 아니다
        expect(body).not.toMatch(/listMountainPhotos|getMany|hikingPhotos\./);
    });

    it("산의 값은 이름 · 높이 · 권역만 붙인다 — 자리는 싣지 않는다", () => {
        expect(body).toContain("{ id: m.id, slug: m.slug, name: m.name, heightM: m.heightM, region: m.region }");
        expect(body).not.toMatch(/\.lat\b|\.lng\b|coords|accuracy|sigungu|sido/);
        expect(code(read("shared/hikingAlbum.ts"))).not.toMatch(/\blat\b|\blng\b|latitude|longitude|memberId|credit/);
    });

    it("서버가 임포트하는 shared 파일 — 상대 임포트는 './x.js'", () => {
        const src = read("shared/hikingAlbum.ts");
        for (const m of src.matchAll(/from "(\.[^"]+)"/g)) expect(m[1], m[1]).toMatch(/^\.\/[\w.-]+\.js$/);
        expect(read("server/routes/modules/hiking.ts")).toContain('from "../../../shared/hikingAlbum.js";');
    });
});

describe("화면 — 사진첩은 보는 곳이다", () => {
    const page = read("client/src/hiking/pages/AlbumPage.tsx");
    const parts = read("client/src/hiking/album/AlbumParts.tsx");
    const hook = read("client/src/hiking/album/useHikingAlbum.ts");
    const albumFiles = ["client/src/hiking/pages/AlbumPage.tsx", ...readdirSync(resolve(__dirname, "../client/src/hiking/album")).map((f) => `client/src/hiking/album/${f}`)];

    it("올리기 · 공개/비공개 · 지우기 · 이의제기를 그리지 않는다 — 산 화면에 그대로 둔다", () => {
        expect(albumFiles.length).toBeGreaterThanOrEqual(3);
        for (const f of albumFiles) {
            const src = code(read(f));
            expect(src, f).not.toMatch(/uploadHikingPhoto|deleteHikingPhoto|setHikingPhotoPublic|appealHikingPhoto|useMutation|apiRequest/);
            expect(src, f).not.toMatch(/type="file"|hk-photo-(?:add|delete|input|appeal|public|private)|MyPhotos|appConfirm/);
        }
        // 크게 보기에 오른쪽 위 단추(지우기 · 신고)를 넘기지 않는다
        expect(code(parts)).toContain("<PhotoStage photos={photos} index={at}");
        expect(code(parts)).not.toMatch(/action=\{/);
    });

    it("그리로 가는 길은 둔다 — 그 산의 화면, 내 사진 구역", () => {
        expect(parts).toContain("export const mountainPhotosPath = (slug: string) => `${hikingMountainPath(slug)}#${HIKING_PHOTOS_ANCHOR}`;");
        expect(HIKING_PHOTOS_ANCHOR).toBe("sec-photos");
        expect(page).toContain('<Link href={mountainPhotosPath(m.slug)} className={`mt-3.5 ${quiet}`} data-testid="hk-album-manage" data-track-as="hiking-album-manage">');
        expect(page).toContain("{HIKING_ALBUM_LABEL.manage}");
    });

    it("산마다가 기본이고, 그 산을 펼친 화면은 주소(?m=)에 둔다", () => {
        expect(page).toContain('const [view, setView] = useState<AlbumView>("mountains");');
        expect(page).toContain('const slug = new URLSearchParams(useSearch()).get("m");');
        expect(page).toContain("<Link href={hikingAlbumMountainPath(m.slug)}");
        expect(page).toContain("HIKING_ALBUM_COVER");
        expect(page).toContain("HIKING_ALBUM_EMPTY");
        const theme = read("client/src/hiking/theme.ts");
        expect(theme).toContain('export const HIKING_ALBUM_COVER = "/hiking/art/album-cover.webp";');
        expect(theme).toContain('export const HIKING_ALBUM_EMPTY = "/hiking/art/album-empty.webp";');
        // 꾸밈 그림이라 읽어 주지 않는다
        expect(page).toContain('<img src={HIKING_ALBUM_COVER} alt=""');
        expect(page).toContain('<img src={HIKING_ALBUM_EMPTY} alt=""');
    });

    it("내 사진만 — 등산을 쓰는 회원만 묻고, 남의 사진 · 이름을 읽는 길을 쓰지 않는다", () => {
        expect(hook).toContain("const mine = useHikingAccess();");
        expect(hook).toContain("useQuery<HikingAlbum>({ queryKey: HIKING_ALBUM_KEY, enabled: mine,");
        for (const f of albumFiles) expect(code(read(f)), f).not.toMatch(/fetchMountainPhotos|mountainPhotosKey|MountainPhoto\b|credit|memberId/);
        expect(page).toContain("if (!mine) {");
        expect(code(parts)).toContain("if (!mine) return null;");
    });

    it("비공개에는 자물쇠, 가려진 사진에는 '가려짐' — 산 화면의 내 사진과 같은 표시", () => {
        expect(parts).toContain("if (photo.hidden) return <span");
        expect(parts).toContain(">가려짐</span>");
        expect(parts).toContain('<LucideLock weight="fill" className="h-3 w-3" aria-hidden />');
        expect(read("client/src/hiking/photos/MyPhotos.tsx")).toContain('<LucideLock weight="fill" className="h-3 w-3" aria-hidden />');
    });

    it("사진 하나가 바뀌면 사진첩도 다시 받는다", () => {
        const api = read("client/src/hiking/photos/photoApi.ts");
        expect(api).toContain('const MY_ALBUM_URL = "/api/hiq/hiking/me/album";');
        expect(api).toContain("export const HIKING_ALBUM_KEY = [MY_ALBUM_URL] as const;");
        expect(api).toContain("(key.startsWith(MY_PHOTOS_URL) || key.startsWith(MY_ALBUM_URL))");
        expect(api).toContain("void qc.invalidateQueries({ predicate: (q) => isMyPhotosKey(q.queryKey[0]) });");
    });

    it("화면 라우트만 있다 — 회원의 화면이라 검색용 화면 · 봇 경로 · 사이트맵에 싣지 않는다", () => {
        const app = read("client/src/App.tsx");
        expect(app).toContain('const HikingAlbum = lazy(() => import("@/hiking/pages/AlbumPage"));');
        expect(app).toContain('<Route path="/hiking/album" component={HikingAlbumRoute} />');
        expect(read("vercel.json")).not.toMatch(/hiking[^"]*album/);
        expect(read("server/seo/hiking.ts")).not.toMatch(/album/i);
        expect(read("server/sitemap.ts")).not.toMatch(/hiking\/album/);
    });

    it("등산 화면의 규칙 — 리터럴 색만 · 12px 아래 글자 없음 · 굵기는 semibold 까지 · 그림 글자 없음 · 다른 종목의 것을 빌리지 않는다", () => {
        for (const f of albumFiles.filter((x) => x.endsWith(".tsx"))) {
            const src = code(read(f));
            expect(src, f).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black|brand|ink-\d)\b/);
            expect([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((x) => Number(x[1]) >= 12), f).toBe(true);
            expect(src, f).not.toMatch(/\btext-(?:xs|\[1[01](?:\.\d+)?px\])/);
            expect(src, f).not.toMatch(/font-(?:bold|extrabold|black)\b/);
            expect(src, f).not.toMatch(/\bwindow\.(?:confirm|alert)\(|[^a-zA-Z.]confirm\(|[^a-zA-Z.]alert\(/);
            expect(src, f).not.toMatch(/\p{Extended_Pictographic}/u);
            expect(src, f).not.toMatch(/@\/golf|golf\/|golfPhoto|GolfPhoto|sim\/|TierEmblem|볼마커|geolocation|coords/);
        }
    });

    it("누르는 것마다 이름이 있다 — 이동하는 것은 hiking-album-…", () => {
        for (const f of albumFiles.filter((x) => x.endsWith(".tsx"))) {
            const src = code(read(f));
            // <Link …> 마다 data-track-as 와 data-testid
            for (const tag of src.match(/<Link\b[^>]*>/g) ?? []) {
                expect(tag, `${f}: ${tag.slice(0, 80)}`).toMatch(/data-track-as=(?:"hiking-album-[a-z-]+"|\{`hiking-album-[a-z-]+\$\{from\}`\})/);
                expect(tag, `${f}: ${tag.slice(0, 80)}`).toContain("data-testid=");
            }
        }
    });
});

describe("도장첩에서 들어오는 길", () => {
    const shelf = read("client/src/hiking/pages/StampShelf.tsx");
    const book = read("client/src/hiking/pages/StampBookPage.tsx");
    const parts = read("client/src/hiking/album/AlbumParts.tsx");

    it("책장 맨 위에 입구 — 등산을 쓰는 회원에게만 그려진다", () => {
        expect(shelf).toContain('<AlbumEntry from="shelf" className="mt-2.5" />');
        expect(shelf.indexOf("<AlbumEntry")).toBeLessThan(shelf.indexOf("{SERIES.map((kind) => {"));
        expect(parts).toContain("<Link href={HIKING_ALBUM_PATH} data-testid=\"hk-album-entry\" data-track-as={`hiking-album-entry-${from}`}");
        expect(parts).toContain("albumThumbs(album, 3)");
        expect(read("client/src/hiking/pages/PackPage.tsx")).toContain('<AlbumEntry from="pack" className="mt-2.5" />');
    });

    it("한 권의 도장 | 사진 — 기본은 도장이고, 이 권의 산에 내 사진이 있을 때만 전환 단추가 생긴다", () => {
        expect(book).toContain('const [mode, setMode] = useState<"stamp" | "photo">("stamp");');
        expect(book).toContain("const hasPhoto = s.mine && slots.some((x) => photoOf.has(x.m.id));");
        expect(book).toContain('const photoMode = hasPhoto && mode === "photo";');
        expect(book).toContain("{hasPhoto && (");
        // 주소 · 기기에 기억해 두지 않는다 — 다시 열면 도장이다
        expect(code(book)).not.toMatch(/localStorage|sessionStorage/);
    });

    it("사진으로 보면 — 사진이 있는 칸은 사진첩의 그 산으로, 없는 칸은 도장을 흐리게 두고 산 화면으로", () => {
        expect(book).toContain("const photo = photoMode ? photoOf.get(x.m.id) : undefined;");
        expect(book).toContain("<Link key={x.m.id} href={hikingAlbumMountainPath(photo.slug)}");
        expect(book).toContain('data-photo="1" data-track-as="hiking-album-slot"');
        expect(book).toContain("style={photoMode ? { opacity: 0.4 } : undefined}");
        // 정상 도장과 같은 비율의 칸
        expect(parts).toContain('aspectRatio: "100 / 124"');
        expect(read("client/src/hiking/stamps/SummitStamp.tsx")).toContain('aspectRatio: "100 / 124"');
        expect(parts).toContain("{slot.count > 1 && <span");
    });

    it("그림은 뒤에 넣는다 — 주소만 맞춰 둔다(있으면 webp)", () => {
        for (const n of ["album-cover", "album-empty"]) {
            const file = resolve(__dirname, `../client/public/hiking/art/${n}.webp`);
            // 아직 없을 수 있다 — 있으면 빈 파일이 아니어야 한다
            if (existsSync(file)) expect(readFileSync(file).length, n).toBeGreaterThan(1000);
        }
    });
});
