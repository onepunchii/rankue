/**
 * 어드민 · 회원 한 명의 '활동 기록'(2026-10-12 오너: "어드민 대시보드에 회원 내역 나오잖아 — 그거 클릭하면 관리에 탭 하나 더 만들어 줘.
 * 일자별로 어떠한 클릭을 했고 활동을 했는지").
 *
 * 회원 상세 창 → 관리 → '활동 기록'. 한 사람이 **날짜별로 언제 들어와 무엇을 보고 누르고 무엇을 했는지**를 한 줄씩 읽는다.
 * 새로 모으는 것은 없다 — 이미 남는 기록을 한 사람 기준으로 모아 날짜로 접는다:
 *   접속       hiq_app_sessions(앱·웹) — 30분 넘게 비었다가 다시 열면 새 접속(친구 접속 배너와 같은 기준)
 *   화면·누름  ui_events(방문자 발자국, shared/uiTrail) — **웹에서 로그인한 채 쓴 것만**. 앱 안은 모으지 않는다(TRAIL_IN_APP)
 *   경기       hiq_game_history(당구 점수판·골프 라운드)
 *   온라인게임 hiq_sim_sessions·hiq_sim_matches·hiq_sim_drill_attempts
 *   골프       라운드 시작·조인/부킹 글·신청·관심 골프장·현장 인증·사진
 *   글·채팅    커뮤니티 글·댓글, 크루 글·가입, 채팅(**건수만 — 내용은 읽지 않는다**), 친구, 선수 팔로우·응원
 *   기타       신고·건의·가입
 *
 * 여기는 셈만 둔다(시험할 수 있게). 질의는 server/storage/adminMemberActivity, 화면은 client pages/admin/MemberActivitySheet.
 * 시각은 전부 **한국 시각 글자**("2026-10-12T14:03:11")로 주고받는다 — 서버가 SQL 에서 바꿔 준다(raw SQL 의 Date 는 기기 시각으로 읽혀 9시간 어긋난다).
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙) — 이 파일은 아무것도 임포트하지 않는다.
 */

/** 볼 수 있는 기간(일) — 화면의 칩과 서버 검사가 같이 쓴다 */
export const ACTIVITY_DAYS = [7, 30, 90] as const;
export type ActivityDays = (typeof ACTIVITY_DAYS)[number];
export const ACTIVITY_DEFAULT_DAYS: ActivityDays = 30;
export const activityDaysOf = (v: unknown): ActivityDays => {
    const n = parseInt(String(v), 10);
    return (ACTIVITY_DAYS as readonly number[]).includes(n) ? (n as ActivityDays) : ACTIVITY_DEFAULT_DAYS;
};

/** 한 번에 읽는 줄 수의 상한 — 넘으면 오래된 쪽이 잘리고 화면이 그렇게 말한다(capped) */
export const ACTIVITY_LIMITS = { sessions: 4000, trail: 2500, records: 2000 } as const;
/** 이만큼(분) 넘게 비었다가 다시 열면 새 접속 — 친구 접속 배너(storage/presence.repo)의 '들어왔다'와 같다 */
export const VISIT_GAP_MIN = 30;

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 기간의 시작 — 한국 자정((days-1)일 전). UTC ISO 글자로 준다(SQL 에 ::timestamptz 로 넣는다) */
export function activitySinceIso(now: Date, days: number): string {
    const kstMidnight = Math.floor((now.getTime() + KST_MS) / DAY_MS) * DAY_MS;
    return new Date(kstMidnight - (days - 1) * DAY_MS - KST_MS).toISOString();
}

/** 그 시작 시각의 한국 날짜("2026-09-13") */
export const activityFromDay = (sinceIso: string): string => new Date(Date.parse(sinceIso) + KST_MS).toISOString().slice(0, 10);

// ── 받는 것(서버 질의의 줄) ─────────────────────────────────────────────────────

/** 앱 세션 한 줄. end = 닫힌 시각, 없으면 마지막으로 살아 있던 시각 */
export interface ActivitySessionRow { open: string; end: string; platform: string }
/** 발자국 한 줄(화면 이동·누름·열림) */
export interface ActivityTrailRow { at: string; name: string; path: string; l?: string | null; h?: string | null; ref?: string | null }
/**
 * 그 밖의 기록 한 줄 — 표마다 모양이 달라 칸을 넉넉히 둔다(무엇이 어느 칸인지는 kind 마다 아래 RECORD 에).
 * a·b·c·d 글자 · n·m 숫자 · f·g 참거짓
 */
