/**
 * 비로그인 홈의 **예시 인물 한 명**(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다",
 * "랭킹 1위와 내 수지를 비슷하게"). 화면은 이 값을 실제 카드에 그대로 넣어 그린다 — 그래서 모양이 실제 응답·props 와 같다.
 *
 * 지키는 것
 *  - 예시는 진짜처럼 보이면 안 된다. 이 값을 그리는 카드마다 "예시" 표시(components/hiq/GuestGate 의 SampleBadge)를 붙인다.
 *    덩어리·줄마다 sample: true 가 있다 — 진짜 응답과 섞였을 때 가려낼 수 있게.
 *  - 실제 회원·선수 이름을 쓰지 않는다. 별명은 당구 용어로 지었고, 닮은 프로(pro·next·tier·pos)는 비워 둔다.
 *  - 숫자를 손으로 적지 않는다. 아래 '경기 목록'만 적고 다마(수지)·에버리지·랭킹 점수·전적·순위는 서버와 같은 식으로 센다
 *    (shared/realHandicap 의 handicapFor·nextHandicap, shared/proCompare 의 rankAmong). 시험(guestSample.test.ts)이 같은 함수로 검산한다.
 *  - 날짜가 없다. 예시가 시간이 지나 낡아 보이지 않게 — 순서만 있다(history 는 최신순).
 *
 * 필드 → 어느 카드의 어느 값
 *  GUEST_SAMPLE.sample · .name · .nameKey   예시 인물 표시용 이름("예시 회원"). 당구 화면은 t(nameKey) 로 그린다(다섯 언어).
 *
 *  GUEST_SAMPLE.billiards
 *   .member       회원 행 자리(GET /api/hiq/me 가운데 카드가 읽는 칸).
 *                 RealHandicapCard 기록 띠의 랭킹 점수 = member.rating3c·rating4c, RankingListCard 의 currentMemberId = member.id.
 *   .history      GET /api/hiq/history 모양(최신순, 3쿠션 다음 4구). RealHandicapCard 의 history prop — 전적(승·패·승률)과 최근 5경기 점.
 *   .real         GET /api/hiq/compare/real 응답(RealCompareResponse). RealHandicapCard 의 비교표(나 · 같은 핸디 평균 · 다음 핸디)와
 *                 점수판 카드 MyDamaPanel 의 3쿠션 | 4구 숫자(handi)·근거 한 줄(games·handiAvg).
 *                 닮은 프로는 비웠으므로(pro: null) 3쿠션도 RealHandicapCard 의 '회원끼리' 갈래로 그려진다 — 그 갈래가 쓰는 peers 를 3쿠션에도 채워 뒀다.
 *   .percentile   RealHandicapCard 의 getPercentile(type) 값(랭킹 점수 칸 아래 "상위 n%"). 예시 랭킹 다섯 줄 안에서 센 값이다.
 *   .rankings     GET /api/hiq/rankings?type=3c|4c 응답(매장 랭킹). RankingListCard 의 rankings prop — 탭(3c·4c)마다 다섯 줄.
 *                 **1위가 예시 인물**이고 수지·에버리지·랭킹 점수가 위 카드들과 같은 숫자다. 줄의 average 는 그 탭 종목의 공식 에버리지.
 *
 *  GUEST_SAMPLE.golf
 *   .member       회원 행 자리(golfHandicap·golfAvgScore·golfBestScore·totalGolfGames). HandicapCard 의 member prop.
 *   .history      GET /api/hiq/history?sport=GOLF 모양(최신순). useGameStats·useGolfStats 에 넣으면 아래 값이 그대로 나온다.
 *   .avgScore     HandicapCard 의 avgScore(큰 숫자) = golf/pages/Dashboard 의 effectiveAvg. 평균 타수, 소수 한 자리 글자.
 *   .recentScores StatsChart 의 recentScores(옛 → 최근, 최대 10개) = useGolfStats 의 recentScores.
 *   .stats        StatsChart 의 stats({ bestScore, totalRounds, avgScore }).
 */
