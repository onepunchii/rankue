/**
 * 골프 도장첩(2026-10-12 오너: "도장깨기가 우리 골프 콘텐츠의 핵심 … 엘리트 코스 60개를 세분화해서 골프도 장식장 및 수집욕구를" → 제안 뒤 "추천대로 진행").
 * 기획서: docs/01-plan/features/golf-stamp-collection.md
 *
 * 엘리트 명단 56곳을 **다 채울 수 있는 묶음**으로 나눈다:
 *   - 누구나(open) 일곱 권 — 명단에 대중제 줄이 있는 36곳을 권역으로(서해 4 · 경기 8 · 강원 7 · 충청 3 · 호남 4 · 영남 3 · 제주 7)
 *   - 초대장(invite) 두 권 — 회원제만 있는 20곳(수도권 11 · 지방 9)
 * 한 권을 다 채우면 그 권의 볼마커를 받고, 찍은 골프장 수로 트로피(10 · 20 · 30 · 45 · 전부)가 생긴다.
 *
 * 도장은 여권과 **같은 도장**이다 — 서버 golfStamps.collectStamps 가 만든 인증 도장(현장 인증 + 이 규칙 전 옛 기록)만 칸을 채운다.
 * 여기는 '그 도장이 어느 칸인가'만 정한다:
 *   1) 골프장 원장 번호(rankue_golf_clubs.id) — 기록에 번호가 있으면 이것으로
 *   2) 번호 없는 옛 기록은 원장 이름과 **글자가 같을 때만**(공백 · 대소문자 무시 — 서버 makeStampResolver 와 같은 기준)
 * 예전 엘리트 화면(client/src/golf/lib/elite60.ts)은 이름의 '포함 관계'까지 봤다 — 그래서 '경주신라'의 도장이 '경주'도 채우고
 * '블랙스톤 이천'이 '블랙스톤 제주'도 채웠다. 여기서는 포함 관계를 보지 않는다.
 *
 * 한 칸에 원장 번호가 둘인 곳: 원장에 같은 골프장이 두 줄로 들어 있는 경우다(코스별 두 줄 · 회원제/대중제 두 줄 · 다른 출처의 같은 곳).
 * 번호 · 이름은 2026-10-12 운영 원장에서 읽었다. 원장의 줄이 바뀌면 이 표도 고친다(시험이 번호의 모양 · 겹침을 본다).
 *
 * 순수한 표와 함수만 있다(화면 · 서버가 같이 쓴다). 색 · 그림은 client/src/golf/stamps/bookArt.ts.
 */

export type StampBookKind = "open" | "invite";

export interface StampSlot {
    /** 칸의 이름표(바뀌지 않는 영문 열쇠) */
    key: string;
    /** 도장에 찍히는 이름 — 원장 이름에서 CC · 컨트리클럽 · ㈜ 같은 꼬리를 뗀 것 */
    name: string;
    /** 골프장 공개 페이지의 옛 숫자 주소(/golf/course/:id — 화면이 슬러그 주소로 갈아탄다) */
    courseId: number;
    /** 골프장 원장 번호 — 이 가운데 하나의 도장이면 칸이 찬다 */
    clubIds: readonly string[];
    /** 원장 이름 — 번호 없는 옛 기록을 이름으로 이을 때 */
    ledgerNames: readonly string[];
}

export interface StampBook {
    id: string;
    name: string;
    kind: StampBookKind;
    slots: readonly StampSlot[];
}

