// 스토어 스크린샷 1.3 — 당구 크루(05). 로컬 Vite(5177) + 가짜 응답(capture3-lib.mts). 운영에는 아무것도 보내지 않는다.
//   npx tsx store/screenshots/capture3-crew.mts                 05-crew.png (크루 홈 맨 위)
//   ALT=1 npx tsx store/screenshots/capture3-crew.mts           + 대안 컷(05-crew-*.png)
//   CREW_DOW=3 npx tsx store/screenshots/capture3-crew.mts      수요 모임으로(이름·정모 요일·정모 날짜가 같이 바뀐다) → 05-crew-wed.png
//
// 화면에 나오는 것은 전부 지어낸 것이다: 크루 이름, 별명(실명처럼 읽히지 않는 당구 용어 별명), 정모·투표·대회 제목.
// 실제 매장 이름·전화·사진·금액·내기 표현은 없다(베이스캠프는 비워 둔다 — 화면 아래쪽이라 찍히지 않는다).
// 게시판 탭은 찍지 않는다: 머리에 '정산' 단추가 있다(돈이 보이는 화면은 싣지 않는다).
import { chromium, openShot, capture, report, ME, ME_ID, PASS, BASE, type Handler, type Shot } from "./capture3-lib.mts";

const ALT = !!process.env.ALT;

/* ── 날짜 — 한국 시각 기준, 찍는 날에 맞춰 움직인다 ───────────────────────── */
const KST = 9 * 3600_000, DAY = 86_400_000;
/** 한국 시각으로 오늘 + n일의 h:m */
const kstAt = (days: number, h: number, m = 0) => {
    const k = new Date(Date.now() + KST);
    return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + days, h, m) - KST).toISOString();
};
const kstDow = new Date(Date.now() + KST).getUTCDay();
const kstMonth = (iso: string) => new Date(Date.parse(iso) + KST).getUTCMonth() + 1;
const kstWeek = (iso: string) => ["첫째", "둘째", "셋째", "넷째", "다섯째"][Math.ceil(new Date(Date.parse(iso) + KST).getUTCDate() / 7) - 1];

/* ── 크루 — 모이는 요일 하나에서 이름·요일 칩·다음 정모 날짜를 같이 낸다(서로 어긋나지 않게) ───── */
const DOW = Number(process.env.CREW_DOW ?? 6); // 0=일 … 6=토
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"][DOW];
const WEEKEND = DOW === 0 || DOW === 6;
const MEET_H = WEEKEND ? 14 : 19, MEET_M = WEEKEND ? 0 : 30;
const MEET_TIME = `${String(MEET_H).padStart(2, "0")}:${String(MEET_M).padStart(2, "0")}`;
// 매주 그 요일에 모인다 — 지난 세 번, 이번 주, 다음 주. 앱과 같은 규칙으로 가른다: 시작 뒤 4시간까지는 '다가오는' 쪽(진행 중),
// 그보다 앞은 지난 정모. 다가오는 쪽은 여드레 안의 것만(더 먼 정모는 아직 안 만든 것으로 친다).
// 토요 모임을 수요일에 찍으면 다가오는 정모는 하나(D-3). 모이는 요일 당일에 찍으면 첫 카드가 '오늘'이 된다.
const THIS_WEEK = (DOW - kstDow + 7) % 7;
const meetDates = [-3, -2, -1, 0, 1].map((w) => kstAt(THIS_WEEK + 7 * w, MEET_H, MEET_M));
const upcomingAt = meetDates.filter((iso) => Date.parse(iso) > Date.now() - 4 * 3600_000 && Date.parse(iso) < Date.now() + 8 * DAY);
const pastAt = meetDates.filter((iso) => Date.parse(iso) <= Date.now() - 4 * 3600_000).reverse();