import { HANDI_MIN_GAMES, HANDI_RECENT_GAMES, handicapFor, nextHandicap } from "./realHandicap.js";
import { rankAmong, type RealCompareResponse, type RealSide } from "./proCompare.js";
import type { HiqGameHistory, HiqMember } from "./schema.js";

type GT = "3c" | "4c";

/** 예시 인물의 표시용 이름 — 한국어 기본값. 당구 화면은 사전 키(GUEST_SAMPLE.nameKey)로 그린다. */
export const GUEST_SAMPLE_NAME = "예시 회원";

/* ── 모양 ─────────────────────────────────────────────────────────── */

/** 회원 행 가운데 랭킹·기록 카드가 읽는 칸(shared/schema hiqMembers — 칸 이름이 바뀌면 여기서 타입 오류가 난다) */
type MemberCols = "id" | "name" | "handi3c" | "handi4c" | "rating3c" | "rating4c" | "avg3c" | "avg4c" | "average";
export type GuestSampleMember = { sample: true; /** 이름의 사전 키(client/src/lib/i18n) */ nameKey: string }
    & { [K in MemberCols]: NonNullable<HiqMember[K]> };

/** 경기 기록 한 줄 — hiq_game_history 가운데 카드·집계 훅이 읽는 칸 */
type HistoryCols = "sportCategory" | "gameMode" | "gameType" | "isRanked" | "isWinner" | "score" | "innings" | "average" | "highRun" | "onSite";
export type GuestSampleGame = { sample: true } & Pick<HiqGameHistory, HistoryCols>;

export interface GuestSampleBilliards {
    sample: true;
    name: string;
    nameKey: string;
    member: GuestSampleMember;
    history: GuestSampleGame[];
    real: RealCompareResponse;
    percentile: Record<GT, number>;
    rankings: Record<GT, GuestSampleMember[]>;
}

export interface GuestSampleGolf {
    sample: true;
    name: string;
    nameKey: string;
    member: { sample: true; id: string; name: string; nameKey: string; golfHandicap: number; golfAvgScore: number; golfBestScore: number; totalGolfGames: number };
    history: GuestSampleGame[];
    avgScore: string;
    recentScores: { id: number; score: number }[];
    stats: { bestScore: number; totalRounds: number; avgScore: string };
}

/* ── 당구: 적는 것은 경기 목록뿐 ──────────────────────────────────── */

interface Played { score: number; innings: number; highRun: number; win: boolean }

// 예시 인물의 공식(랭크) 3쿠션 경기 12판 — 최신순. 목표 20점을 채우면 이긴 판이다.
const ME_3C: Played[] = [
    { score: 20, innings: 34, highRun: 4, win: true },
    { score: 20, innings: 38, highRun: 3, win: true },
    { score: 16, innings: 33, highRun: 3, win: false },
    { score: 20, innings: 31, highRun: 5, win: true },
    { score: 20, innings: 36, highRun: 4, win: true },
    { score: 17, innings: 35, highRun: 2, win: false },
    { score: 20, innings: 40, highRun: 3, win: true },
    { score: 20, innings: 33, highRun: 4, win: true },
    { score: 15, innings: 30, highRun: 3, win: false },
    { score: 20, innings: 37, highRun: 3, win: true },
    { score: 20, innings: 39, highRun: 4, win: true },
    { score: 14, innings: 33, highRun: 2, win: false },
];

// 같은 사람의 공식 4구 경기 8판 — 최신순. 점수판의 '내 다마' 4구 칸과 랭킹 4구 탭이 비지 않게 둔다.
const ME_4C: Played[] = [
    { score: 20, innings: 29, highRun: 6, win: true },
    { score: 16, innings: 26, highRun: 4, win: false },
    { score: 20, innings: 31, highRun: 5, win: true },
    { score: 20, innings: 27, highRun: 7, win: true },
    { score: 15, innings: 25, highRun: 4, win: false },
    { score: 20, innings: 30, highRun: 5, win: true },
    { score: 17, innings: 27, highRun: 4, win: false },
    { score: 20, innings: 33, highRun: 5, win: true },
];

/** 한 종목의 합계 — 랭킹의 나머지 네 줄은 경기 목록 없이 합계만 적는다 */
interface Tally { wins: number; losses: number; score: number; innings: number; highRun: number }