export interface ActivityRecordRow {
    at: string; kind: string;
    a?: string | null; b?: string | null; c?: string | null; d?: string | null;
    n?: number | string | null; m?: number | string | null;
    f?: boolean | null; g?: boolean | null;
}

// ── 주는 것(화면이 그대로 그린다) ────────────────────────────────────────────────

export type ActivityGroup = "visit" | "trail" | "game" | "sim" | "golf" | "social" | "etc";
export const ACTIVITY_GROUPS: { id: ActivityGroup; label: string }[] = [
    { id: "visit", label: "접속" },
    { id: "trail", label: "화면·누름" },
    { id: "game", label: "경기" },
    { id: "sim", label: "온라인게임" },
    { id: "golf", label: "골프" },
    { id: "social", label: "글·채팅" },
    { id: "etc", label: "기타" },
];
export type ActivityTone = "strong" | "win" | "lose" | "warn" | "dim";
export interface ActivityItem {
    /** 한국 시각 글자 */
    at: string;
    group: ActivityGroup;
    /** 줄 앞의 짧은 이름표(접속·화면·누름·경기…) */
    tag: string;
    text: string;
    /** 덧붙이는 흐린 글자(간 곳·상대·유입처) */
    sub?: string;
    tone?: ActivityTone;
}
export interface ActivityDay {
    /** "2026-10-12" (한국 날짜) */
    day: string;
    /** 접속 횟수(묶은 뒤) · 쓴 시간(분) · 쓴 기기 */
    visits: number;
    minutes: number;
    platforms: string[];
    /** 그날의 묶음별 줄 수 — 요약 칩과 거르기에 쓴다 */
    counts: Partial<Record<ActivityGroup, number>>;
    pages: number;
    clicks: number;
    /** 시간순(이른 것부터) */
    items: ActivityItem[];
}
export interface MemberActivity {
    days: ActivityDays;
    /** 기간의 첫 날(한국 날짜) */
    from: string;
    /** 상한에 걸려 오래된 쪽이 잘린 묶음 */
    capped: ActivityGroup[];
    /** 기간 합계 */
    totals: { activeDays: number; visits: number; minutes: number; pages: number; clicks: number };
    /** 최근 날짜부터 */
    list: ActivityDay[];
}

// ── 접속 묶기 ───────────────────────────────────────────────────────────────────

const ms = (kst: string): number => Date.parse(`${kst}Z`);
const hm = (kst: string): string => kst.slice(11, 16);
const dayOf = (kst: string): string => kst.slice(0, 10);

export const PLATFORM_LABEL: Record<string, string> = { ios: "아이폰 앱", android: "안드로이드 앱", web: "웹" };
const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p;

export interface ActivityVisit { open: string; end: string; seconds: number; platforms: string[]; sessions: number }

/**
 * 세션들을 '접속'으로 묶는다 — 앞 접속이 끝난 뒤 VISIT_GAP_MIN 분 안에 다시 열린 세션은 같은 접속이다.
 * 화면을 옮길 때마다 세션이 새로 열리는 사람(웹)이 하루 수백 줄이 되는 것을 막는다. 쓴 시간은 세션 길이의 합(빈 시간은 세지 않는다).
 * 날짜가 바뀌면 끊는다(하루 단위로 읽으니까).
 */
export function foldVisits(rows: ActivitySessionRow[]): ActivityVisit[] {
    const sorted = rows
        .filter((r) => r && typeof r.open === "string" && Number.isFinite(ms(r.open)))
        .map((r) => ({ ...r, end: typeof r.end === "string" && ms(r.end) >= ms(r.open) ? r.end : r.open }))
        .sort((a, b) => ms(a.open) - ms(b.open));
    const out: ActivityVisit[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        const len = Math.max(0, Math.round((ms(r.end) - ms(r.open)) / 1000));
        if (last && dayOf(last.open) === dayOf(r.open) && ms(r.open) - ms(last.end) <= VISIT_GAP_MIN * 60_000) {
            if (ms(r.end) > ms(last.end)) last.end = r.end;
            last.seconds += len;
            last.sessions += 1;
            if (!last.platforms.includes(r.platform)) last.platforms.push(r.platform);
        } else {
            out.push({ open: r.open, end: r.end, seconds: len, platforms: [r.platform], sessions: 1 });
        }
    }
    return out;
}

/** "38분" · "1시간 12분" · 1분이 안 되면 "1분 미만" */
export function minutesLabel(seconds: number): string {
    if (seconds < 60) return "1분 미만";
    const m = Math.round(seconds / 60);
    return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;
}

