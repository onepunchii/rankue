import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
    MOUNTAIN_CARD, MOUNTAIN_CARD_COPY, MOUNTAIN_PICKER_COPY, MOUNTAIN_QUERY_MAX, MOUNTAIN_SEARCH_COPY, MOUNTAIN_SLUG_MAX, POLL_MOUNTAIN_COPY,
    addPollMountain, buildMountainCard, mountainCardCourses, mountainCardFacts, mountainCardPushTitle, mountainCardSlug, mountainCardSummary,
    mountainHitLabels, mountainHitWhere, mountainSearchNote, pollMountainAddedNote, pollMountainFailNote, pollMountainFullNote, pollMountainRoom, pollOptionKey,
    rankMountainHits, readMountainCard, readMountainHits, splitMountainSearch, toMountainHit,
    type MountainCardSource, type PollMountainPick,
} from "./hikingChat";
import { POLL_LIMITS, normalizePollOptions } from "./crewPoll";
import { hikingMountainPath } from "./hikingMountains";

const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 주석은 빼고 본다 — 규칙을 설명하는 주석이 규칙을 지킨 것처럼 보이면 안 된다(JSX 주석 · 줄 주석). 이미 읽어 둔 글에 쓴다 */
const code2 = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");
const code = (f: string) => code2(read(f));

const seorak: MountainCardSource = { id: "mt-seorak", slug: "설악산", name: "설악산", heightM: 1708, region: "gangwon", sido: "강원특별자치도", sigungu: "양양군", lists: ["kfs100", "nationalparks"], courses: 3, minKm: 4.2, maxKm: 11.04 };
const tongyeong: MountainCardSource = { id: "mt-jiri-ty", slug: "지리산-통영", name: "지리산", heightM: 398.6, region: "gyeongnam", sido: "경상남도", sigungu: "통영시", lists: [], courses: 0, minKm: null, maxKm: null };