// 예시 랭킹의 나머지 넷. 이름은 당구 용어로 지은 별명 — 사람 이름처럼 읽히지 않게.
const OTHERS: { id: string; name: string; nameKey: string; "3c": Tally; "4c": Tally }[] = [
    {
        id: "guest-sample-2", name: "빈쿠션연습생", nameKey: "guest.sampleNick2",
        "3c": { wins: 7, losses: 5, score: 219, innings: 421, highRun: 4 },
        "4c": { wins: 4, losses: 3, score: 124, innings: 200, highRun: 6 },
    },
    {
        id: "guest-sample-3", name: "옆돌리기수련생", nameKey: "guest.sampleNick3",
        "3c": { wins: 5, losses: 3, score: 124, innings: 282, highRun: 4 },
        "4c": { wins: 3, losses: 2, score: 71, innings: 151, highRun: 5 },
    },
    {
        id: "guest-sample-4", name: "대회전한바퀴", nameKey: "guest.sampleNick4",
        "3c": { wins: 4, losses: 4, score: 118, innings: 288, highRun: 3 },
        "4c": { wins: 2, losses: 4, score: 60, innings: 166, highRun: 4 },
    },
    {
        id: "guest-sample-5", name: "뒤돌리기단골", nameKey: "guest.sampleNick5",
        "3c": { wins: 3, losses: 5, score: 92, innings: 279, highRun: 3 },
        "4c": { wins: 1, losses: 3, score: 31, innings: 100, highRun: 3 },
    },
];

/* ── 당구: 서버와 같은 식 ─────────────────────────────────────────── */

/** 경기 한 판의 에버리지 글자 — 서버가 기록에 적는 꼴(server/storage/game.repo.ts saveHistory: 소수 둘째 자리) */
const gameAverage = (g: Played) => (g.score / (g.innings || 1)).toFixed(2);

/**
 * 랭킹 점수(RP) 증감 — server/storage/game.repo.ts 의 rpDeltaFor 와 같은 식. 서버 모듈은 DB 를 물고 있어 shared 에서 못 가져온다
 * (시험이 진짜 rpDeltaFor 로 대조한다). 승리 +30, 패배는 핸디 구간에 따라 0 · -5 · -15.
 */
function rpDelta(type: GT, win: boolean, handi: number): number {
    if (win) return 30;
    if (type === "3c") return handi < 16 ? 0 : handi < 22 ? -5 : -15;
    return handi < 12 ? 0 : handi < 25 ? -5 : -15;
}

interface Side { wins: number; losses: number; games: number; avg: number; handiAvg: number; handi: number; highRun: number; rp: number }

/**
 * 합계 → 한 종목의 숫자들.
 *  - avg: 프로필 에버리지 = 총 득점 ÷ 총 이닝(game.repo _updateUserAverage)
 *  - handi: 핸디 기준 평균(handiAvg)을 기준표에 넣은 값(shared/realHandicap) — 지어낸 조합이 아니다
 *  - rp: 지금 핸디로 승·패를 센 값. 실제 RP 는 판마다 그때의 핸디로 쌓이지만 예시는 핸디가 변하지 않은 사람으로 본다.
 */
function sideOf(type: GT, t: Tally, handiAvg?: number): Side {
    const avg = t.score / t.innings;
    const basis = handiAvg ?? avg;
    const handi = handicapFor(basis, type);
    const rp = Math.max(0, t.wins * rpDelta(type, true, handi) + t.losses * rpDelta(type, false, handi));
    return { wins: t.wins, losses: t.losses, games: t.wins + t.losses, avg, handiAvg: basis, handi, highRun: t.highRun, rp };
}