export const STAMP_BOOKS: readonly StampBook[] = [
    {
        id: "seohae", name: "서해", kind: "open",
        slots: [
            { key: "island", name: "아일랜드", courseId: 46, clubIds: ["077bfcdc-39e7-45e5-90a6-78c5fe511363"], ledgerNames: ["아일랜드㈜"] }, // 대중제 27홀
            { key: "sky72", name: "SKY72", courseId: 173, clubIds: ["be910d3e-ba1a-4c64-8aa3-6c30ad8aafd8", "1874ef25-11a5-4872-99c8-6c0b14db9ccf"], ledgerNames: ["SKY72 골프클럽(바다코스)", "SKY72 골프클럽(하늘코스)"] }, // 대중제 63홀 · 대중제 18홀
            { key: "bearsbest", name: "베어즈베스트 청라", courseId: 175, clubIds: ["3e3792d2-c959-4837-b375-396765a4ea44"], ledgerNames: ["베어즈베스트청라골프클럽"] }, // 대중제 27홀
            { key: "orangedunes", name: "오렌지듄스", courseId: 177, clubIds: ["b897c4ef-c324-4be3-ae34-e2353b8b59d7"], ledgerNames: ["오렌지듄스골프클럽"] }, // 대중제 18홀
        ],
    },
    {
        id: "gyeonggi", name: "경기", kind: "open",
        slots: [
            { key: "paju", name: "파주", courseId: 60, clubIds: ["10acc7b1-f196-4684-8af9-614809ff4ad0"], ledgerNames: ["파주CC"] }, // 대중제 18홀
            { key: "seowon", name: "서원밸리", courseId: 58, clubIds: ["c245db85-b421-4e77-80b6-f3954d11a6d9", "2503ff82-3e63-4800-8ea5-3b9d92546eee"], ledgerNames: ["서원밸리", "서원힐스 CC"] }, // 회원제 18홀 · 대중제 27홀
            { key: "ildong", name: "일동레이크", courseId: 113, clubIds: ["51c183c1-650f-4017-ad33-8e90fc3ad878"], ledgerNames: ["일동레이크골프클럽"] }, // 회원제 27홀 · 대중제 9홀
            { key: "southsprings", name: "사우스스프링스", courseId: 85, clubIds: ["ab600482-6568-41da-8a72-7ca806dd7e4e"], ledgerNames: ["사우스스프링스C.C."] }, // 대중제 18홀
            { key: "blackstone-icheon", name: "블랙스톤 이천", courseId: 87, clubIds: ["40c40215-2023-4f38-a72a-0e5826f176a8"], ledgerNames: ["블랙스톤리조트이천"] }, // 회원제 18홀 · 대중제 9홀
            { key: "lexfield", name: "렉스필드", courseId: 133, clubIds: ["e58c831c-9947-4f86-aba0-4c6715569f4e"], ledgerNames: ["렉스필드"] }, // 회원제 18홀 · 대중제 9홀
            { key: "ferrum", name: "페럼", courseId: 143, clubIds: ["37ffd952-5f4d-4b5e-8609-99a2b9a070ca"], ledgerNames: ["페럼"] }, // 대중제 18홀
            { key: "lakeside", name: "레이크사이드", courseId: 17, clubIds: ["d018a64b-29db-4993-9af3-02586544e57a"], ledgerNames: ["레이크사이드CC"] }, // 대중제 36홀 · 회원제 18홀
        ],
    },
    {
        id: "gangwon", name: "강원", kind: "open",
        slots: [
            { key: "lavieestbelle", name: "라비에벨", courseId: 206, clubIds: ["9636d790-2cdd-4051-a67f-8c40f45ac341"], ledgerNames: ["라비에벨컨트리클럽"] }, // 대중제 36홀
            { key: "bearcreek-chuncheon", name: "베어크리크 춘천", courseId: 207, clubIds: ["e917616f-d14d-4076-b6cf-9d8d867b7773"], ledgerNames: ["베어크리크 춘천"] }, // 대중제 18홀
            { key: "hilldeloci", name: "힐드로사이", courseId: 229, clubIds: ["7114ffe0-564f-4586-a973-2216790a1aed"], ledgerNames: ["힐드로사이컨트리클럽"] }, // 대중제 18홀
            { key: "sagewood-hongcheon", name: "세이지우드 홍천", courseId: 231, clubIds: ["67ac5409-d57c-4e60-8d02-681f303d7e9c"], ledgerNames: ["세이지우드CC홍천"] }, // 대중제 27홀
            { key: "ecolian-jeongseon", name: "에콜리안 정선", courseId: 248, clubIds: ["0e64a461-0e22-4014-b364-3a60b92c5efe"], ledgerNames: ["에콜리안정선골프장"] }, // 대중제 9홀
            { key: "pineridge", name: "파인리즈", courseId: 252, clubIds: ["3d0413ef-b3ed-470b-b6e5-ccb85d9854e3"], ledgerNames: ["파인리즈컨트리클럽"] }, // 대중제 27홀
            { key: "seolhaeone", name: "설해원", courseId: 253, clubIds: ["9469341c-a660-409e-abbf-c1fb67cd8351", "cd9bf800-4aee-4438-99c5-37203835873e"], ledgerNames: ["설해원", "설해원 더 레전드 코스"] }, // 대중제 27홀 · 대중제 18홀
        ],
    },
    {
        id: "chungcheong", name: "충청", kind: "open",
        slots: [
            { key: "rainbowhills", name: "레인보우힐스", courseId: 267, clubIds: ["9d488aee-3b47-4658-9333-4ffc2441db74"], ledgerNames: ["레인보우힐스"] }, // 대중제 27홀
            { key: "ecolian-jecheon", name: "에콜리안 제천", courseId: 283, clubIds: ["101b9b50-b0e5-41a7-8809-6834e85fb2a3"], ledgerNames: ["에콜리안제천"] }, // 대중제 9홀
            { key: "kingsdale", name: "킹스데일", courseId: 286, clubIds: ["b411f79c-3de2-42cc-8184-c02885fd356f"], ledgerNames: ["킹스데일"] }, // 대중제 18홀
        ],
    },
    {
        id: "honam", name: "호남", kind: "open",
        slots: [
            { key: "ecolian-gwangsan", name: "에콜리안 광산", courseId: 182, clubIds: ["4fc6aa4d-3b36-48ce-85cb-5ea60d9539b6"], ledgerNames: ["에콜리안광산골프장"] }, // 대중제 9홀
            { key: "sagewood-yeosu", name: "세이지우드 여수경도", courseId: 446, clubIds: ["5345c7d2-2fbd-48e3-8564-83160be823db"], ledgerNames: ["세이지우드여수경도"] }, // 대중제 27홀
            { key: "pinebeach", name: "파인비치", courseId: 473, clubIds: ["d981ea0f-37e6-4ec8-98df-184ed96c0e98"], ledgerNames: ["파인비치골프링크스"] }, // 대중제 18홀
            { key: "ecolian-yeonggwang", name: "에콜리안 영광", courseId: 482, clubIds: ["dca59360-1158-43d7-a318-2a07d60796ab"], ledgerNames: ["에콜리안영광골프장"] }, // 대중제 9홀
        ],
    },
    {
        id: "yeongnam", name: "영남", kind: "open",
        slots: [
            { key: "gyeongju", name: "경주", courseId: 326, clubIds: ["a876b9e3-891e-44d9-b9ac-4ebf800b356d"], ledgerNames: ["경주C.C"] }, // 대중제 27홀
            { key: "grace", name: "그레이스", courseId: 362, clubIds: ["c849920b-c505-4ec5-98ea-93ce7a70177d"], ledgerNames: ["그레이스C.C"] }, // 대중제 27홀
            { key: "southcape", name: "사우스케이프", courseId: 409, clubIds: ["79262176-5f92-4e7a-8757-46d4ee66bf9a"], ledgerNames: ["사우스케이프오너스클럽"] }, // 대중제 18홀
        ],
    },
    {
        id: "jeju", name: "제주", kind: "open",
        slots: [
            { key: "blackstone-jeju", name: "블랙스톤 제주", courseId: 486, clubIds: ["1b9f3812-7f2f-4e36-9e71-a1a3b6be008c"], ledgerNames: ["블랙스톤리조트"] }, // 회원제 18홀 · 대중제 9홀
            { key: "raon", name: "라온", courseId: 493, clubIds: ["1d0eff04-1e85-4cec-bf30-4e465a11d95c"], ledgerNames: ["라온골프클럽"] }, // 대중제 27홀
            { key: "elysian-jeju", name: "엘리시안 제주", courseId: 497, clubIds: ["739da7f2-dd5b-4e58-ae90-50d291200a78"], ledgerNames: ["엘리시안 제주cc"] }, // 회원제 18홀 · 대중제 18홀
            { key: "pinx", name: "핀크스", courseId: 499, clubIds: ["4a5d5bfe-54dd-4776-984c-0bc51fe60b71", "317b1dea-8e7e-4a35-9032-ca91baa17d15"], ledgerNames: ["sk핀크스골프장", "핀크스 GC"] }, // 회원제 18홀 · 대중제 9홀
            { key: "ninebridges", name: "나인브릿지", courseId: 507, clubIds: ["3ee46b80-8541-4640-a8fe-d6705a8d3bde", "4bcc27d1-e18d-4e42-a29c-f222d6aa2ffa"], ledgerNames: ["클럽나인브릿지", "나인브릿지 퍼블릭"] }, // 회원제 18홀 · 대중제 6홀
            { key: "shineville", name: "샤인빌파크", courseId: 509, clubIds: ["74582d7b-2e70-4cca-ab79-df24568c3ff9"], ledgerNames: ["샤인빌파크C.C."] }, // 대중제 18홀
            { key: "jungmun", name: "중문", courseId: 513, clubIds: ["be26c492-2a97-47aa-92a7-ae77512604e9"], ledgerNames: ["중문GC"] }, // 대중제 18홀
        ],
    },
    {
        id: "invite-capital", name: "수도권 초대장", kind: "invite",
        slots: [
            { key: "jacknicklaus", name: "잭 니클라우스", courseId: 170, clubIds: ["7c0d161c-72d2-4223-ab2c-f2fe6f5ad067"], ledgerNames: ["잭 니클라우스 골프클럽 코리아"] }, // 회원제 18홀
            { key: "visionhills", name: "비전힐스", courseId: 51, clubIds: ["008c411a-273e-4227-a0fe-88a29ebbaeab"], ledgerNames: ["비전힐스C.C"] }, // 회원제 18홀
            { key: "wellington", name: "웰링턴", courseId: 90, clubIds: ["e9b26ded-9610-496d-91e9-8f6a8821c7d8"], ledgerNames: ["웰링턴C.C."] }, // 회원제 27홀
            { key: "haesley", name: "해슬리 나인브릿지", courseId: 139, clubIds: ["afbfea6f-7d77-442a-98f5-e74d8dda956d"], ledgerNames: ["해슬리나인브릿지"] }, // 회원제 18홀
            { key: "cc88", name: "88", courseId: 16, clubIds: ["36def507-a6c4-4085-a974-27c8dfe570fd"], ledgerNames: ["88CC"] }, // 회원제 36홀
            { key: "hwasan", name: "화산", courseId: 29, clubIds: ["c7c3855b-9666-4fdf-ae62-6b1297619fcb"], ledgerNames: ["화산CC"] }, // 회원제 18홀
            { key: "namseoul", name: "남서울", courseId: 37, clubIds: ["e8df68df-f58a-4af4-8c40-600c1c4b594e"], ledgerNames: ["남서울컨트리클럽"] }, // 회원제 18홀
            { key: "namchon", name: "남촌", courseId: 66, clubIds: ["c6f67bf8-20ff-4be8-97dc-57aea07ed25a"], ledgerNames: ["남촌컨트리클럽"] }, // 회원제 18홀
            { key: "eastvalley", name: "이스트밸리", courseId: 67, clubIds: ["66b592f1-968a-418e-8055-dccff49bf321"], ledgerNames: ["이스트밸리컨트리클럽"] }, // 회원제 27홀
            { key: "konjiam", name: "곤지암", courseId: 71, clubIds: ["fdbb69af-f772-4b50-bc38-ea557ca352d4"], ledgerNames: ["곤지암GC"] }, // 회원제 18홀
            { key: "anyang", name: "안양", courseId: 74, clubIds: ["69e30e1e-7c8a-488d-8f2c-997b6b833af5"], ledgerNames: ["삼성물산(주)안양컨트리클럽"] }, // 회원제 18홀
        ],
    },
    {
        id: "invite-regional", name: "지방 초대장", kind: "invite",
        slots: [
            { key: "jadepalace", name: "제이드팰리스", courseId: 198, clubIds: ["13bc73d7-f840-46c3-9b09-65e9282cf4d2"], ledgerNames: ["제이드팰리스 골프클럽"] }, // 회원제 18홀
            { key: "whistlingrock", name: "휘슬링락", courseId: 200, clubIds: ["79838871-fbba-4dd8-a531-53e9bb434891"], ledgerNames: ["휘슬링락컨트리클럽"] }, // 회원제 27홀
            { key: "woojeonghills", name: "우정힐스", courseId: 295, clubIds: ["8e1a2b18-395b-41e2-88c8-92e1706fff60"], ledgerNames: ["우정힐스 컨트리클럽"] }, // 회원제 18홀
            { key: "dongnae", name: "동래베네스트", courseId: 157, clubIds: ["c606b771-068c-4cc6-a0a5-878ba3dd85ea"], ledgerNames: ["동래베네스트골프클럽"] }, // 회원제 18홀
            { key: "gyeongju-silla", name: "경주신라", courseId: 324, clubIds: ["2b440b69-7e40-44b3-b115-14231f5af8d1"], ledgerNames: ["경주신라C.C"] }, // 회원제 36홀
            { key: "dianus", name: "디아너스", courseId: 333, clubIds: ["9ac65f7f-2abd-497c-8243-c9b3fb634c86", "a259ca1c-c348-421c-a7d9-aacf27362c0f"], ledgerNames: ["디아너스C.C", "강동 디아너스 CC"] }, // 회원제 27홀
            { key: "daegu", name: "대구", courseId: 353, clubIds: ["9163a2e1-60af-46c3-89c0-fa4c3a3b85a8"], ledgerNames: ["대구C.C"] }, // 회원제 27홀
            { key: "gimhae-jeongsan", name: "김해정산", courseId: 386, clubIds: ["e3a86a79-84d7-4fa2-8ce4-fe3aa99d5087"], ledgerNames: ["김해정산컨트리클럽"] }, // 회원제 27홀
            { key: "aone", name: "에이원", courseId: 395, clubIds: ["0ba49a8d-ff20-4621-aa1f-a4edd911c893"], ledgerNames: ["에이원컨트리클럽"] }, // 회원제 27홀
        ],
    },
];