// 크루 id 가 엠블럼 색과 커버의 공 배치를 정한다(shared/crewBrand) — 파란 엠블럼, 공이 머리 단추와 겹치지 않는 배치를 골랐다.
const CREW = "00000000-0000-4000-8000-0000000c0007";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const crew = {
    id: CREW, name: `${DOW_KO}요 3쿠션 모임`, leaderId: id(11),
    shortIntro: `${DOW_KO}요일 ${WEEKEND ? "오후" : "저녁"}, 편하게 치는 3쿠션`,
    description: "초보도 환영해요. 같이 치면서 에버리지를 올립니다.",
    baseStoreId: null, baseListingCode: null, emblem: null, coverImage: null,
    gameType: "3c", region: "서울 동부", countryCode: "KR", tags: ["#3쿠션", "#초보환영"],
    joinType: "auto", maxMembers: 20, meetingDay: `${DOW_KO}요일`, meetingTime: MEET_TIME,
    sportCategory: "BILLIARDS", introQuestions: null, latitude: null, longitude: null,
    createdAt: "2025-08-23T05:00:00.000Z",
};

/* ── 멤버 15명 — 3쿠션 에버리지 0.3~0.9, 다마수(handi3c)·등급(handi4c 저장 눈금)도 그에 맞춘다 ───── */
type M = { n: number; name: string; role: "leader" | "manage" | "member"; avg3c: number; handi3c: number; handi4c: number; avg4c: number; joined: number; intro: string | null };
const ROSTER: M[] = [
    { n: 11, name: "원뱅크장인", role: "leader", avg3c: 0.842, handi3c: 27, handi4c: 30, avg4c: 0.912, joined: 410, intro: "모임 만든 사람입니다. 편하게 오세요" },
    { n: 12, name: "대회전한바퀴", role: "manage", avg3c: 0.731, handi3c: 24, handi4c: 25, avg4c: 0.804, joined: 402, intro: "정모 공지 담당" },
    { n: 13, name: "뒤돌리기단골", role: "manage", avg3c: 0.655, handi3c: 22, handi4c: 25, avg4c: 0.742, joined: 388, intro: "뒤돌리기만 파는 중" },
    { n: 14, name: "세워치기달인", role: "member", avg3c: 0.798, handi3c: 25, handi4c: 30, avg4c: 0.861, joined: 351, intro: "두께는 감으로 칩니다" },
    { n: 15, name: "짧은각전문", role: "member", avg3c: 0.689, handi3c: 23, handi4c: 25, avg4c: 0.77, joined: 320, intro: null },
    { n: 16, name: "길게비껴치기", role: "member", avg3c: 0.602, handi3c: 21, handi4c: 20, avg4c: 0.69, joined: 290, intro: "주말에 주로 나와요" },
    { n: 1, name: ME.name, role: "member", avg3c: ME.avg3c, handi3c: ME.handi3c, handi4c: 20, avg4c: ME.avg4c, joined: 219, intro: "올해 목표는 에버 0.6" },
    { n: 17, name: "리버스엔드", role: "member", avg3c: 0.571, handi3c: 20, handi4c: 20, avg4c: 0.655, joined: 240, intro: null },
    { n: 18, name: "제각돌리기", role: "member", avg3c: 0.524, handi3c: 19, handi4c: 20, avg4c: 0.61, joined: 201, intro: "퇴근하고 한 판" },
    { n: 19, name: "더블쿠션러", role: "member", avg3c: 0.487, handi3c: 18, handi4c: 15, avg4c: 0.58, joined: 166, intro: null },
    { n: 20, name: "옆돌리기수련생", role: "member", avg3c: 0.468, handi3c: 18, handi4c: 15, avg4c: 0.552, joined: 133, intro: "옆돌리기 연습 중입니다" },
    { n: 21, name: "초크가루", role: "member", avg3c: 0.445, handi3c: 17, handi4c: 15, avg4c: 0.53, joined: 97, intro: null },
    { n: 22, name: "빈쿠션연습생", role: "member", avg3c: 0.412, handi3c: 16, handi4c: 12, avg4c: 0.49, joined: 64, intro: "빈쿠션이 제일 어려워요" },
    { n: 23, name: "브릿지연습중", role: "member", avg3c: 0.376, handi3c: 15, handi4c: 12, avg4c: 0.45, joined: 31, intro: null },
    { n: 24, name: "앞돌리기새내기", role: "member", avg3c: 0.337, handi3c: 14, handi4c: 10, avg4c: 0.41, joined: 4, intro: "이번 달에 들어왔습니다" },
];
const mid = (m: M) => (m.n === 1 ? ME_ID : id(m.n));
const members = ROSTER.map((m) => ({
    member: {
        id: mid(m), name: m.name, nickname: m.name, profileImageUrl: null, birthYear: null, gender: "male",
        handi3c: m.handi3c, handi4c: m.handi4c, average: m.avg3c, rating3c: Math.round(900 + m.avg3c * 420), rating4c: Math.round(900 + m.avg4c * 260),
        avg3c: m.avg3c, avg4c: m.avg4c, golfHandicap: null, golfBestScore: null, golfAvgScore: null, golfGrade: null, golfGradeVerified: false,
        totalGolfGames: 0, totalSimPoints: 0, introduction: m.intro, createdAt: new Date(Date.now() - (m.joined + 20) * DAY).toISOString(),
    },
    role: m.role, joinedAt: new Date(Date.now() - m.joined * DAY).toISOString(),
    activityCounts: { group1: Math.min(40, Math.round(m.joined / 9)), group2: m.joined > 100 ? 2 : 0, group3: 0 },
}));
const person = (n: number) => { const m = ROSTER.find((r) => r.n === n)!; return { memberId: mid(m), member: { name: m.name, profileImageUrl: null, gender: "male", avg4c: m.avg4c, golfAvgScore: null } }; };