/** 예시 인물 — 경기 목록에서 합계와 핸디 기준 평균을 낸다 */
function mySide(type: GT, games: Played[]): Side {
    const tally: Tally = {
        wins: games.filter((g) => g.win).length,
        losses: games.filter((g) => !g.win).length,
        score: games.reduce((a, g) => a + g.score, 0),
        innings: games.reduce((a, g) => a + g.innings, 0),
        highRun: Math.max(...games.map((g) => g.highRun)),
    };
    // 핸디 기준 = 최근 공식 10경기의 '경기별 에버리지' 평균(server/storage/compare.repo.ts handiBasis · game.repo checkAndUpdateHandicap)
    const recent = games.slice(0, HANDI_RECENT_GAMES).map((g) => parseFloat(gameAverage(g)));
    return sideOf(type, tally, recent.reduce((a, b) => a + b, 0) / recent.length);
}

const ME_ID = "guest-sample-1";
const ME_NAME_KEY = "guest.sampleName";
const ME_GAMES: Record<GT, Played[]> = { "3c": ME_3C, "4c": ME_4C };

const PEOPLE: { id: string; name: string; nameKey: string; "3c": Side; "4c": Side }[] = [
    { id: ME_ID, name: GUEST_SAMPLE_NAME, nameKey: ME_NAME_KEY, "3c": mySide("3c", ME_3C), "4c": mySide("4c", ME_4C) },
    ...OTHERS.map((o) => ({ id: o.id, name: o.name, nameKey: o.nameKey, "3c": sideOf("3c", o["3c"]), "4c": sideOf("4c", o["4c"]) })),
];
const ME = PEOPLE[0];

/** 랭킹 한 줄 — average 는 그 탭 종목의 공식 에버리지(server/storage/user.repo.ts getTopRankings: 소수 셋째 자리 글자) */
const rankRow = (p: (typeof PEOPLE)[number], type: GT): GuestSampleMember => ({
    sample: true,
    id: p.id, name: p.name, nameKey: p.nameKey,
    handi3c: p["3c"].handi, handi4c: p["4c"].handi,
    rating3c: p["3c"].rp, rating4c: p["4c"].rp,
    avg3c: p["3c"].avg, avg4c: p["4c"].avg,
    average: p[type].avg.toFixed(3),
});

const rankingOf = (type: GT): GuestSampleMember[] => {
    const field = type === "3c" ? "rating3c" : "rating4c";
    return PEOPLE.map((p) => rankRow(p, type)).sort((a, b) => b[field] - a[field]);
};
const RANKINGS: Record<GT, GuestSampleMember[]> = { "3c": rankingOf("3c"), "4c": rankingOf("4c") };

/** 상위 % — 홈이 매장 랭킹 목록으로 세는 식 그대로(client/src/pages/hiq/dashboard.tsx getPercentile) */
const percentileOf = (type: GT): number => {
    const rows = RANKINGS[type];
    const i = rows.findIndex((r) => r.id === ME_ID);
    return Math.max(1, Math.round(((i + 1) / rows.length) * 100));
};

/** 같은 핸디 사람들(나 포함) — 인원·평균 에버·평균 최고 하이런(server/storage/compare.repo.ts peers). 예시 다섯 명 안에서 센다. */
const peersOf = (type: GT, handi: number): NonNullable<RealSide["peers"]> => {
    const same = PEOPLE.filter((p) => p[type].handi === handi);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return { count: same.length, avg: mean(same.map((p) => p[type].avg)), highRun: mean(same.map((p) => p[type].highRun)) };
};

/** GET /api/hiq/compare/real 의 한 종목(server/routes/modules/compare.ts side) */
const realSide = (type: GT): RealSide => {
    const s = ME[type];
    const up = nextHandicap(s.handiAvg, type);
    return {
        type,
        games: s.games,
        needed: HANDI_MIN_GAMES,
        ready: true,
        avg: s.avg,
        handiAvg: s.handiAvg,
        highRun: s.highRun,
        winRate: s.wins / s.games,
        handi: s.handi,
        // 회원 분포가 아니라 예시 다섯 명 안에서의 순위다 — 진짜 회원 수를 꾸며 내지 않는다
        members: rankAmong(PEOPLE.map((p) => p[type].avg).sort((a, b) => b - a), s.avg),
        nextHandi: up ? { handi: up.handi, avg: up.avg, gap: Math.max(0.001, up.avg - s.handiAvg) } : null,
        // 닮은 프로·다음 프로·재미 등급은 실제 선수 기록이라 예시에 넣지 않는다
        pro: null, next: null, tier: null, pos: null,
        peers: peersOf(type, s.handi),
    };
};