const count = (kind: StampBookKind) => STAMP_BOOKS.filter((b) => b.kind === kind).reduce((n, b) => n + b.slots.length, 0);
/** 누구나 도장첩 일곱 권의 칸 수 */
export const STAMP_OPEN_TOTAL = count("open");
/** 초대장 도장첩 두 권의 칸 수 */
export const STAMP_INVITE_TOTAL = count("invite");
/** 엘리트 명단 전체 */
export const STAMP_TOTAL = STAMP_OPEN_TOTAL + STAMP_INVITE_TOTAL;
/** 트로피 — 찍은 엘리트 골프장 수. 마지막은 전부 */
export const STAMP_TROPHY_STEPS: readonly number[] = [10, 20, 30, 45, STAMP_TOTAL];
/** 누구나 일곱 권을 다 채우면 받는 볼마커의 이름표(도장첩이 아니라 묶음의 묶음) */
export const STAMP_ALL_OPEN = "all-open";

export function stampBook(id: string): StampBook | undefined {
    return STAMP_BOOKS.find((b) => b.id === id);
}

/** 도장으로 볼 수 있는 최소한 — 여권 도장(서버 응답 · 화면 가공본)이 다 이 모양을 갖는다 */
export interface StampLike {
    clubId: string | null;
    name: string;
}