// ── 기록 한 줄 → 글 ─────────────────────────────────────────────────────────────

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const show = (p: string): string => { try { return decodeURIComponent(p); } catch { return p; } };

const GAME_TYPE: Record<string, string> = { "3c": "3쿠션", "4c": "4구", golf: "골프" };
const GAME_MODE: Record<string, string> = { match: "대결", practice: "연습", tournament: "대진" };
const SIM_END: Record<string, string> = { resign: "기권으로 끝남", timeout: "시간 초과로 끝남", inningCap: "이닝 제한으로 끝남" };
const CHAT_ROOM: Record<string, string> = { dm: "1:1", crew: "크루", support: "문의", listing: "조인·부킹", booking: "조인·부킹", join: "조인·부킹", match: "대전" };
const JOIN_STATUS: Record<string, string> = { applied: "신청 중", accepted: "승인됨", rejected: "거절됨", cancelled: "취소함", noshow: "노쇼로 표시됨" };
const REPORT_TARGET: Record<string, string> = { member: "회원", golf_booking: "조인·부킹 글", post: "커뮤니티 글", comment: "댓글", chat: "채팅", crew_post: "크루 글", photo: "사진", sim_match: "온라인게임 방", cheer: "응원 글" };
const SUGGEST_TYPE: Record<string, string> = { BUG: "오류 신고", FEATURE: "기능 제안", PARTNERSHIP: "제휴 문의", ETC: "기타" };
const FOLLOW_CAT: Record<string, string> = { pba: "PBA", players: "세계랭킹", golf: "골프" };

type Line = Omit<ActivityItem, "at">;
/**
 * kind 마다 어느 칸이 무엇인지와 글. 모르는 kind 는 버린다(질의와 여기가 어긋나면 줄이 사라지지, 엉뚱한 글이 나오지 않는다).
 * 질의(server/storage/adminMemberActivity)의 주석과 같은 순서다.
 */