/* ── 정모 — 내가 아직 참석을 누르지 않은 상태(초록 '참여하기'가 보인다). 참가비 칸은 비운다(금액을 싣지 않는다) ───────── */
const GOING = [[11, 12, 14, 16, 18, 20, 22, 24], [11, 13, 15, 17, 19], [11, 12, 13, 14, 1, 17, 19, 21, 22], [11, 12, 14, 15, 1, 16, 18, 20], [11, 13, 14, 1, 17, 21, 23]];
const meetup = (iso: string, i: number, note: string | null) => ({
    id: id(3001 + i), crewId: CREW, creatorId: id(12), title: `${kstMonth(iso)}월 ${kstWeek(iso)} 주 정기 모임`, description: note,
    activityDate: iso, locationStoreId: null, locationName: "크루 단골 당구장", maxParticipants: 12, cost: null,
    sportCategory: "BILLIARDS", category: "REGULAR_BILLIARDS", createdAt: new Date(Date.parse(iso) - 6 * DAY).toISOString(),
    participants: GOING[i % GOING.length].map((n) => ({ activityId: id(3001 + i), ...person(n) })),
});
const activities = upcomingAt.map((iso, i) => meetup(iso, i, i === 0 ? "대대 2대 잡아 뒀어요. 늦으면 채팅에 남겨 주세요." : null));
const pastActivities = pastAt.map((iso, i) => meetup(iso, i + 2, null));
const meetAt = upcomingAt[0];
// 이번 달(한국 시각) 정모 수 — 위 목록에서 센다(요약 줄의 '이번 달 정모'가 목록과 어긋나지 않게)
const monthOf = (iso: string) => { const k = new Date(new Date(iso).getTime() + KST); return k.getUTCFullYear() * 12 + k.getUTCMonth(); };
const monthActivities = [...activities, ...pastActivities].filter((a) => monthOf(a.activityDate) === monthOf(new Date().toISOString())).length;
const pulse = { nextActivityAt: meetAt, monthActivities, activities30: activities.length + pastActivities.length, upcomingWeek: true, posts7: 4 };