const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
const BY_ID = new Map<string, { book: StampBook; slot: StampSlot }>();
const BY_NAME = new Map<string, { book: StampBook; slot: StampSlot }>();
for (const book of STAMP_BOOKS) for (const slot of book.slots) {
    for (const id of slot.clubIds) BY_ID.set(id, { book, slot });
    for (const n of slot.ledgerNames) BY_NAME.set(squash(n), { book, slot });
}

/** 이 도장이 어느 도장첩의 어느 칸인가. 엘리트 명단 밖이면 null */
export function slotForStamp(s: StampLike): { book: StampBook; slot: StampSlot } | null {
    if (s.clubId) {
        // 번호가 있는 도장은 번호로만 본다 — 이름이 비슷한 다른 골프장이 칸을 채우지 않게
        return BY_ID.get(s.clubId) ?? null;
    }
    return (s.name && BY_NAME.get(squash(s.name))) || null;
}

export interface SlotState<S> {
    slot: StampSlot;
    /** 인증 도장 — 있으면 칸이 찼다 */
    stamp: S | null;
    /** 미인증 기록만 있는 골프장(흐린 도장) — 칸은 차지 않는다 */
    record: S | null;
}

export interface BookState<S> {
    book: StampBook;
    slots: SlotState<S>[];
    got: number;
    total: number;
    done: boolean;
}