const RECORD: Record<string, (r: ActivityRecordRow) => Line | null> = {
    // a 종목 · b 방식 · c 상대(골프는 골프장) · d 골프 코스 · n 점수(골프는 타수) · m 이닝 · f 이겼나 · g 랭킹전인가(골프는 현장 인증)
    game: (r) => {
        const type = str(r.a);
        if (type === "golf") {
            const where = [str(r.c), str(r.d) && `(${str(r.d)})`].filter(Boolean).join(" ");
            return { group: "golf", tag: "라운드", tone: "strong", text: `골프 라운드 기록 · ${num(r.n)}타`, sub: [where, r.g ? "현장 인증" : ""].filter(Boolean).join(" · ") || undefined };
        }
        const mode = str(r.b);
        const head = `${GAME_TYPE[type] ?? type} ${GAME_MODE[mode] ?? mode}${mode === "match" && !r.g ? "(친선)" : ""}`;
        const result = mode === "practice" ? "" : r.f ? "승 · " : "패 · ";
        return {
            group: "game", tag: "경기", tone: mode === "practice" ? "strong" : r.f ? "win" : "lose",
            text: `${head} · ${result}${num(r.n)}점 / ${num(r.m)}이닝`,
            sub: str(r.c) ? `상대 ${str(r.c)}` : undefined,
        };
    },
    // 하루·종목별로 접은 줄. a 종목 · n 판 수 · m 끝까지 친 판
    sim: (r) => ({ group: "sim", tag: "연습", text: `온라인 연습 · ${GAME_TYPE[str(r.a)] ?? str(r.a)} ${num(r.n)}판`, sub: num(r.m) ? `끝까지 ${num(r.m)}판` : "끝까지 친 판 없음" }),
    // 끝난 대전 한 판. a 종목 · b 끝난 사유 · c 상대 · f 이겼나(승자가 없으면 null) · g 방을 만든 쪽인가
    simMatch: (r) => ({
        group: "sim", tag: "대전", tone: r.f == null ? "strong" : r.f ? "win" : "lose",
        text: `온라인 대전 · ${GAME_TYPE[str(r.a)] ?? str(r.a)} · ${r.f == null ? "승부 없음" : r.f ? "승" : "패"}`,
        sub: [str(r.c) && `상대 ${str(r.c)}`, r.g ? "방 만듦" : "방에 들어감", SIM_END[str(r.b)] ?? ""].filter(Boolean).join(" · "),
    }),
    // 만들었다가 상대 없이 닫은 방 — 하루로 접은 줄. n 횟수
    simRoom: (r) => ({ group: "sim", tag: "대전", tone: "dim", text: `온라인 대전 방을 만들었다 닫음 ${num(r.n)}번` }),
    // 하루로 접은 줄. n 시도 · m 성공
    drill: (r) => ({ group: "sim", tag: "연습", text: `이번 주 과제 ${num(r.n)}번 시도`, sub: `성공 ${num(r.m)}번` }),
    // a 상태 · c 골프장
    golfStart: (r) => ({ group: "golf", tag: "라운드", text: `골프 라운드 시작${str(r.c) ? ` · ${str(r.c)}` : ""}`, sub: str(r.a) === "abandoned" ? "끝내지 않고 닫음" : str(r.a) === "finished" ? undefined : "진행 중" }),
    // a 글 종류(JOIN·BOOKING) · c 골프장 · f 가려졌나
    golfPost: (r) => ({ group: "golf", tag: "글", tone: "strong", text: `${str(r.a) === "JOIN" ? "조인" : "부킹"} 글 올림${str(r.c) ? ` · ${str(r.c)}` : ""}`, sub: r.f ? "가려진 글" : undefined }),
    // a 지금 상태 · c 골프장
    golfApply: (r) => ({ group: "golf", tag: "신청", tone: "strong", text: `조인·부킹 신청${str(r.c) ? ` · ${str(r.c)}` : ""}`, sub: JOIN_STATUS[str(r.a)] ?? (str(r.a) || undefined) }),
    // c 골프장
    golfWatch: (r) => ({ group: "golf", tag: "관심", text: `관심 골프장 등록${str(r.c) ? ` · ${str(r.c)}` : ""}` }),
    // 하루로 접은 줄. n 횟수 · m 확인된 횟수
    golfCheckin: (r) => ({ group: "golf", tag: "인증", text: `골프장 현장 인증 ${num(r.n)}번`, sub: num(r.m) ? `확인됨 ${num(r.m)}번` : "거리 확인 안 됨" }),
    // 하루로 접은 줄. n 장 수
    golfPhoto: (r) => ({ group: "golf", tag: "사진", text: `라운드 사진 ${num(r.n)}장 올림` }),
    // c 제목 · f 가려졌나
    post: (r) => ({ group: "social", tag: "글", tone: "strong", text: `커뮤니티 글${str(r.c) ? ` · ${str(r.c)}` : ""}`, sub: r.f ? "가려진 글" : undefined }),
    // 하루로 접은 줄. n 개수
    comment: (r) => ({ group: "social", tag: "댓글", text: `커뮤니티 댓글 ${num(r.n)}개` }),
    // c 제목
    crewPost: (r) => ({ group: "social", tag: "글", text: `크루 글${str(r.c) ? ` · ${str(r.c)}` : ""}` }),
    // c 크루 이름
    crewJoin: (r) => ({ group: "social", tag: "크루", tone: "strong", text: `크루 가입${str(r.c) ? ` · ${str(r.c)}` : ""}` }),
    // c 상대 이름
    friend: (r) => ({ group: "social", tag: "친구", text: `친구 추가${str(r.c) ? ` · ${str(r.c)}` : ""}` }),
    // a 분류
    follow: (r) => ({ group: "social", tag: "팔로우", text: `선수 팔로우 · ${FOLLOW_CAT[str(r.a)] ?? str(r.a)}` }),
    cheer: () => ({ group: "social", tag: "응원", text: "선수 응원 글 남김" }),
    // a 대상 종류
    report: (r) => ({ group: "etc", tag: "신고", tone: "warn", text: `신고함 · ${REPORT_TARGET[str(r.a)] ?? str(r.a)}` }),
    // a 종류
    suggest: (r) => ({ group: "etc", tag: "건의", tone: "strong", text: `건의 보냄 · ${SUGGEST_TYPE[str(r.a)] ?? str(r.a)}` }),
    signup: () => ({ group: "etc", tag: "가입", tone: "strong", text: "랭큐 가입" }),
};

function trailLine(r: ActivityTrailRow): Line | null {
    if (r.name === "page") return { group: "trail", tag: "화면", tone: "strong", text: show(str(r.path)), sub: str(r.ref) ? `${str(r.ref)}에서` : undefined };
    if (r.name === "click" && str(r.l)) return { group: "trail", tag: "누름", text: `“${str(r.l)}”`, sub: str(r.h) ? `→ ${show(str(r.h))}` : undefined };
    if (r.name === "open" && str(r.l)) return { group: "trail", tag: "열림", tone: "warn", text: str(r.l) };
    return null;
}

// ── 날짜로 접기 ─────────────────────────────────────────────────────────────────

const validAt = (at: unknown): at is string => typeof at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(at);