/* ── 투표 · 대회 · 명예의 전당 ───────────────────────────────── */
const POLL = id(4001);
const polls = [{
    id: POLL, crewId: CREW, authorId: id(12), title: "다음 달 정모, 몇 시가 좋을까요?", description: null,
    isAnonymous: false, allowMultiple: false, status: "active", endTime: kstAt(3, 22, 0), createdAt: new Date(Date.now() - 1 * DAY).toISOString(),
    author: { id: id(12), name: "대회전한바퀴", profileImageUrl: null },
    options: [
        { id: id(4011), text: WEEKEND ? "오후 2시 그대로" : "저녁 7시 반 그대로", voteCount: 7 },
        { id: id(4012), text: WEEKEND ? "오후 4시" : "저녁 8시", voteCount: 3 },
        { id: id(4013), text: WEEKEND ? "오전 11시" : "저녁 7시", voteCount: 1 },
    ],
    myVoteIds: [id(4011)], totalVotes: 11, voterCount: 11, isClosed: false,
}];
const T_NOW = id(5001), T_FALL = id(5002), T_SUMMER = id(5003), T_4C = id(5004), T_SPRING = id(5005), T_NEWYEAR = id(5006);
const nameOf = (n: number) => ROSTER.find((r) => r.n === n)!.name;
const tour = (tid: string, title: string, status: string, n: number, champion: number | null, agoDays: number) => ({
    id: tid, crewId: CREW, creatorId: id(11), title, description: null, gameType: "3c", format: "knockout", maxPlayers: 16, bestOf: 1,
    recruitEnd: status === "recruiting" ? kstAt(9, 23, 0) : null, startAt: status === "recruiting" ? kstAt(THIS_WEEK + 14, MEET_H, MEET_M) : null, prize: null,
    status, championId: champion ? id(champion) : null, championName: champion ? nameOf(champion) : null,
    createdAt: new Date(Date.now() - (agoDays + 10) * DAY).toISOString(), updatedAt: new Date(Date.now() - agoDays * DAY).toISOString(),
    participantCount: n,
});
const tournaments = [
    tour(T_NOW, `${kstMonth(kstAt(THIS_WEEK + 14, MEET_H, MEET_M))}월 크루 리그전`, "recruiting", 9, null, 0),
    tour(T_FALL, "가을맞이 크루 대회", "ended", 12, 14, 18),
];
// 명예의 전당 — 끝난 대회 다섯(3쿠션 넷 · 4구 하나). 우승·준우승·4강 횟수는 아래 역대 대회와 맞는다(우승 합 = 대회 수).
const pastTour = (tid: string, title: string, gameType: "3c" | "4c", champion: number, agoDays: number) => ({
    id: tid, title, gameType, format: "knockout", championId: mid(ROSTER.find((r) => r.n === champion)!), championName: nameOf(champion),
    endedAt: new Date(Date.now() - agoDays * DAY).toISOString(),
});
const honor = (n: number, gameType: "3c" | "4c", wins: number, runnerUp: number, semi: number, played: number) =>
    ({ memberId: mid(ROSTER.find((r) => r.n === n)!), nickname: nameOf(n), gameType, wins, runnerUp, semi, played });
const history = [
    pastTour(T_FALL, "가을맞이 크루 대회", "3c", 14, 18), pastTour(T_SUMMER, "여름 크루 대회", "3c", 11, 80),
    pastTour(T_4C, "4구 번외 대회", "4c", 16, 121), pastTour(T_SPRING, "봄 크루 대회", "3c", 13, 170), pastTour(T_NEWYEAR, "새해 첫 크루 대회", "3c", 11, 265),
];
const hallOfFame = {
    current: history[0],
    honors: [
        honor(11, "3c", 2, 1, 0, 4), honor(14, "3c", 1, 1, 1, 4), honor(13, "3c", 1, 0, 1, 4), honor(16, "4c", 1, 0, 0, 1),
        honor(12, "3c", 0, 1, 1, 4), honor(1, "3c", 0, 1, 0, 3), honor(17, "4c", 0, 1, 0, 1), honor(15, "3c", 0, 0, 2, 3),
    ],
    history,
};

const crewDetail = { crew, baseStore: null, baseListing: null, members, pulse };
const mine = [{ crew, role: "member", joinedAt: members.find((m) => m.member.id === ME_ID)!.joinedAt, memberCount: members.length, pulse }];