describe("산 카드 — 서버가 산 표에서 읽은 줄로만 만든다", () => {
    it("요청의 본문에서는 주소(slug) 하나만 읽는다", () => {
        expect(mountainCardSlug({ slug: "설악산" })).toBe("설악산");
        expect(mountainCardSlug({ slug: "  지리산-통영 " })).toBe("지리산-통영");
        // 이름 · 높이를 같이 보내도 돌아오는 것은 주소뿐이다
        expect(mountainCardSlug({ slug: "설악산", name: "가짜산", heightM: 9999 })).toBe("설악산");
        for (const bad of [undefined, null, "설악산", ["설악산"], {}, { slug: "" }, { slug: "   " }, { slug: 3 }, { slug: ["설악산"] }, { slug: { toString: () => "설악산" } },
            { slug: "설악 산" }, { slug: "a/b" }, { slug: "a\\b" }, { slug: "a?b" }, { slug: "a#b" }, { slug: "가".repeat(MOUNTAIN_SLUG_MAX + 1) }, { name: "설악산" }]) {
            expect(mountainCardSlug(bad), JSON.stringify(bad)).toBeNull();
        }
        expect(mountainCardSlug({ slug: "가".repeat(MOUNTAIN_SLUG_MAX) })).toHaveLength(MOUNTAIN_SLUG_MAX);
    });

    it("카드는 산 표의 줄 그대로 — 이름 · 높이 · 자리 · 100대 명산 · 코스 · 권역", () => {
        expect(buildMountainCard(seorak)).toEqual({
            mountainId: "mt-seorak", slug: "설악산", name: "설악산", heightM: 1708, place: "강원 양양군", region: "gangwon", kfs100: true, courses: 3, minKm: 4.2, maxKm: 11,
        });
        // 코스가 없으면 거리도 싣지 않는다. 높이는 미터로 반올림
        expect(buildMountainCard(tongyeong)).toEqual({
            mountainId: "mt-jiri-ty", slug: "지리산-통영", name: "지리산", heightM: 399, place: "경남 통영시", region: "gyeongnam", kfs100: false, courses: 0, minKm: null, maxKm: null,
        });
        expect(buildMountainCard({ ...seorak, heightM: null, sido: null, sigungu: null, region: null, courses: 0, minKm: 3, maxKm: 5 }))
            .toMatchObject({ heightM: null, place: "", region: null, courses: 0, minKm: null, maxKm: null });
    });

    it("화면이 이름 · 높이를 지어 보내도 카드에 들어가지 않는다 — 라우트와 같은 순서로 돌려 본다", () => {
        const table = new Map([[seorak.slug, seorak], [tongyeong.slug, tongyeong]]);
        // 라우트: slug = mountainCardSlug(req.body) → m = mountainBySlug(slug) → buildMountainCard(m)
        const send = (body: unknown) => { const slug = mountainCardSlug(body); const m = slug ? table.get(slug) : undefined; return m ? buildMountainCard(m) : null; };
        const forged = { slug: "설악산", name: "가짜산", heightM: 9999, place: "어딘가", region: "jeju", kfs100: false, courses: 99, minKm: 0.1, maxKm: 999, mountainId: "x", type: "GOLF_MATCH", metadata: { name: "가짜산" } };
        expect(send(forged)).toEqual(buildMountainCard(seorak));
        expect(JSON.stringify(send(forged))).not.toMatch(/가짜산|9999|어딘가|jeju|GOLF_MATCH/);
        // 없는 산 · 꼴이 어긋난 주소로는 카드가 생기지 않는다
        expect(send({ slug: "없는산" })).toBeNull();
        expect(send({ slug: "설악산?x=1" })).toBeNull();
        // buildMountainCard 는 산 표의 줄 하나만 받는다 — 요청의 값을 넘길 자리가 없다
        expect(buildMountainCard.length).toBe(1);
    });

    it("요약 한 줄(옛 앱 · 알림) — \"산 · 설악산\". 주소에 시군이 붙은 산은 그 시군까지", () => {
        expect(mountainCardSummary(buildMountainCard(seorak))).toBe("산 · 설악산");
        expect(mountainCardSummary(buildMountainCard(tongyeong))).toBe("산 · 지리산(통영)");
        expect(mountainCardPushTitle("[새벽 능선]")).toBe("[새벽 능선] · 산 공유");
        // 글자 그림을 쓰지 않는다
        expect(`${mountainCardSummary(seorak)}${mountainCardPushTitle("[새벽 능선]")}`).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it("카드의 두 줄 — \"1,708m · 강원 양양군\" · \"코스 3개 · 4.2~11km\"(코스가 있을 때만)", () => {
        const card = buildMountainCard(seorak);
        expect(mountainCardFacts(card)).toBe("1,708m · 강원 양양군");
        expect(mountainCardCourses(card)).toBe("코스 3개 · 4.2~11km");
        expect(mountainCardCourses(buildMountainCard({ ...seorak, courses: 1, minKm: 7.12, maxKm: 7.14 }))).toBe("코스 1개 · 7.1km");
        expect(mountainCardCourses(buildMountainCard({ ...seorak, courses: 2, minKm: null, maxKm: null }))).toBe("코스 2개");
        expect(mountainCardCourses(buildMountainCard(tongyeong))).toBe("");
        expect(mountainCardFacts({ heightM: null, place: "강원 양양군" })).toBe("강원 양양군");
        expect(mountainCardFacts({ heightM: 1708, place: "" })).toBe("1,708m");
        expect(mountainCardFacts({ heightM: null, place: "" })).toBe("");
    });

    it("받은 카드 읽기 — 서버가 만든 것은 그대로, 주소 · 이름이 없으면 그리지 않는다(요약 한 줄로)", () => {
        const card = buildMountainCard(seorak);
        // 저장될 때의 꼴: { type, ...card }
        expect(readMountainCard({ type: MOUNTAIN_CARD, ...card })).toEqual(card);
        expect(readMountainCard({ type: MOUNTAIN_CARD, ...buildMountainCard(tongyeong) })).toEqual(buildMountainCard(tongyeong));
        for (const bad of [null, undefined, "설악산", [], {}, { slug: "설악산" }, { name: "설악산" }, { slug: "설악 산", name: "설악산" }, { slug: "설악산", name: 3 }]) expect(readMountainCard(bad)).toBeNull();
        // 어긋난 값은 빈 값으로 — 그림 · 줄을 그리지 않을 뿐 카드는 선다
        expect(readMountainCard({ slug: "설악산", name: "설악산", heightM: "1708", kfs100: "yes", courses: -2, minKm: 3, maxKm: 5, region: 7 }))
            .toEqual({ mountainId: "", slug: "설악산", name: "설악산", heightM: null, place: "", region: null, kfs100: false, courses: 0, minKm: null, maxKm: null });
    });
});

describe("산 카드 라우트 — 산악회 방에서만, 본문은 주소 하나", () => {
    const src = code("server/routes/modules/chatCards.ts");
    const at = src.indexOf('router.post("/rooms/:key/cards/mountain"');
    /** 이 라우트 하나 — 닫는 줄까지 */
    const block = src.slice(at, src.indexOf("}));", at) + 4);

    it("라우트가 있고, 방 접근 · 종목 검사(openRoom)를 거쳐 postCard 로 끝난다", () => {
        expect(at).toBeGreaterThan(-1);
        expect(block).toContain('router.post("/rooms/:key/cards/mountain", ...hikingGate, asyncHandler(');
        expect(block).toContain('const room = await openRoom(req, res, "HIKING"); if (!room) return;');
        expect(block).toContain("return postCard(res, room, MOUNTAIN_CARD, mountainCardSummary(card), { ...card }, { title: mountainCardPushTitle });");
        // 등산 문지기(지금은 운영자 · 시험 계정) + 약관 — 골프 카드의 문지기와 같은 모양
        expect(src).toContain("const hikingGate = [...requireHikingAccess, requireTermsAccepted];");
    });
    it("당구 · 골프 방은 거절한다 — 방의 종목이 HIKING 이 아니면 400", () => {
        expect(src).toContain('if (want !== "ANY" && sport !== want) { sendError(res, 400, "err.chat.card.sportMismatch", "SPORT_MISMATCH"); return null; }');
        // 방의 종목은 서버가 방 정보에서 읽는다(요청이 정하지 않는다)
        expect(src).toContain('const sport: Sport = info.sport ?? "BILLIARDS";');
        // HIKING 을 받는 카드는 이것 하나다
        expect(src.match(/await openRoom\(req, res, "HIKING"\)/g)).toHaveLength(1);
    });
    it("본문에서 읽는 것은 주소뿐 — req.body 는 한 번, mountainCardSlug 로만 간다", () => {
        expect(block.match(/req\.body/g)).toHaveLength(1);
        expect(block).toContain("const slug = mountainCardSlug(req.body);");
        expect(block).toContain('if (!slug) return sendError(res, 400, "err.chat.card.badInput");');
        expect(block).toContain("const m = await mountainBySlug(slug);");
        expect(block).toContain("const card = buildMountainCard(m);");
        expect(block).not.toMatch(/parsed|safeParse|\.\.\.req/);
        // 순서: 주소 꼴 → 방(권한 · 종목 · 속도) → 산 표
        expect(block.indexOf("mountainCardSlug(req.body)")).toBeLessThan(block.indexOf("await openRoom("));
        expect(block.indexOf("await openRoom(")).toBeLessThan(block.indexOf("await mountainBySlug(slug)"));
    });
    it("없는 산은 404 — 다른 카드와 같은 꼴(메시지 + 코드)", () => {
        expect(block).toContain('if (!m) return sendError(res, 404, "없는 산이에요", "MOUNTAIN_NOT_FOUND");');
    });
    it("알림: 제목은 글로 준다(번역 열쇠를 새로 만들지 않았다), 본문은 요약 한 줄", () => {
        expect(src).toContain("const heading = opts?.title ? opts.title(roomLabel) : msg(`notif.chat.card.${type}`, { room: roomLabel });");
        expect(block).not.toContain("push:");
        for (const l of ["ko", "en", "es", "tr", "vi"]) expect(read(`shared/i18n/${l}.ts`), l).not.toContain("notif.chat.card.MOUNTAIN");
        // 글로 준 제목이 그대로 나가도록 notifyRoom 이 문자열 제목을 받는다
        expect(code("server/routes/modules/chat.ts")).toContain("heading: string | I18nText | ((memberId: string) => string | I18nText)");
    });
    it("보내기 라우트는 여전히 metadata 를 받지 않는다 — 산 카드도 이 라우트에서만 생긴다", () => {
        const chat = code("server/routes/modules/chat.ts");
        const i = chat.indexOf('router.post("/rooms/:key/messages"');
        expect(chat.slice(i, chat.indexOf("router.", i + 10))).not.toContain("metadata");
        expect(MOUNTAIN_CARD).toBe("MOUNTAIN");
    });
});

describe("산 카드 — 화면", () => {
    const attach = read("client/src/components/hiq/chat/attach/AttachSheet.tsx");
    const page = read("client/src/pages/hiq/chat-room.tsx");
    const chatCard = read("client/src/components/hiq/chat/ChatCard.tsx");
    const card = read("client/src/hiking/chat/MountainChatCard.tsx");
    const picker = read("client/src/hiking/chat/MountainCardPicker.tsx");
    const search = read("client/src/hiking/chat/mountainSearch.ts");

    it("+ 의 '산 보내기'는 산악회 방에만 놓인다", () => {
        expect(attach).toContain('const HIKING_ITEMS: AttachItem[] = ["MOUNTAIN"];');
        expect(attach).toContain('const items: AttachItem[] = sport === "FISHING" ? [] : sport === "HIKING" ? HIKING_ITEMS : sport === "GOLF" ? GOLF_ITEMS : BILLIARDS_ITEMS;');
        expect(attach).toContain('const BILLIARDS_ITEMS: AttachItem[] = ["MATCH_INVITE", "SIM_INVITE", "GAME_RESULT", "STORE"];');
        expect(attach).toContain('const GOLF_ITEMS: AttachItem[] = ["GOLF_BOOKING", "GOLF_MATCH", "GOLF_ROUND"];');
        expect(attach).toContain('MOUNTAIN: { key: "mountain", Icon: LucideMountain, label: "산 보내기" },');
        expect(attach).toContain("label={label ?? t(`chat.attach.${key}`)}");
        // 산악회 방의 종목 줄 이름 — 당구 · 골프의 이름은 그대로 번역 열쇠로
        expect(attach).toContain('{sport === "FISHING" ? "낚시" : sport === "HIKING" ? "등산" : sport === "GOLF" ? t("chat.attach.sportGolf") : t("chat.attach.sportBilliards")}');
    });
    it("방 화면: 산악회 방에서만 고르는 창을 불러 오고, 고른 산의 주소만 보낸다", () => {
        expect(page).toContain('const MountainCardPicker = lazy(() => import("@/hiking/chat/MountainCardPicker").then((m) => ({ default: m.MountainCardPicker })));');
        expect(page).not.toMatch(/from "@\/hiking|from "@shared\/hiking/);
        expect(page).toContain('{attachSport === "HIKING" && (');
        expect(page).toContain('<MountainCardPicker open={picker === "MOUNTAIN"} onOpenChange={(o) => { if (!o) setPicker(null); }} onPick={(slug) => { setPicker(null); void postCard("MOUNTAIN", { slug }); }} />');
        // 화면이 부르는 경로는 종류 이름을 소문자로 바꾼 것 — 서버 라우트와 같다
        expect(page).toContain('/cards/${item.toLowerCase().replace(/_/g, "-")}');
        expect(MOUNTAIN_CARD.toLowerCase().replace(/_/g, "-")).toBe("mountain");
        expect(read("server/routes/modules/chatCards.ts")).toContain('router.post("/rooms/:key/cards/mountain"');
    });
    it("카드 그리기: 공용 카드 화면은 산 카드일 때만 등산의 조각을 불러 온다", () => {
        expect(chatCard).toContain('const MountainChatCard = lazy(() => import("@/hiking/chat/MountainChatCard").then((m) => ({ default: m.MountainChatCard })));');
        expect(chatCard).toContain(`case "${MOUNTAIN_CARD}":`);
        expect(chatCard).toContain("<MountainChatCard md={md} summary={msg.message} />");
        expect(chatCard).not.toMatch(/from "@\/hiking|from "@shared\/hiking/);
        // 조각이 오기 전 · 모르는 앱에서는 서버 요약 한 줄
        expect(chatCard.slice(chatCard.indexOf(`case "${MOUNTAIN_CARD}":`), chatCard.indexOf("default:", chatCard.indexOf(`case "${MOUNTAIN_CARD}":`)))).toContain("{msg.message}");
    });
    it("산 카드 조각 — 표지 그림 띠 · 100대 명산 와펜 · 두 줄 · '산 정보 보기'", () => {
        expect(card.match(/data-testid="chat-card-mountain"/g)).toHaveLength(2);
        expect(card.match(/data-track-as="hiking-chat-mountain-card"/g)).toHaveLength(2);
        expect(card).toContain("const card = readMountainCard(md);");
        expect(card).toContain("<img src={hikingCover(card.region)} alt=\"\"");
        expect(card).toContain("{card.kfs100 && card.mountainId && <span className=\"absolute right-3 top-2.5\"><MountainPatch id={card.mountainId} region={card.region} size={46} earned={false} preview /></span>}");
        expect(card).toContain("const facts = mountainCardFacts(card);");
        expect(card).toContain("const courses = mountainCardCourses(card);");
        expect(card).toContain("{courses && <p");
        expect(card).toContain("href={hikingMountainPath(card.slug)}");
        expect(card).toContain("{COPY.open}");
        expect(MOUNTAIN_CARD_COPY.open).toBe("산 정보 보기");
        expect(hikingMountainPath("설악산")).toBe(`/hiking/mountains/${encodeURIComponent("설악산")}`);
    });
    it("찾기는 공개 목록에 그때그때 묻는다 — 기기에 일주일 남는 조회 캐시를 거치지 않는다", () => {
        for (const f of [picker, search, card]) expect(code2(f)).not.toMatch(/@tanstack\/react-query|\buseQuery\b|useQueryClient|setQueryData|fetchQuery|localStorage|sessionStorage/);
        expect(search).toContain('import { apiRequest } from "@/lib/queryClient";');
        expect(search).toContain("return readMountainHits(await apiRequest(mountainsKey({ q })[0], { signal }));");
        expect(search).toContain("}, MOUNTAIN_SEARCH_WAIT_MS);");
        expect(search).toContain("return () => { clearTimeout(timer); ctl.abort(); };");
        expect(search).toContain("const held = useRef(new Map<string, Answer>());");
        expect(read("client/src/hiking/lib/api.ts")).toContain("export const mountainsKey = (q: Record<string, string>) => [`/api/hiq/hiking/mountains?");
        // 두 곳(보내기 창 · 투표의 한 줄)이 같은 찾기를 쓴다
        expect(picker).toContain('import { useMountainSearch } from "./mountainSearch";');
        expect(picker.match(/<MountainSearchBox /g)).toHaveLength(2);
    });
    it("고르는 창 — 구역 이름 · 시험용 이름 · 형제 key 는 산의 주소", () => {
        expect(picker).toContain('data-track-as="hiking-chat-mountain-picker"');
        expect(picker).toContain('data-testid="chat-mountain-picker"');
        expect(picker).toContain('tid="chat-mountain"');
        expect(picker).toContain("data-testid={`${tid}-option-${m.slug}`}");
        expect(picker).toContain("key={m.slug}");
        expect(picker).toContain('role="combobox" aria-autocomplete="list"');
        expect(picker).toContain('role="listbox"');
        expect(picker).toContain("onChoose={(m) => { onPick(m.slug); }}");
        // 단추는 전부 type="button" — 다른 창의 form 안에 놓여도 올리지 않는다
        expect(code2(picker).match(/<button\b/g)).toHaveLength(code2(picker).match(/type="button"/g)!.length);
        expect(code2(picker)).not.toMatch(/type="submit"|<form\b/);
        expect(picker.indexOf("e.preventDefault();", picker.indexOf('if (e.key === "Enter") {'))).toBeLessThan(picker.indexOf("isComposing"));
    });
    it("등산의 조각 — 리터럴 색 · 12px 이상 · semibold 까지 · 번역 열쇠 없음 · 글자 그림 없음", () => {
        for (const [name, f] of [["card", card], ["picker", picker], ["search", search]] as const) {
            const c = code2(f);
            const sizes = Array.from(c.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g), (x) => Number(x[1]));
            expect(Math.min(...(sizes.length ? sizes : [12])), name).toBeGreaterThanOrEqual(12);
            expect(c, name).not.toMatch(/font-(bold|extrabold|black)\b/);
            expect(c, name).not.toMatch(/\b(bg|text|border)-(surface|ink|brand|white|black)\b|rk-card|rk-num/);
            expect(c, name).not.toMatch(/useT\b|\bt\(["`]/);
            expect(c, name).not.toMatch(/\p{Extended_Pictographic}/u);
        }
        expect(card).toMatch(/text-\[\d+px\]/);
        expect(picker).toMatch(/text-\[\d+(\.\d+)?px\]/);
    });
    it("글 — 돈 · 술 · 내기, 빠르기 · 밤 산행을 권하는 말이 없다", () => {
        const all = [MOUNTAIN_CARD_COPY, MOUNTAIN_PICKER_COPY, MOUNTAIN_SEARCH_COPY, POLL_MOUNTAIN_COPY].flatMap((o) => Object.values(o) as string[])
            .concat([mountainSearchNote(3, 4), mountainSearchNote(30, 4), mountainSearchNote(1000, 4, true), pollMountainAddedNote("설악산", 2), pollMountainFullNote(10), mountainCardPushTitle("[방]"), mountainCardSummary(seorak)]);
        // '내기'는 낱말로 설 때만 본다 — "산 보내기"의 '내기'는 그 말이 아니다
        for (const s of all) expect(s).not.toMatch(/술|막걸리|(?<![가-힣])내기|베팅|상금|현금|빨리|빠르게|최단|야간|밤 산행|\p{Extended_Pictographic}/u);
        expect("내기 산행").toMatch(/(?<![가-힣])내기/);
        expect(MOUNTAIN_PICKER_COPY.title).toBe("산 보내기");
        expect(POLL_MOUNTAIN_COPY.title).toBe("산으로 보기 채우기");
    });
});

describe("산 찾기 — 받은 답을 추리고 좁힌다", () => {
    const row = (slug: string, name: string, sido: string | null, sigungu: string | null, heightM: number | null, lists: string[] = []) => ({ id: `id-${slug}`, slug, name, sido, sigungu, heightM, lists, region: "x", lat: 37.1, lng: 127.1, guide: "긴 글" });
    const items = [
        row("백운산", "백운산", "전라남도", "광양시", 1222.2, ["kfs100"]),
        row("백운산-포천", "백운산", "경기도", "포천시", 903),
        row("백운산-정선", "백운산", "강원특별자치도", "정선군", 882.5),
        row("큰백운산", "큰백운산", "경기도", "가평군", 700),
        row("북한산", "북한산", "서울특별시", "강북구", 836, ["kfs100"]),
    ];

    it("쓸 것만 꺼낸다 — 좌표 · 글 같은 나머지는 들고 있지 않는다", () => {
        expect(toMountainHit(items[0])).toEqual({ slug: "백운산", name: "백운산", sido: "전라남도", sigungu: "광양시", heightM: 1222, kfs100: true });
        for (const bad of [null, "백운산", [], {}, { slug: "백운산" }, { name: "백운산" }, { slug: "백 운산", name: "백운산" }, { slug: "x", name: "가".repeat(41) }]) expect(toMountainHit(bad)).toBeNull();
    });
    it("답 읽기 — 어긋난 줄 · 같은 주소가 두 번 온 줄을 뺀다(형제 key 가 겹치지 않는다), 다 못 받았으면 capped", () => {
        const got = readMountainHits({ total: 7, items: [...items, items[1], { slug: "", name: "빈" }, null] });
        expect(got.list.map((m) => m.slug)).toEqual(["백운산", "백운산-포천", "백운산-정선", "큰백운산", "북한산"]);
        expect(new Set(got.list.map((m) => m.slug)).size).toBe(got.list.length);
        expect(got.capped).toBe(false);
        expect(readMountainHits({ total: 1300, items }).capped).toBe(true);
        for (const bad of [null, undefined, "x", {}, { items: "x" }, []]) expect(readMountainHits(bad)).toEqual({ list: [], capped: false });
    });
    it("친 글 — 첫 낱말이 이름, 뒤의 낱말은 시군. 치는 도중의 낱자는 버린다", () => {
        expect(splitMountainSearch("  백운산   포천 ")).toEqual({ q: "백운산", rest: ["포천"] });
        expect(splitMountainSearch("설ㅇ")).toEqual({ q: "설", rest: [] });
        expect(splitMountainSearch("ㅅ")).toEqual({ q: "", rest: [] });
        expect(splitMountainSearch("")).toEqual({ q: "", rest: [] });
        expect(splitMountainSearch("가".repeat(50)).q).toHaveLength(MOUNTAIN_QUERY_MAX);
    });
    it("좁히기 · 순서 — 이름이 같은 산, 그 이름으로 시작하는 산, 그 밖. 뒤의 낱말은 시도 · 시군구에서 찾는다", () => {
        const list = readMountainHits({ total: 5, items }).list;
        expect(rankMountainHits(list, "백운산").map((m) => m.slug)).toEqual(["백운산", "백운산-포천", "백운산-정선", "큰백운산"]);
        expect(rankMountainHits(list, "백운산", ["포천"]).map((m) => m.slug)).toEqual(["백운산-포천"]);
        expect(rankMountainHits(list, "백운산", ["경기"]).map((m) => m.slug)).toEqual(["백운산-포천", "큰백운산"]);
        expect(rankMountainHits(list, "백운산", ["제주"])).toEqual([]);
        expect(rankMountainHits(list, "")).toEqual([]);
    });
    it("이름표 — 같은 이름이 같이 놓이면 시군을 붙인다. 아래 줄은 자리 · 높이", () => {
        const list = readMountainHits({ total: 5, items }).list;
        expect(mountainHitLabels(list)).toEqual(["백운산(광양)", "백운산(포천)", "백운산(정선)", "큰백운산", "북한산"]);
        expect(mountainHitLabels([list[0], list[4]])).toEqual(["백운산", "북한산"]);
        expect(mountainHitWhere(list[1])).toBe("경기 포천시 · 903m");
        expect(mountainHitWhere({ sido: null, sigungu: null, heightM: null })).toBe("");
    });
    it("찾은 뒤의 한 줄", () => {
        expect(mountainSearchNote(3, 4)).toBe("3곳을 찾았어요.");
        expect(mountainSearchNote(12, 4)).toBe("12곳을 찾았어요. 이름 뒤에 시군을 적으면 좁혀져요(예: 백운산 포천).");
        expect(mountainSearchNote(1000, 20, true)).toBe("1,000곳 넘게 찾았어요. 이름을 더 적어 보세요.");
    });
});

describe("다음 산 투표 — 산으로 보기 채우기", () => {
    const limits = { maxOptions: POLL_LIMITS.maxOptions, optionMax: POLL_LIMITS.optionMax };
    const mt = (slug: string, name = slug, sigungu: string | null = null) => ({ slug, name, sigungu });
    const gwangyang = mt("백운산", "백운산", "광양시");
    const pocheon = mt("백운산-포천", "백운산", "포천시");
    /** 차례로 넣어 본다 — 넣지 못하면 거기서 멈춘다 */
    const fill = (start: string[], list: { slug: string; name: string; sigungu: string | null }[]) => {
        let options = start, picked: PollMountainPick[] = [];
        for (const m of list) { const r = addPollMountain(options, picked, m, limits); if (!r.ok) return { options, picked, fail: r.reason }; options = r.options; picked = r.picked; }
        return { options, picked, fail: null };
    };

    it("빈 보기 칸부터 채우고, 없으면 새 칸을 더한다", () => {
        const a = addPollMountain(["", ""], [], mt("설악산"), limits);
        expect(a).toEqual({ ok: true, options: ["설악산", ""], picked: [{ slug: "설악산", name: "설악산", sigungu: null, label: "설악산" }], label: "설악산" });
        expect(fill(["", ""], [mt("설악산"), mt("지리산"), mt("한라산")]).options).toEqual(["설악산", "지리산", "한라산"]);
        // 회원이 적어 둔 보기는 그대로 — 빈 칸만 쓴다
        expect(fill(["토요일", "  ", "일요일"], [mt("설악산"), mt("지리산")]).options).toEqual(["토요일", "설악산", "일요일", "지리산"]);
    });
    it("창의 상한(보기 10개)을 넘기지 않는다 — 가득 차면 넣지 않고 보기는 그대로다", () => {
        expect(POLL_LIMITS.maxOptions).toBe(10);
        const twelve = Array.from({ length: 12 }, (_, i) => mt(`산${i + 1}`));
        const r = fill(["", ""], twelve);
        expect(r.options).toHaveLength(POLL_LIMITS.maxOptions);
        expect(r.options).toEqual(twelve.slice(0, 10).map((m) => m.slug));
        expect(r.fail).toBe("full");
        const full = Array.from({ length: 10 }, (_, i) => `보기 ${i + 1}`);
        expect(addPollMountain(full, [], mt("설악산"), limits)).toEqual({ ok: false, reason: "full" });
        // 열 칸이어도 빈 칸이 있으면 그 칸에 들어간다(칸 수는 늘지 않는다)
        const withBlank = [...full.slice(0, 9), ""];
        const ok = addPollMountain(withBlank, [], mt("설악산"), limits);
        expect(ok.ok && ok.options).toEqual([...full.slice(0, 9), "설악산"]);
        expect(ok.ok && ok.options.length).toBe(10);
        // 남은 자리 세기 — 빈 칸 + 상한까지 남은 칸
        expect(pollMountainRoom(["", ""], 10)).toBe(10);
        expect(pollMountainRoom(["설악산", ""], 10)).toBe(9);
        expect(pollMountainRoom(full, 10)).toBe(0);
        expect(pollMountainRoom(withBlank, 10)).toBe(1);
        expect(pollMountainRoom(Array.from({ length: 12 }, () => "x"), 10)).toBe(0);
    });
    it("같은 산을 두 번 넣지 않는다 — 글이 같은 보기도 겹친 것으로 본다", () => {
        const once = fill(["", ""], [mt("설악산", "설악산", "양양군")]);
        expect(once.options).toEqual(["설악산", ""]);
        expect(addPollMountain(once.options, once.picked, mt("설악산", "설악산", "양양군"), limits)).toEqual({ ok: false, reason: "duplicate" });
        // 회원이 손으로 적어 둔 같은 이름의 보기 — 시군을 알면 시군을 붙여 넣고("설악산(양양)"), 모르면 겹친 것이다
        const typed = addPollMountain(["설악산", ""], [], mt("설악산", "설악산", "양양군"), limits);
        expect(typed.ok && typed.options).toEqual(["설악산", "설악산(양양)"]);
        expect(typed.ok && addPollMountain(typed.options, typed.picked, mt("설악산", "설악산", "양양군"), limits)).toEqual({ ok: false, reason: "duplicate" });
        expect(addPollMountain(["설악산", "설악산(양양)"], [], mt("설악산", "설악산", "양양군"), limits)).toEqual({ ok: false, reason: "duplicate" });
        expect(addPollMountain(["설악산", ""], [], mt("설악산"), limits)).toEqual({ ok: false, reason: "duplicate" });
        expect(addPollMountain(["  설악산 ", ""], [], mt("설악산"), limits)).toEqual({ ok: false, reason: "duplicate" });
        expect(pollOptionKey("  Mt  Seorak ")).toBe("mt seorak");
        // 넣은 보기를 회원이 지웠으면 다시 넣을 수 있다
        expect(addPollMountain(["", ""], once.picked, mt("설악산"), limits).ok).toBe(true);
    });
    it("같은 이름의 산이 먼저 들어가 있으면 둘 다 시군을 붙인다", () => {
        const r = fill(["", ""], [gwangyang, pocheon]);
        expect(r.options).toEqual(["백운산(광양)", "백운산(포천)"]);
        expect(r.picked.map((p) => p.label)).toEqual(["백운산(광양)", "백운산(포천)"]);
        // 혼자일 때는 이름 그대로(주소에 시군이 붙은 산은 늘 시군까지)
        expect(fill(["", ""], [gwangyang]).options).toEqual(["백운산", ""]);
        expect(fill(["", ""], [pocheon]).options).toEqual(["백운산(포천)", ""]);
        // 회원이 고쳐 적은 보기는 건드리지 않는다
        const one = fill(["", ""], [gwangyang]);
        const edited = addPollMountain(["백운산 가자", ""], one.picked, pocheon, limits);
        expect(edited.ok && edited.options).toEqual(["백운산 가자", "백운산(포천)"]);
        // 고쳐 적을 글이 이미 다른 보기에 있으면 그대로 둔다
        const clash = addPollMountain(["백운산", "백운산(광양)"], one.picked, pocheon, limits);
        expect(clash.ok && clash.options).toEqual(["백운산", "백운산(광양)", "백운산(포천)"]);
    });
    it("넣은 보기는 투표의 검사를 통과한다 — 겹침 없음 · 60자 안", () => {
        const r = fill(["", ""], [gwangyang, pocheon, mt("백운산-정선", "백운산", "정선군"), mt("설악산"), mt("지리산-통영", "지리산", "통영시")]);
        expect(r.options).toEqual(["백운산(광양)", "백운산(포천)", "백운산(정선)", "설악산", "지리산(통영)"]);
        expect(normalizePollOptions(r.options)).toEqual({ ok: true, options: r.options });
        expect(addPollMountain(["", ""], [], mt("가".repeat(61)), limits)).toEqual({ ok: false, reason: "tooLong" });
    });
    it("한 줄 글", () => {
        expect(pollMountainAddedNote("설악산", 3)).toBe("설악산 · 보기에 넣었어요. 3곳 더 넣을 수 있어요.");
        expect(pollMountainAddedNote("설악산", 0)).toBe("설악산 · 보기에 넣었어요.");
        expect(pollMountainFailNote("full", 10)).toBe("보기가 10개로 가득 찼어요. 보기를 지우면 산을 더 넣을 수 있어요.");
        expect(pollMountainFailNote("duplicate", 10)).toBe(POLL_MOUNTAIN_COPY.duplicate);
        expect(pollMountainFailNote("tooLong", 10)).toBe(POLL_MOUNTAIN_COPY.tooLong);
    });

    describe("투표 만들기 창", () => {
        const dialog = read("client/src/components/hiq/CreatePollDialog.tsx");
        const picker = read("client/src/hiking/chat/MountainCardPicker.tsx");
        it("'산으로 보기 채우기'는 산악회일 때만 그려진다", () => {
            expect(dialog).toContain('const hiking = (sportCategory ?? queryClient.getQueryData<{ crew?: { sportCategory?: string | null } }>([`/api/hiq/crews/${crewId}`])?.crew?.sportCategory) === "HIKING";');
            expect(dialog.match(/\{hiking && \(/g)).toHaveLength(1);
            expect(dialog.match(/<PollMountainFill /g)).toHaveLength(1);
            const at = dialog.indexOf("{hiking && (");
            expect(dialog.slice(at, at + 400)).toContain("<PollMountainFill options={options} maxOptions={POLL_LIMITS.maxOptions} optionMax={POLL_LIMITS.optionMax} onFill={setOptions} />");
            // 크루 정보는 받아 둔 것을 읽기만 한다 — 이 창이 따로 묻지 않는다(다른 종목의 창이 요청을 더 보내지 않는다)
            expect(code2(dialog)).not.toMatch(/\buseQuery\b/);
            // 채팅 방은 방의 종목을 넘긴다
            expect(read("client/src/pages/hiq/chat-room.tsx")).toContain('crewId={roomCrewId} sportCategory={attachSport}');
        });
        it("등산의 조각 · 규칙은 산악회일 때만 불러 온다 — 공용 창에는 등산의 글이 없다", () => {
            expect(dialog).toContain('const PollMountainFill = lazy(() => import("@/hiking/chat/MountainCardPicker").then((m) => ({ default: m.PollMountainFill })));');
            expect(dialog).not.toMatch(/from "@\/hiking|from "@shared\/hiking/);
            expect(code2(dialog)).not.toMatch(/[가-힣]/);
            // 창이 쓰는 번역 열쇠는 전부 사전에 있다(새 열쇠를 만들지 않았다)
            const ko = read("client/src/lib/i18n/ko.ts");
            const keys = Array.from(new Set(Array.from(dialog.matchAll(/\bt\("([^"]+)"\)/g), (x) => x[1])));
            expect(keys.length).toBeGreaterThan(15);
            for (const k of keys) expect(ko, k).toContain(`"${k}": `);
        });
        it("보기의 수 · 길이 상한은 창의 것(POLL_LIMITS)을 그대로 넘긴다 — 올리는 값과 검사는 그대로다", () => {
            expect(picker).toContain("const r = addPollMountain(options, picked, m, { maxOptions, optionMax });");
            expect(picker).toContain("const room = pollMountainRoom(options, maxOptions);");
            expect(picker).toContain("{room > 0 ? (");
            expect(picker).toContain('data-track-as="hiking-poll-mountain"');
            expect(picker).toContain('data-testid="poll-mountain-fill"');
            expect(dialog).toContain("const norm = normalizePollOptions(options);");
            expect(dialog).toContain("options: norm.options,");
            expect(dialog).toContain("if (options.length >= POLL_LIMITS.maxOptions) {");
        });
    });
});