export interface ActivityInput {
    days: ActivityDays;
    /** 기간의 첫 날(한국 날짜) */
    from: string;
    sessions: ActivitySessionRow[];
    trail: ActivityTrailRow[];
    records: ActivityRecordRow[];
}

/**
 * 세 묶음의 줄을 날짜별로 접는다. 날짜는 최근부터, 날 안에서는 이른 시각부터(들어와서 → 보고 → 누르고 → 한 일 순으로 읽힌다).
 * 채팅은 하루 한 줄로 합친다(방 종류별 건수) — 내용은 애초에 읽지 않는다.
 */
export function buildMemberActivity(input: ActivityInput): MemberActivity {
    const days = new Map<string, ActivityDay>();
    const dayFor = (at: string): ActivityDay => {
        const d = dayOf(at);
        let v = days.get(d);
        if (!v) days.set(d, (v = { day: d, visits: 0, minutes: 0, platforms: [], counts: {}, pages: 0, clicks: 0, items: [] }));
        return v;
    };
    const put = (at: string, line: Line) => {
        const d = dayFor(at);
        d.items.push({ at, ...line });
        d.counts[line.group] = (d.counts[line.group] ?? 0) + 1;
    };

    const secondsOf = new Map<string, number>();
    for (const v of foldVisits(input.sessions ?? [])) {
        const d = dayFor(v.open);
        d.visits += 1;
        secondsOf.set(d.day, (secondsOf.get(d.day) ?? 0) + v.seconds);
        for (const p of v.platforms) if (!d.platforms.includes(p)) d.platforms.push(p);
        put(v.open, {
            group: "visit", tag: "접속", tone: "strong",
            text: `${v.platforms.map(platformLabel).join(" · ")}으로 들어옴`,
            sub: [hm(v.open) === hm(v.end) ? "" : `${hm(v.end)}까지`, `쓴 시간 ${minutesLabel(v.seconds)}`, v.sessions > 1 ? `${v.sessions}번 열고 닫음` : ""].filter(Boolean).join(" · "),
        });
    }
    for (const [d, s] of secondsOf) days.get(d)!.minutes = Math.round(s / 60);

    for (const r of input.trail ?? []) {
        if (!r || !validAt(r.at)) continue;
        const line = trailLine(r);
        if (!line) continue;
        put(r.at, line);
        const d = dayFor(r.at);
        if (r.name === "page") d.pages += 1; else if (r.name === "click") d.clicks += 1;
    }

    // 채팅 — (날짜, 방 종류)별 건수 줄을 하루 한 줄로
    const chat = new Map<string, { at: string; total: number; rooms: Map<string, number> }>();
    for (const r of input.records ?? []) {
        if (!r || !validAt(r.at)) continue;
        if (r.kind === "chat") {
            const key = dayOf(r.at), n = num(r.n);
            if (n <= 0) continue;
            const c = chat.get(key) ?? (chat.set(key, { at: r.at, total: 0, rooms: new Map() }), chat.get(key)!);
            if (r.at < c.at) c.at = r.at;
            c.total += n;
            const room = CHAT_ROOM[str(r.a)] ?? "그 밖";
            c.rooms.set(room, (c.rooms.get(room) ?? 0) + n);
            continue;
        }
        const line = RECORD[r.kind]?.(r);
        if (line) put(r.at, line);
    }
    for (const c of chat.values()) {
        put(c.at, { group: "social", tag: "채팅", text: `채팅 ${c.total}건 보냄`, sub: [...c.rooms].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ") });
    }

    const list = [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
    for (const d of list) d.items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    const capped: ActivityGroup[] = [];
    if ((input.sessions?.length ?? 0) >= ACTIVITY_LIMITS.sessions) capped.push("visit");
    if ((input.trail?.length ?? 0) >= ACTIVITY_LIMITS.trail) capped.push("trail");
    if ((input.records?.length ?? 0) >= ACTIVITY_LIMITS.records) capped.push("etc");

    return {
        days: input.days, from: input.from, capped,
        totals: {
            activeDays: list.length,
            visits: list.reduce((s, d) => s + d.visits, 0),
            minutes: list.reduce((s, d) => s + d.minutes, 0),
            pages: list.reduce((s, d) => s + d.pages, 0),
            clicks: list.reduce((s, d) => s + d.clicks, 0),
        },
        list,
    };
}

/** "10.12 (일)" */
export function activityDayLabel(day: string): string {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(t)) return day;
    return `${Number(day.slice(5, 7))}.${day.slice(8, 10)} (${"일월화수목금토"[new Date(t).getUTCDay()]})`;
}