/* ── 크루 목록(/club) 대안 컷용 — 둘러보기에 뜨는 다른 크루들. 이름·지역 모두 지어낸 것(실제 동호회·매장 이름이 아니다) ───── */
const other = (n: number, name: string, gameType: string, region: string, intro: string, count: number, max: number, joinType: string, p: Partial<typeof pulse>) => ({
    ...crew, id: `00000000-0000-4000-8000-0000000c${String(n).padStart(4, "0")}`, name, gameType, region, shortIntro: intro, description: intro, leaderId: id(90 + n),
    maxMembers: max, joinType, meetingDay: null, meetingTime: null, tags: [], createdAt: new Date(Date.now() - (60 + n * 23) * DAY).toISOString(),
    memberCount: count, pulse: { nextActivityAt: null, monthActivities: 0, activities30: 0, upcomingWeek: false, posts7: 0, ...p },
});
const discover = [
    other(4, "퇴근길 4구 한 판", "4c", "서울 서부", "평일 저녁, 가볍게 4구 치는 모임", 23, 30, "auto", { activities30: 5, upcomingWeek: true, posts7: 6 }),
    other(0, "주말 대대 연습반", "3c", "경기 남부", "주말 오전에 대대에서 연습해요", 11, 20, "approval", { activities30: 4, upcomingWeek: true, posts7: 3 }),
    { ...crew, memberCount: members.length, pulse },
    other(2, "3쿠션 첫걸음 모임", "3c", "인천", "처음 시작하는 분들끼리 천천히", 8, 15, "auto", { activities30: 2, upcomingWeek: false, posts7: 2 }),
    other(5, "새벽 큐 모임", "4c", "부산", "일 끝나고 늦게 모이는 사람들", 17, 20, "auto", { activities30: 3, upcomingWeek: true, posts7: 1 }),
    other(3, "동네 당구 친구들", "any", "대전", "3쿠션도 4구도 다 칩니다", 9, 0, "auto", { activities30: 1, upcomingWeek: false, posts7: 0 }),
];

const handler: Handler = ({ path, method, url }) => {
    if (method !== "GET") return PASS;
    const base = `/api/hiq/crews/${CREW}`;
    if (path === base) return crewDetail;
    if (path === `${base}/members`) return members;
    if (path === `${base}/activities`) return url.searchParams.get("past") ? pastActivities : activities;
    if (path === `${base}/polls`) return polls;
    if (path === `${base}/tournaments`) return tournaments;
    if (path === `${base}/tournaments/hall-of-fame`) return hallOfFame;
    if (path === `${base}/challenges`) return { challenges: [], myId: ME_ID };
    if (path === "/api/hiq/crews/mine") return mine;
    if (path === "/api/hiq/crews") return discover;
    return PASS;
};

/* ── 찍기 ─────────────────────────────────────────────────── */
// 수요 모임처럼 요일을 바꿔 찍으면 파일 이름 끝에 요일이 붙는다(05-crew-wed.png) — 기본 컷을 덮어쓰지 않는다.
const TAG = DOW === 6 ? "" : `-${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][DOW]}`;
const file = (alt = "") => `05-crew${alt ? `-${alt}` : ""}${TAG}`;