/**
 * 도장 → 도장첩마다의 상태. stamps 는 인증 도장, records 는 미인증 기록(없어도 된다).
 * 한 칸에 도장이 둘 걸리면(원장에 두 줄인 골프장을 둘 다 친 경우) 먼저 온 것을 쓴다 — 서버가 얻은 순서로 준다.
 */
export function bookStates<S extends StampLike>(stamps: readonly S[], records: readonly S[] = []): BookState<S>[] {
    const hit = new Map<string, S>(), rec = new Map<string, S>();
    for (const s of stamps) { const at = slotForStamp(s); if (at && !hit.has(at.slot.key)) hit.set(at.slot.key, s); }
    for (const s of records) { const at = slotForStamp(s); if (at && !rec.has(at.slot.key)) rec.set(at.slot.key, s); }
    return STAMP_BOOKS.map((book) => {
        const slots = book.slots.map((slot): SlotState<S> => {
            const stamp = hit.get(slot.key) ?? null;
            return { slot, stamp, record: stamp ? null : rec.get(slot.key) ?? null };
        });
        const got = slots.filter((s) => s.stamp).length;
        return { book, slots, got, total: slots.length, done: got === slots.length };
    });
}

export interface StampSummary {
    /** 찍은 엘리트 골프장 수(누구나 + 초대장) */
    stamped: number;
    total: number;
    openStamped: number;
    openTotal: number;
    inviteStamped: number;
    inviteTotal: number;
    /** 다 채운 도장첩의 id — 권마다 볼마커 하나 */
    doneBooks: string[];
    /** 누구나 일곱 권을 전부 채웠는가 — 큰 볼마커 */
    allOpenDone: boolean;
    /** 받은 볼마커 수(다 채운 권 + 누구나 전부) */
    markers: number;
    /** 받은 트로피 수(STAMP_TROPHY_STEPS 가운데 넘긴 단계) */
    trophies: number;
    /** 다음 트로피 — 없으면 null(전부 받았다) */
    nextTrophy: { at: number; left: number } | null;
    /** 지금 가장 가까운 도장첩 — 시작했지만 아직 못 채운 권 가운데 남은 칸이 가장 적은 것. 없으면 null */
    nearest: { bookId: string; left: number } | null;
}

