/**
 * 비회원 → 가입 전환(2026-11-06 오너: "추천대로 전환을 극대화시켜 줘").
 *
 * 근거(최근 14일 웹 비회원 11,735명 · 가입 160명 = 1.4%, 97.5% 네이버 검색):
 *   골프장 4.1% · 등산 1.2% · **당구 선수 · 대회 · 랭킹 0.2%(3,405명 · 8명)** · **당구장 매장 0.3%(997명 · 3명)** · 당구 용어 0%.
 *   골프만 높은 까닭 — 검색한 그 골프장에 대해 나에게 쓸모 있는 단추(취소티 알림 · 내 티타임)가 있다. 선수 · 매장 화면에는 가입할 까닭이 없었고,
 *   앱 설치 팝업이 떠 선수 화면 방문의 30%가 '닫기'를 눌렀다.
 * 그래서 화면마다 그 화면에 맞는 바닥 가입 줄(GuestCtaBar — 줄이 보이는 동안 설치 팝업은 스스로 뜨지 않는다)을 둔다:
 *   · 선수(PBA · UMB): "○○ 선수 소식 받기 — 팔로우" → 가입하면 바로 팔로우(가입 뒤 담기, 등산의 '가고 싶은 산'과 같은 방식)
 *     PBA 팔로우는 이제 알림이 간다(server/services/pbaFollowAlerts — 시즌 상금 순위가 바뀔 때 · 우승).
 *   · 매장 · 당구 용어: "여기서 치세요? 점수판은 랭큐" → 가입하면 홈의 실전 점수판이 바로 열린다(/dashboard?start=match).
 * 한국어 화면에서만 — 유입의 거의 전부가 네이버다. 다른 언어 화면은 예전대로(설치 팝업).
 * ⚠️ 이 파일은 아무것도 임포트하지 않는다(서버도 읽을 수 있게).
 */

// ── 가입 뒤 팔로우 ────────────────────────────────────────────────────
export type FollowKind = "pba" | "umb";
export interface FollowIntent { kind: FollowKind; key: string; category: string | null; name: string }

/** 방문자가 '팔로우'를 누른 것을 이 기기에 적어 두는 칸 — 가입하고 그 선수 화면에 돌아오면 바로 팔로우한다 */
export const FOLLOW_AFTER_LOGIN_KEY = "rankue_follow_after_login";
/** 오래된 것은 버린다 — 며칠 뒤 로그인한 사람에게 잊은 선수가 팔로우되지 않게 */
export const FOLLOW_AFTER_LOGIN_MAX_MS = 30 * 60_000;

const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function followIntentRecord(i: FollowIntent, now: number): string {
    return JSON.stringify({ kind: i.kind, key: i.key, category: i.category, name: i.name.slice(0, 40), at: now });
}

/** 적어 둔 것을 읽는다 — 꼴이 틀렸거나 오래됐거나 미래의 것(기기 시계를 돌렸다)이면 null */
export function followIntentRead(raw: unknown, now: number): FollowIntent | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const o = JSON.parse(raw) as Record<string, unknown> | null;
        if (!o || (o.kind !== "pba" && o.kind !== "umb") || typeof o.key !== "string" || !KEY_RE.test(o.key)) return null;
        if (typeof o.at !== "number" || !Number.isFinite(o.at) || o.at > now || now - o.at > FOLLOW_AFTER_LOGIN_MAX_MS) return null;
        const category = typeof o.category === "string" && KEY_RE.test(o.category) ? o.category : null;
        return { kind: o.kind, key: o.key, category, name: typeof o.name === "string" ? o.name.slice(0, 40) : "" };
    } catch {
        return null;
    }
}

/** 이 화면의 선수인가 — UMB 는 부문(players · ladies · juniors)까지 같아야 한다 */
export function followIntentMatches(i: FollowIntent | null, kind: FollowKind, key: string, category: string | null = null): boolean {
    return !!i && i.kind === kind && i.key === key && (kind !== "umb" || i.category === category);
}

const who = (name: string) => (name ? `${name} 선수` : "이 선수");

/** 가입 팝업의 제목 · 한 줄 — 무엇을 하려다 가입하는지 그대로 */
export function followLoginAsk(kind: FollowKind, name: string): { title: string; desc: string } {
    return {
        title: `${who(name)} 팔로우하기`,
        desc: kind === "pba"
            ? "가입하면 바로 팔로우돼요. 시즌 순위가 바뀌거나 우승하면 알려 드려요."
            : "가입하면 바로 팔로우돼요. 세계랭킹이 바뀌면 알려 드려요.",
    };
}

/** 가입하고 팔로우된 뒤의 한 줄 — '○○ 선수' 는 늘 '수'로 끝나 '를' */
export const followedAfterLogin = (kind: FollowKind, name: string): string =>
    `${who(name)}를 팔로우했어요 — ${kind === "pba" ? "순위가 바뀌거나 우승하면" : "세계랭킹이 바뀌면"} 알려 드려요`;

// ── 화면마다의 바닥 가입 줄 ────────────────────────────────────────────
export interface GuestBarCopy { title: string; sub: string; label: string }

export function playerGuestBar(kind: FollowKind, name: string): GuestBarCopy {
    return {
        title: `${who(name)} 소식 받기`,
        sub: kind === "pba" ? "순위가 바뀌거나 우승하면 알려 드려요" : "세계랭킹이 바뀌면 알려 드려요",
        label: "팔로우",
    };
}

/** 가입하면 바로 실전 점수판이 열리는 주소(홈이 ?start=match 를 읽어 경기 만들기 창을 연다) */
export const SCOREBOARD_START_PATH = "/dashboard?start=match";

/** 매장 화면 — 길찾기를 누르는 손님은 그 당구장에 가는 사람이다 */
export const STORE_GUEST_BAR: GuestBarCopy = { title: "여기서 치세요? 점수판은 랭큐", sub: "친 경기 · 다마가 자동으로 쌓여요", label: "점수판 쓰기" };
/** 당구 용어 화면 — 다마 · 에버리지를 찾아보는 사람 */
export const TERMS_GUEST_BAR: GuestBarCopy = { title: "내 다마 · 에버, 쳐 보면 나와요", sub: "점수판이 자동으로 계산해요", label: "점수판 쓰기" };
export const SCOREBOARD_LOGIN_ASK = { title: "랭큐 점수판으로 치기", desc: "가입하면 바로 점수판이 열려요. 친 경기 · 다마 · 에버리지가 자동으로 쌓여요." } as const;