/** 가짜 응답으로 여는 화면 + 바깥(localhost 가 아닌 곳)으로 나간 요청을 적어 둔다 — 운영으로 나간 것이 없어야 한다 */
async function open(path: string, wait = 3500): Promise<Shot & { outside: Set<string> }> {
    const shot = await openShot(browser, { sport: "BILLIARDS", handler });
    const outside = new Set<string>();
    shot.page.on("request", (r) => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) outside.add(u.hostname); } catch { /* data: 등 */ } });
    await shot.page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await shot.page.waitForTimeout(wait);
    return Object.assign(shot, { outside });
}
/** 크루 홈의 스크롤 상자(main 바로 아래 motion.div)를 y 까지 내린다 */
async function scrollHome(shot: Shot, y: number) {
    await shot.page.evaluate((top) => { const el = document.querySelector("main > div.overflow-y-auto"); if (el) el.scrollTop = top; }, y);
    await shot.page.waitForTimeout(600);
}
/** 찍고, 화면 상태를 적는다 — 뼈대(animate-pulse)·빙글이(animate-spin)·열린 창·가로 넘침·깨진 그림이 있으면 숫자로 보인다 */
async function snap(shot: Shot, name: string) {
    // 글자로 넘긴다 — tsx(esbuild)가 안쪽 함수에 붙이는 __name 도우미가 브라우저에는 없다.
    const a: any = await shot.page.evaluate(`(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
        return {
            skeleton: [...document.querySelectorAll(".animate-pulse")].filter(vis).length,
            spinner: [...document.querySelectorAll(".animate-spin")].filter(vis).length,
            dialog: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(vis).length,
            overflowX: document.documentElement.scrollWidth - innerWidth,
            brokenImg: [...document.images].filter((i) => vis(i) && i.complete && i.naturalWidth === 0).length,
        };
    })()`);
    const out = await capture(shot, name);
    console.log(`[${name}] 뼈대 ${a.skeleton} · 빙글이 ${a.spinner} · 열린 창 ${a.dialog} · 가로 넘침 ${a.overflowX}px · 깨진 그림 ${a.brokenImg} → ${out}`);
}
function done(shot: Shot & { outside: Set<string> }, name: string) {
    report(shot, name);
    console.log(`   바깥 요청: ${shot.outside.size ? [...shot.outside].join(" | ") : "없음"}`);
}

const browser = await chromium.launch();

/* ── 05 크루 홈 — 맨 위(커버 · 이름 · 요약 줄 · 빠른 실행 · 다음 정모) ───────────────── */
{
    const shot = await open(`/crew/${CREW}`);
    await snap(shot, file());

    if (ALT) {
        // 대안: 조금 내려서 — 머리에 크루 이름이 붙고, 다음 정모 · 투표 · 대회가 한 화면에.
        // '다음 정모' 구역이 머리(56px) 아래 30px 에서 시작하게 맞춘다(위의 요일·지역 칩이 머리 밑으로 다 들어가는 자리).
        const meetTop: number = await shot.page.evaluate(`(() => {
            const box = document.querySelector("main > div.overflow-y-auto"), sec = document.querySelector("main article")?.closest("section");
            return box && sec ? box.scrollTop + sec.getBoundingClientRect().top - box.getBoundingClientRect().top - 86 : 0;
        })()`);
        await scrollHome(shot, meetTop);
        await snap(shot, file("meetup"));
        // 대안: 멤버 구역 — 이름 · 등급 · 3쿠션 에버리지가 줄지어 보인다. 구역 제목('멤버 15')이 머리(56px) 아래에 보이게 맞춘다.
        const top: number = await shot.page.evaluate(`(() => {
            const box = document.querySelector("main > div.overflow-y-auto"), sec = document.getElementById("crew-members");
            return box && sec ? box.scrollTop + sec.getBoundingClientRect().top - box.getBoundingClientRect().top - 64 : 0;
        })()`);
        await scrollHome(shot, top);
        await snap(shot, file("members"));
    }
    done(shot, file());
    await shot.ctx.close();
}

if (ALT) {
    /* ── 대안: 명예의 전당 — 크루 안에서 순위가 매겨지는 유일한 화면(현 챔피언 · 종목별 왕 · 우승 순위) ───── */
    {
        const shot = await open(`/crew/${CREW}/hall-of-fame`);
        await snap(shot, file("hall"));
        done(shot, file("hall"));
        await shot.ctx.close();
    }
    /* ── 대안: 크루 목록(/club) — 내 크루 한 줄 + 인기 크루 + 둘러보기 ───────────────── */
    {
        const shot = await open("/club");
        await snap(shot, file("list"));
        done(shot, file("list"));
        await shot.ctx.close();
    }
}

await browser.close();