export function stampSummary<S>(states: readonly BookState<S>[]): StampSummary {
    const of = (kind: StampBookKind) => states.filter((s) => s.book.kind === kind);
    const sum = (list: readonly BookState<S>[]) => list.reduce((n, s) => n + s.got, 0);
    const openStamped = sum(of("open")), inviteStamped = sum(of("invite"));
    const stamped = openStamped + inviteStamped;
    const doneBooks = states.filter((s) => s.done).map((s) => s.book.id);
    const allOpenDone = of("open").every((s) => s.done);
    const next = STAMP_TROPHY_STEPS.find((at) => stamped < at);
    // 초대장은 재촉하지 않는다 — '가장 가까운 것'은 누구나 도장첩에서만 고른다
    const open = of("open").filter((s) => !s.done && s.got > 0)
        .sort((a, b) => (a.total - a.got) - (b.total - b.got) || b.got - a.got);
    return {
        stamped, total: STAMP_TOTAL,
        openStamped, openTotal: STAMP_OPEN_TOTAL,
        inviteStamped, inviteTotal: STAMP_INVITE_TOTAL,
        doneBooks, allOpenDone,
        markers: doneBooks.length + (allOpenDone ? 1 : 0),
        trophies: STAMP_TROPHY_STEPS.filter((at) => stamped >= at).length,
        nextTrophy: next === undefined ? null : { at: next, left: next - stamped },
        nearest: open.length ? { bookId: open[0].book.id, left: open[0].total - open[0].got } : null,
    };
}