const billiardsHistory: GuestSampleGame[] = (["3c", "4c"] as const).flatMap((type) =>
    ME_GAMES[type].map((g): GuestSampleGame => ({
        sample: true,
        sportCategory: "BILLIARDS",
        gameMode: "match",
        gameType: type,
        isRanked: true,
        isWinner: g.win,
        score: g.score,
        innings: g.innings,
        average: gameAverage(g),
        highRun: g.highRun,
        onSite: null,
    })),
);

/* ── 골프: 적는 것은 라운드 타수뿐 ────────────────────────────────── */

// 예시 인물의 18홀 공식 라운드 타수 — 옛 → 최근. 조금씩 줄어드는 보기 플레이어.
const GOLF_ROUNDS: number[] = [96, 94, 95, 91, 93, 89, 90, 88];
const GOLF_HOLES = 18;
/** 핸디캡 ≈ 평균 타수 − 파 72. 서버 랭킹이 평균이 없을 때 쓰는 어림(server/storage/user.repo.ts getTopRankings: 핸디캡 + 72)과 같은 기준. */
const GOLF_PAR = 72;

const golfAvg = GOLF_ROUNDS.reduce((a, b) => a + b, 0) / GOLF_ROUNDS.length;
// 평균 타수 글자 — 소수 한 자리(client/src/hooks/useGameStats.ts cumulativeAverage · golf/hooks/useGolfStats.ts avgScore)
const golfAvgText = golfAvg.toFixed(1);
const golfBest = Math.min(...GOLF_ROUNDS);

const golfHistory: GuestSampleGame[] = [...GOLF_ROUNDS].reverse().map((score): GuestSampleGame => ({
    sample: true,
    sportCategory: "GOLF",
    gameMode: "match",
    gameType: "golf",
    isRanked: true,
    isWinner: false,
    score,
    innings: GOLF_HOLES,
    // 서버가 골프 기록에 적는 꼴(server/storage/golf.repo.ts: 타수 ÷ 18, 소수 둘째 자리)
    average: (score / GOLF_HOLES).toFixed(2),
    highRun: 0,
    // 공식 라운드(현장 인증) — 홈 평균은 공식만 센다(shared/golfOnSite countsOnSite)
    onSite: true,
}));

/* ── 내보내는 값 ──────────────────────────────────────────────────── */

export const GUEST_SAMPLE: { sample: true; name: string; nameKey: string; billiards: GuestSampleBilliards; golf: GuestSampleGolf } = {
    sample: true,
    name: GUEST_SAMPLE_NAME,
    nameKey: ME_NAME_KEY,
    billiards: {
        sample: true,
        name: GUEST_SAMPLE_NAME,
        nameKey: ME_NAME_KEY,
        // 공용 average 칸은 실제로도 '마지막에 친 종목' 값이 남는다 — 예시 인물은 3쿠션이 주 종목
        member: rankRow(ME, "3c"),
        history: billiardsHistory,
        real: { "3c": realSide("3c"), "4c": realSide("4c"), preferred: "3c" },
        percentile: { "3c": percentileOf("3c"), "4c": percentileOf("4c") },
        rankings: RANKINGS,
    },
    golf: {
        sample: true,
        name: GUEST_SAMPLE_NAME,
        nameKey: ME_NAME_KEY,
        member: {
            sample: true,
            id: ME_ID, name: GUEST_SAMPLE_NAME, nameKey: ME_NAME_KEY,
            golfHandicap: Math.round(golfAvg - GOLF_PAR),
            golfAvgScore: golfAvg,
            golfBestScore: golfBest,
            totalGolfGames: GOLF_ROUNDS.length,
        },
        history: golfHistory,
        avgScore: golfAvgText,
        // 그래프는 옛 → 최근, 최근 10개까지(useGolfStats 와 같은 순서·개수)
        recentScores: GOLF_ROUNDS.slice(-10).map((score, id) => ({ id, score })),
        stats: { bestScore: golfBest, totalRounds: GOLF_ROUNDS.length, avgScore: golfAvgText },
    },
};
