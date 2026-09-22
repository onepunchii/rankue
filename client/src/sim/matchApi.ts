/**
 * server/routes/modules/simMatch.ts 의 타입 클라이언트 — 네트워크 대전 A(비동기 2인, 폴링).
 * 요청·응답 모양은 서버 파일이 정본이며 여기서는 그것을 그대로 옮긴다(publicMatch() ↔ MatchPublic).
 *
 *  - 순수 부분(테스트 대상): URL, 요청 본문 매핑, 응답 검증, 오류 분류, 대전 행에서 파생하는 값(내 차례·상대 이름·승패·설정).
 *  - 네트워크: createMatchApi(request) 에 주입한다. 기본 인스턴스 matchApi 는 @/lib/queryClient 의 apiRequest 를 쓴다
 *    ({success,data} 언랩·쿠키 인증·JSON 직렬화는 apiRequest 가 맡는다).
 *  - 샷 본문은 simApi.toShotBody 와 같다(입력 숫자를 손대지 않는다 — 서버 재시뮬 해시와 비트 단위로 맞아야 한다).
 *
 * 실전 경기 API(/api/hiq/game/*)는 절대 부르지 않는다 — 시뮬 대전 성적은 hiqSimRatings 에만 쓰이고 RP 와 분리돼 있다.
 */
import { CHAT_FROM_WATCHER } from "@shared/sim/chat";
import type { BallState, ShotInput, SimEvent, Snapshot } from "@shared/sim/types";
import type { CushionModelId, TableSpec } from "@shared/sim/params";
import type { FinishType, GameType, Rules, SessionState, ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { aimAssistFor } from "./setupPresets";
import {
    SIM_API_BASE, classifyApiError, isBallArray, isSessionState, toShotBody,
    type ApiFailure, type RequestFn, type ShotRequest,
} from "./simApi";
import { apiRequest } from "@/lib/queryClient";
import { getLocale } from "../lib/i18n";

/** 화면에 그대로 보이는 오류 문구(err.message). 훅을 못 쓰는 모듈이라 getLocale() 로 가른다. */
const BAD_CHAT_MSG: Record<string, string> = {
    ko: "채팅 응답이 올바르지 않습니다",
    en: "Invalid chat response",
    es: "La respuesta del chat no es válida",
    tr: "Sohbet yanıtı geçersiz",
    vi: "Phản hồi trò chuyện không hợp lệ",
};

/* ------------------------------------------------------------------ URL */

export function matchesUrl(): string {
    return `${SIM_API_BASE}/matches`;
}
export function matchUrl(id: string): string {
    return `${SIM_API_BASE}/matches/${encodeURIComponent(id)}`;
}
export function matchCodeUrl(code: string): string {
    return `${SIM_API_BASE}/matches/code/${encodeURIComponent(code)}`;
}
export function matchJoinUrl(code: string): string {
    return `${matchCodeUrl(code)}/join`;
}
export function matchShotsUrl(id: string, from?: number): string {
    const base = `${matchUrl(id)}/shots`;
    return from !== undefined && from > 0 ? `${base}?from=${Math.floor(from)}` : base;
}
export function matchResignUrl(id: string): string {
    return `${matchUrl(id)}/resign`;
}
export function matchClaimUrl(id: string): string {
    return `${matchUrl(id)}/claim`;
}
export function matchChatUrl(id: string): string {
    return `${matchUrl(id)}/chat`;
}
export function matchChatsUrl(id: string, from = 0): string {
    return `${matchUrl(id)}/chats?from=${from}`;
}

export function matchTimeoutUrl(id: string): string {
    return `${matchUrl(id)}/timeout`;
}
/** ack=1: 차례인 내가 조준 화면에 들어왔다고 알려 40초 시계를 시작한다(서버가 한 번만 적는다). */
/** 관전 목록: live(지금 치는 중) · replays(최근에 끝난 공개 대전). 비밀번호 방은 서버가 빼고 준다. */
/** 내 온라인 다마수(종목별). 방 만들기·참가 화면이 "내 다마 60" 을 보여줄 때 쓴다. */
export function handicapUrl(): string {
    return `${SIM_API_BASE}/handicap`;
}

export function watchUrl(): string {
    return `${SIM_API_BASE}/watch`;
}

export function roomsUrl(): string {
    return `${SIM_API_BASE}/rooms`;
}
export function matchJoinByIdUrl(id: string): string {
    return `${SIM_API_BASE}/matches/${encodeURIComponent(id)}/join`;
}
export function matchInviteUrl(id: string): string {
    return `${SIM_API_BASE}/matches/${encodeURIComponent(id)}/invite`;
}
export function opponentsUrl(): string {
    return "/api/hiq/opponents";
}
export function matchAckUrl(id: string): string {
    return `${matchUrl(id)}?ack=1`;
}

/* ------------------------------------------------------------------ 타입 (publicMatch / shots / post 응답) */

export type MatchStatus = "waiting" | "playing" | "finished" | "canceled";
/** finished 사유. target 목표 도달 · inningCap 이닝 상한 · resign 기권 · claim 무응답 승리 */
export type MatchEndReason = "target" | "inningCap" | "resign" | "claim" | "timeout";
export type PlayerIndex = 0 | 1;

/** 참가 코드 자릿수(서버 randomCode). */
export const MATCH_CODE_LENGTH = 6;

/** GET/POST 응답의 대전 행(publicMatch). 상대 회원 id 는 오지 않고 이름만 온다. 날짜는 ISO 문자열. */
export interface MatchPublic {
    readonly id: string;
    readonly code: string;
    readonly status: MatchStatus;
    readonly gameType: GameType;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    /** 조준 보정(일반 모드 true). 방장 설정을 둘 다 따른다. 예전 서버 응답엔 없을 수 있어 선택 — 없으면 true. */
    readonly aimAssist?: boolean;
    /** 미리보기 전체(연습처럼 쿠션 뒤 경로까지). 없거나 false 면 짧게(첫 접촉 + 꼬리). */
    readonly fullPreview?: boolean;
    /** 멀티방(공개 방). 목록(GET /sim/rooms)에 뜬다. 예전 응답엔 없다. */
    readonly isPublic?: boolean;
    /** 비밀번호 방 — 참가할 때 password 가 필요하다. */
    readonly hasPassword?: boolean;
    /** 핸디전 방(2026-09-12): 참가하는 순간 서버가 두 사람의 온라인 에버리지로 각자 목표를 정한다. 옛 응답엔 없다. */
    readonly handicap?: boolean;
    readonly rules: Rules;
    readonly finishType: FinishType;
    readonly inningCap: number;
    readonly hostName: string;
    readonly guestName: string | null;
    readonly hostTarget: number;
    /** 게스트 다마수. 참가 전엔 null */
    readonly guestTarget: number | null;
    /** 보는 사람의 자리. 0 = 호스트(흰 공), 1 = 게스트(노란 공), -1 = 참가자 아님(코드 조회 화면) */
    readonly myIndex: -1 | PlayerIndex;
    readonly turn: number;
    /** 기록된 샷 수 = 다음 샷의 idx */
    readonly shots: number;
    readonly version: number;
    /** 상대가 지금 화면을 안 보고 있다(자리 비움). 진행 중일 때만 의미가 있다. */
    readonly opponentAway: boolean;
    /** 상대가 지금 겨누는 방향(rad, ISO 시각). 내 차례거나 값이 낡았으면 null — 서버가 걸러 준다. */
    readonly opponentAim: { readonly phi: number; readonly at: string } | null;
    /**
     * 지금까지 오간 채팅 줄 수(2026-09-16). shots 와 같은 규약 — **늘었을 때만** /chats 를 부른다.
     * 본문은 여기 없다(폴링 응답을 키우지 않고, 단일 슬롯 유실도 만들지 않는다). 옛 서버·관전자는 0.
     * **서버 publicMatch 의 키 이름과 글자 하나까지 같아야 한다** — parseMatch 가 화이트리스트라, 이름이 어긋나면
     * 값이 늘 0 이 되어 /chats 가 한 번도 안 불리고 상대 말이 화면에 아예 안 닿는다(무증상 실패).
     */
    readonly chatSeq: number;
    /**
     * 두 선수의 국가(ISO 3166-1 alpha-2). 헤더에 국기를 그린다.
     * 가입할 때 IP 로 자동으로 잡히므로 **없는 사람이 많다** — 없으면 국기 없이 이름만 그린다.
     */
    readonly hostCountry: string | null;
    readonly guestCountry: string | null;
    /** 정본 세션 상태. waiting 이면 null. players[0]=호스트(white), players[1]=게스트(yellow) */
    readonly state: SessionState | null;
    readonly balls: readonly BallState[] | null;
    readonly winnerIndex: PlayerIndex | null;
    readonly endReason: MatchEndReason | null;
    readonly engineVersion: string;
    readonly paramsHash: string;
    readonly createdAt: string;
    readonly startedAt: string | null;
    readonly lastShotAt: string | null;
    readonly finishedAt: string | null;
    /** playing 일 때만. 이 시각부터 차례가 아닌 쪽이 승리를 주장할 수 있다(마지막 샷 + 48 h). */
    readonly claimableAt: string | null;
    /** 40초 룰: 차례인 사람이 조준 화면에 들어온 시각(ISO). 없으면 시계가 아직 안 돈다. */
    readonly turnSeenAt: string | null;
    /** 응답을 만든 서버 시각(ISO) — 클라이언트 시계 보정용. 예전 서버 응답엔 없다. */
    readonly serverNow: string | null;
    /** 쓰리아웃: [호스트, 게스트] 의 40초 시간 초과 횟수. 예전 응답엔 없어 [0, 0]. */
    /** 지금 보고 있는 관전자 수(선수 제외, 2026-09-12) */
    readonly watchers?: number;
    readonly timeouts: readonly [number, number];
}

/** GET /sim/matches/:id/shots 의 한 줄. preState + input 으로 로컬에서 같은 샷을 재시뮬한다. */
/** 관전 목록 한 줄. 공 배치는 담지 않는다 — 고르는 화면이라 점수·차례까지면 된다. */
export interface WatchCard {
    readonly id: string;
    readonly status: MatchStatus;
    readonly gameType: "3c" | "4c";
    readonly tableId: "DAEDAE" | "JUNGDAE_KR";
    readonly hostName: string;
    readonly guestName: string | null;
    readonly targets: readonly [number, number];
    readonly scores: readonly number[];
    /** 선수별 하이런(점수 단위 — 4구는 10점 = 1캐롬). 다시보기 정렬·표시에 쓴다. */
    readonly highRuns?: readonly number[];
    readonly innings: number;
    readonly turn: number;
    readonly shots: number;
    readonly winnerIndex: 0 | 1 | null;
    /** 지금 보고 있는 관전자 수(선수 제외) */
    readonly watchers?: number;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly lastShotAt: string | null;
}

/** 내 다마 한 줄. target 은 지금 이 실력으로 치면 잡히는 목표 점수(4구는 10점 단위). */
export interface MyHandicap {
    readonly gameType: "3c" | "4c";
    readonly avg: number;
    readonly target: number;
    readonly matches: number;
    readonly innings: number;
    /** 온라인 기록으로 매긴 값인가(아니면 아직 기본값) */
    readonly fromRecord: boolean;
}

export interface MyHandicaps {
    readonly minInnings: number;
    readonly innings: number;
    readonly boards: readonly MyHandicap[];
}

export interface WatchLists {
    readonly live: readonly WatchCard[];
    readonly replays: readonly WatchCard[];
}

/**
 * 채팅 한 줄. `kind === "code"` 면 text 칸에 고정 인사 코드가 들어 있고 화면이 **보는 사람의 언어로** 그린다
 * — 5개 언어 앱이라 한국어 문장을 저장하면 스페인어 상대 화면에 한국어가 뜬다.
 * id 는 나중에 신고를 붙일 때 대상 키다(지금은 안 쓴다).
 */
export interface ChatLine {
    readonly id: string;
    readonly seq: number;
    /** 보낸 사람 자리(0 = 호스트, 1 = 게스트) */
    readonly from: number;
    readonly kind: "text" | "code";
    readonly text: string;
    readonly at: string;
}

/** ISO 3166-1 alpha-2 만 통과시킨다 — 화면이 이 두 글자로 국기 이모지를 만든다. */
function countryOrNull(v: unknown): string | null {
    return typeof v === "string" && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
}

export function parseChatLine(raw: unknown): ChatLine | null {
    if (!isRecord(raw)) return null;
    const { id, seq, from, kind, text } = raw;
    if (typeof id !== "string" || typeof seq !== "number" || !Number.isFinite(seq)) return null;
    if (typeof text !== "string") return null;
    return {
        id, seq,
        // 0·1 선수, 2 관전자(shared/sim/chat CHAT_FROM_WATCHER). 예전엔 0·1 로만 잘라서 관전자 응원이 **호스트 말**로
        // 둔갑해 초록 말풍선으로 떴다(2026-09-21 오너 캡처).
        from: from === 1 ? 1 : from === CHAT_FROM_WATCHER ? CHAT_FROM_WATCHER : 0,
        kind: kind === "code" ? "code" : "text",
        text,
        at: isoOrNull(raw.at) ?? "",
    };
}

export interface MatchShot {
    readonly idx: number;
    readonly playerIndex: number;
    readonly preState: readonly BallState[];
    readonly input: ShotInput;
    /** 서버 재시뮬 해시. 로컬 재시뮬과 다르면 결정론이 깨진 것 → 서버 상태로 스냅 */
    readonly hash: string;
    readonly outcomeCode: string;
    readonly points: number;
    readonly cushions: number;
    /** 친 사람의 이닝 번호(서버가 2026-09-18 부터 적는다). 그 전 샷은 null — 화면이 샷 순서로 추정한다. */
    readonly inning?: number | null;
    readonly createdAt: string;
}

/**
 * POST /sim/matches/:id/shots 응답. duplicate(응답을 못 받은 재전송에 대한 멱등 응답)엔 final·outcome·events 가 없고
 * state·turn·version·status 는 "지금" 대전 값이다(그 뒤 상대 샷이 있었을 수 있다).
 */
export interface PostShotResponse {
    readonly duplicate: boolean;
    /** clientHash 와 서버 재시뮬 해시가 다름 → final/state 로 스냅해야 한다. duplicate 면 항상 false */
    readonly mismatch: boolean;
    readonly hash: string;
    readonly state: SessionState;
    readonly turn: number;
    readonly version: number;
    readonly status: MatchStatus;
    readonly winnerIndex: PlayerIndex | null;
    readonly final: readonly BallState[] | null;
    readonly outcome: ShotOutcome | null;
    readonly events: readonly SimEvent[];
    readonly duration: number;
    readonly truncated: boolean;
    /** mismatch 일 때만(전체 궤적) */
    readonly history?: readonly Snapshot[];
}

export type ResignResponse =
    | { readonly status: "canceled" }
    | { readonly status: "finished"; readonly winnerIndex: PlayerIndex };

export interface ClaimResponse {
    readonly status: "finished";
    readonly winnerIndex: PlayerIndex;
}

/** POST /sim/matches 본문. 서버 createSchema 와 필드가 같다(players·balls 없음 — 게스트가 참가할 때 서버가 개시 배치를 만든다). */
export interface CreateMatchBody {
    readonly gameType: GameType;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly rules: Rules;
    readonly finishType: FinishType;
    readonly target: number;
    readonly inningCap: number;
    /** 조준 보정(일반 모드). 서버가 저장해 게스트도 같은 모드로 친다. */
    readonly aimAssist: boolean;
    /** 미리보기 전체 여부(기본 false = 첫 접촉 + 꼬리). */
    readonly fullPreview: boolean;
    /** 멀티방(공개 방)으로 열기. */
    readonly isPublic: boolean;
    /** 핸디전(기본 true): 참가하는 순간 서버가 두 사람의 온라인 에버리지로 각자 목표를 정한다. */
    readonly handicap: boolean;
    /** 방 비밀번호(4~20자). 없으면 보내지 않는다. */
    readonly password?: string;
}

/** 방 옵션(로비의 "멀티방으로 열기" 토글·비밀번호). 설정(SimSetupConfig)과 별개다. */
export interface RoomOptions {
    readonly isPublic?: boolean;
    readonly password?: string;
    /** 핸디전(기본 true). 끄면 방장이 적은 다마수로 둘 다 친다(맞대결). */
    readonly handicap?: boolean;
}

export const ROOM_PASSWORD_MIN = 4;
export const ROOM_PASSWORD_MAX = 20;
/** 비어 있거나 4~20자. */
export function isValidRoomPassword(pw: string): boolean {
    return pw === "" || (pw.length >= ROOM_PASSWORD_MIN && pw.length <= ROOM_PASSWORD_MAX);
}

export interface JoinMatchBody {
    readonly target?: number;
    readonly password?: string;
}

/** 초대 보낼 수 있는 상대(GET /api/hiq/opponents 의 필요한 부분만). */
export interface OpponentLite {
    readonly id: string;
    readonly name: string;
    readonly handi3c: number | null;
    readonly handi4c: number | null;
}

/* ------------------------------------------------------------------ 요청 매핑 */

/** 설정의 알려진 필드만 옮긴다(여분 필드는 새지 않는다). 방 옵션은 따로. */
export function toCreateMatchBody(config: SimSetupConfig, room?: RoomOptions): CreateMatchBody {
    const password = room?.isPublic && room.password && isValidRoomPassword(room.password) && room.password !== "" ? room.password : undefined;
    return {
        gameType: config.gameType,
        tableId: config.tableId,
        cushionModel: config.cushionModel,
        condition: config.condition,
        rules: config.rules,
        finishType: config.finishType,
        target: config.target,
        inningCap: config.inningCap,
        aimAssist: aimAssistFor(config.mode),
        fullPreview: config.matchPreview === "full",
        isPublic: room?.isPublic === true,
        handicap: room?.handicap !== false,
        ...(password ? { password } : {}),
    };
}

/** 게스트 다마수. 생략하면 서버가 호스트 다마수를 쓴다. 정수가 아니거나 범위 밖이면 생략. 비밀번호는 있을 때만. */
export function toJoinBody(target?: number, password?: string): JoinMatchBody {
    const body: { target?: number; password?: string } = {};
    if (target !== undefined && Number.isInteger(target) && target >= 1 && target <= 999) body.target = target;
    if (password) body.password = password;
    return body;
}

export function parseOpponents(raw: unknown): readonly OpponentLite[] {
    if (!Array.isArray(raw)) return [];
    const out: OpponentLite[] = [];
    for (const r of raw) {
        if (!isRecord(r) || typeof r.id !== "string" || typeof r.name !== "string") continue;
        out.push({
            id: r.id, name: r.name,
            handi3c: typeof r.handi3c === "number" ? r.handi3c : null,
            handi4c: typeof r.handi4c === "number" ? r.handi4c : null,
        });
    }
    return out;
}

/** 코드 입력 정리: 숫자만, 최대 6자리. */
export function sanitizeCode(text: string): string {
    return text.replace(/[^0-9]/g, "").slice(0, MATCH_CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
    return new RegExp(`^[0-9]{${MATCH_CODE_LENGTH}}$`).test(code);
}

/**
 * 주소의 참가 파라미터를 가른다 — `?join=<6자리>` 는 푸시 초대 코드, `?room=<uuid>` 는 홈 카드에서 고른 멀티방.
 * 숫자만 온 값만 코드로 본다: uuid 를 sanitizeCode 에 넣으면 그 안의 숫자 6개가 '코드'가 되어 엉뚱한 방을 찾다
 * "초대가 만료됐거나…" 로 튕겼다(2026-09-22 오너). 옛 링크의 join=<uuid> 는 방 id 로 받아 준다.
 */
export function parseJoinParams(params: URLSearchParams): { joinCode: string; roomId: string | null } {
    const join = params.get("join") ?? "";
    const raw = /^\d+$/.test(join) ? sanitizeCode(join) : "";
    const joinCode = isCompleteCode(raw) ? raw : "";
    const roomId = params.get("room") ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(join) ? join : null);
    return { joinCode, roomId };
}

/** "123456" → "123 456" (읽기용) */
export function formatCode(code: string): string {
    const c = sanitizeCode(code);
    return c.length > 3 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

/* ------------------------------------------------------------------ 응답 검증 */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

const STATUSES: readonly MatchStatus[] = ["waiting", "playing", "finished", "canceled"];
const END_REASONS: readonly MatchEndReason[] = ["target", "inningCap", "resign", "claim", "timeout"];

function isoOrNull(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

function playerIndexOrNull(v: unknown): PlayerIndex | null {
    return v === 0 || v === 1 ? v : null;
}

export function parseMatch(raw: unknown): MatchPublic {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.code !== "string") throw new TypeError("match api: malformed match");
    if (!STATUSES.includes(raw.status as MatchStatus)) throw new TypeError("match api: malformed match status");
    if (raw.gameType !== "3c" && raw.gameType !== "4c") throw new TypeError("match api: malformed game type");
    if (raw.tableId !== "DAEDAE" && raw.tableId !== "JUNGDAE_KR") throw new TypeError("match api: malformed table");
    if (!isRecord(raw.rules) || raw.rules.gameType !== raw.gameType) throw new TypeError("match api: malformed rules");
    if (typeof raw.turn !== "number" || typeof raw.shots !== "number" || typeof raw.version !== "number") throw new TypeError("match api: malformed counters");
    const myIndex = raw.myIndex === 0 || raw.myIndex === 1 ? raw.myIndex : -1;
    const state = isSessionState(raw.state) ? raw.state : null;
    const balls = isBallArray(raw.balls) ? raw.balls : null;
    const endReason = END_REASONS.includes(raw.endReason as MatchEndReason) ? (raw.endReason as MatchEndReason) : null;
    return {
        id: raw.id,
        code: raw.code,
        status: raw.status as MatchStatus,
        gameType: raw.gameType,
        tableId: raw.tableId,
        cushionModel: (typeof raw.cushionModel === "string" ? raw.cushionModel : "han2005") as CushionModelId,
        condition: typeof raw.condition === "number" && Number.isFinite(raw.condition) ? raw.condition : 1,
        aimAssist: typeof raw.aimAssist === "boolean" ? raw.aimAssist : undefined,
        fullPreview: typeof raw.fullPreview === "boolean" ? raw.fullPreview : undefined,
        isPublic: typeof raw.isPublic === "boolean" ? raw.isPublic : undefined,
        hasPassword: typeof raw.hasPassword === "boolean" ? raw.hasPassword : undefined,
        handicap: typeof raw.handicap === "boolean" ? raw.handicap : undefined,
        rules: raw.rules as unknown as Rules,
        finishType: raw.finishType === "3c" || raw.finishType === "bank" ? raw.finishType : "none",
        inningCap: typeof raw.inningCap === "number" ? raw.inningCap : 0,
        hostName: typeof raw.hostName === "string" ? raw.hostName : "",
        guestName: typeof raw.guestName === "string" ? raw.guestName : null,
        hostTarget: typeof raw.hostTarget === "number" ? raw.hostTarget : 1,
        guestTarget: typeof raw.guestTarget === "number" ? raw.guestTarget : null,
        myIndex,
        turn: raw.turn,
        shots: raw.shots,
        version: raw.version,
        // 옛 서버 응답에는 없다 — 없으면 "자리에 있다"로 본다(없던 안내가 새로 생기는 쪽이 안전).
        opponentAway: raw.opponentAway === true,
        opponentAim: isRecord(raw.opponentAim) && typeof raw.opponentAim.phi === "number" && Number.isFinite(raw.opponentAim.phi)
            ? { phi: raw.opponentAim.phi, at: isoOrNull(raw.opponentAim.at) ?? "" }
            : null,
        chatSeq: typeof raw.chatSeq === "number" && Number.isFinite(raw.chatSeq) ? raw.chatSeq : 0,
        hostCountry: countryOrNull(raw.hostCountry),
        guestCountry: countryOrNull(raw.guestCountry),
        state,
        balls,
        winnerIndex: playerIndexOrNull(raw.winnerIndex),
        endReason,
        engineVersion: typeof raw.engineVersion === "string" ? raw.engineVersion : "",
        paramsHash: typeof raw.paramsHash === "string" ? raw.paramsHash : "",
        createdAt: isoOrNull(raw.createdAt) ?? "",
        startedAt: isoOrNull(raw.startedAt),
        lastShotAt: isoOrNull(raw.lastShotAt),
        finishedAt: isoOrNull(raw.finishedAt),
        claimableAt: isoOrNull(raw.claimableAt),
        turnSeenAt: isoOrNull(raw.turnSeenAt),
        serverNow: isoOrNull(raw.serverNow),

        timeouts: Array.isArray(raw.timeouts) && raw.timeouts.length === 2
            ? [Number(raw.timeouts[0]) || 0, Number(raw.timeouts[1]) || 0] as const
            : [0, 0] as const,
        // 관전자 수 — 여기서 안 옮기면 화면은 영영 undefined 를 보고 👀 n 을 안 그린다(2026-09-23 오너: "관전자 몇 명인지 안 나와").
        watchers: typeof raw.watchers === "number" && Number.isFinite(raw.watchers) ? raw.watchers : 0,
    };
}

export function parseMatchList(raw: unknown): readonly MatchPublic[] {
    if (!Array.isArray(raw)) throw new TypeError("match api: malformed match list");
    return raw.map(parseMatch);
}

function isShotInput(v: unknown): v is ShotInput {
    return isRecord(v) && (v.cueBallId === "white" || v.cueBallId === "yellow")
        && [v.phi, v.V0, v.a, v.b, v.theta].every((n) => typeof n === "number" && Number.isFinite(n));
}

export function parseMatchShot(raw: unknown): MatchShot {
    if (!isRecord(raw) || typeof raw.idx !== "number" || typeof raw.hash !== "string") throw new TypeError("match api: malformed shot");
    if (!isBallArray(raw.preState)) throw new TypeError("match api: malformed shot preState");
    if (!isShotInput(raw.input)) throw new TypeError("match api: malformed shot input");
    return {
        idx: raw.idx,
        playerIndex: typeof raw.playerIndex === "number" ? raw.playerIndex : 0,
        preState: raw.preState,
        input: { cueBallId: raw.input.cueBallId, phi: raw.input.phi, V0: raw.input.V0, a: raw.input.a, b: raw.input.b, theta: raw.input.theta },
        hash: raw.hash,
        outcomeCode: typeof raw.outcomeCode === "string" ? raw.outcomeCode : "",
        points: typeof raw.points === "number" ? raw.points : 0,
        cushions: typeof raw.cushions === "number" ? raw.cushions : 0,
        inning: typeof raw.inning === "number" && Number.isInteger(raw.inning) && raw.inning >= 1 ? raw.inning : null,
        createdAt: isoOrNull(raw.createdAt) ?? "",
    };
}

export function parseMatchShots(raw: unknown): readonly MatchShot[] {
    if (!Array.isArray(raw)) throw new TypeError("match api: malformed shot list");
    return raw.map(parseMatchShot);
}

export function parsePostShotResponse(raw: unknown): PostShotResponse {
    if (!isRecord(raw) || typeof raw.hash !== "string") throw new TypeError("match api: malformed shot response");
    if (!isSessionState(raw.state)) throw new TypeError("match api: malformed session state");
    if (typeof raw.turn !== "number" || typeof raw.version !== "number") throw new TypeError("match api: malformed shot response");
    if (!STATUSES.includes(raw.status as MatchStatus)) throw new TypeError("match api: malformed match status");
    const duplicate = raw.duplicate === true;
    const final = isBallArray(raw.final) ? raw.final : null;
    const outcome = isRecord(raw.outcome) && typeof raw.outcome.code === "string" ? (raw.outcome as unknown as ShotOutcome) : null;
    if (!duplicate && (final === null || outcome === null)) throw new TypeError("match api: malformed shot response");
    const mismatch = !duplicate && raw.mismatch === true;
    return {
        duplicate,
        mismatch,
        hash: raw.hash,
        state: raw.state,
        turn: raw.turn,
        version: raw.version,
        status: raw.status as MatchStatus,
        winnerIndex: playerIndexOrNull(raw.winnerIndex),
        final,
        outcome,
        events: Array.isArray(raw.events) ? (raw.events as SimEvent[]) : [],
        duration: typeof raw.duration === "number" ? raw.duration : 0,
        truncated: raw.truncated === true,
        ...(Array.isArray(raw.history) ? { history: raw.history as Snapshot[] } : {}),
    };
}

export function parseResignResponse(raw: unknown): ResignResponse {
    if (!isRecord(raw)) throw new TypeError("match api: malformed resign response");
    if (raw.status === "canceled") return { status: "canceled" };
    const w = playerIndexOrNull(raw.winnerIndex);
    if (raw.status !== "finished" || w === null) throw new TypeError("match api: malformed resign response");
    return { status: "finished", winnerIndex: w };
}

export function parseClaimResponse(raw: unknown): ClaimResponse {
    if (!isRecord(raw) || raw.status !== "finished") throw new TypeError("match api: malformed claim response");
    const w = playerIndexOrNull(raw.winnerIndex);
    if (w === null) throw new TypeError("match api: malformed claim response");
    return { status: "finished", winnerIndex: w };
}

/* ------------------------------------------------------------------ 오류 분류 */

/** 서버 sendError 의 code. 409 응답에 실린다. */
export type MatchErrorCode = "NOT_YOUR_TURN" | "IDX_MISMATCH" | "RECORD_CONFLICT" | "TOO_EARLY" | "BAD_PASSWORD";

export function matchErrorCode(err: unknown): MatchErrorCode | null {
    if (!isRecord(err)) return null;
    const data = isRecord(err.data) ? err.data : null;
    const code = data && typeof data.code === "string" ? data.code : null;
    return code === "NOT_YOUR_TURN" || code === "IDX_MISMATCH" || code === "RECORD_CONFLICT" || code === "TOO_EARLY" || code === "BAD_PASSWORD" ? code : null;
}

/**
 * simApi.classifyApiError 에 대전 전용 두 가지를 얹는다.
 *  not-your-turn — 409 NOT_YOUR_TURN: 로컬이 차례를 잘못 알고 있다 → 서버로 다시 맞춘다.
 *  too-early     — 409 TOO_EARLY: 승리 주장이 아직 이르다.
 * 나머지(network / idx-mismatch / session-closed / unauthorized / rejected)는 simApi 와 같다.
 */
export type MatchFailure = ApiFailure | "not-your-turn" | "too-early" | "bad-password";

export function classifyMatchError(err: unknown): MatchFailure {
    const code = matchErrorCode(err);
    if (code === "NOT_YOUR_TURN") return "not-your-turn";
    if (code === "TOO_EARLY") return "too-early";
    if (code === "BAD_PASSWORD") return "bad-password";
    return classifyApiError(err);
}

/* ------------------------------------------------------------------ 파생값 (순수) */

export function isMyTurn(m: Pick<MatchPublic, "status" | "myIndex" | "turn">): boolean {
    return m.status === "playing" && m.myIndex >= 0 && m.turn === m.myIndex;
}

/** players 순서(0 호스트, 1 게스트)의 이름. 게스트가 아직 없으면 빈 문자열. */
export function playerNames(m: Pick<MatchPublic, "hostName" | "guestName">): readonly [string, string] {
    return [m.hostName, m.guestName ?? ""];
}

export function myName(m: Pick<MatchPublic, "hostName" | "guestName" | "myIndex">): string {
    return m.myIndex === 1 ? (m.guestName ?? "") : m.hostName;
}

export function opponentName(m: Pick<MatchPublic, "hostName" | "guestName" | "myIndex">): string {
    return m.myIndex === 1 ? m.hostName : (m.guestName ?? "");
}

/** 지금 승리를 주장할 수 있는가(playing · 상대 차례 · claimableAt 지남). nowMs 는 epoch ms. */
export function claimableNow(m: Pick<MatchPublic, "status" | "myIndex" | "turn" | "claimableAt">, nowMs: number): boolean {
    if (m.status !== "playing" || m.myIndex < 0 || m.turn === m.myIndex || m.claimableAt === null) return false;
    const at = Date.parse(m.claimableAt);
    return Number.isFinite(at) && at <= nowMs;
}

export type MatchResult = "win" | "loss" | "draw";

/** 끝난 대전의 내 결과. 진행 중·참가자 아님이면 null. */
export function matchResult(m: Pick<MatchPublic, "status" | "myIndex" | "winnerIndex">): MatchResult | null {
    if (m.status !== "finished" || m.myIndex < 0) return null;
    if (m.winnerIndex === null) return "draw";
    return m.winnerIndex === m.myIndex ? "win" : "loss";
}

/** 내 다마수(호스트/게스트 자리별). 참가자가 아니면 호스트 다마수. */
export function myTarget(m: Pick<MatchPublic, "myIndex" | "hostTarget" | "guestTarget">): number {
    return m.myIndex === 1 ? (m.guestTarget ?? m.hostTarget) : m.hostTarget;
}

/** 대전 행 → HUD·파라미터용 세션 설정(useSimulator 의 config). target 은 내 다마수. */
export function matchConfig(m: MatchPublic): SimSetupConfig {
    return {
        gameType: m.gameType,
        tableId: m.tableId,
        target: myTarget(m),
        rules: m.rules,
        finishType: m.finishType,
        inningCap: m.inningCap,
        cushionModel: m.cushionModel,
        condition: m.condition,
        mode: m.aimAssist === false ? "reality" : "normal",
        matchPreview: m.fullPreview === true ? "full" : "short",
    };
}

/* ------------------------------------------------------------------ 클라이언트 */

export interface MatchApi {
    /** room: 멀티방(공개)·비밀번호. 없으면 코드·초대로만 들어오는 방. */
    createMatch(config: SimSetupConfig, room?: RoomOptions): Promise<MatchPublic>;
    listMatches(): Promise<readonly MatchPublic[]>;
    lookupCode(code: string): Promise<MatchPublic>;
    /** password: 비밀번호 방일 때(hasPassword). */
    joinMatch(code: string, target?: number, password?: string): Promise<MatchPublic>;
    /** 멀티방 목록(공개·대기 중·내 방 아님). 코드는 비어 있다. */
    listRooms(): Promise<readonly MatchPublic[]>;
    /** 목록의 방에 참가(id). 비밀번호 방이면 password. 403 BAD_PASSWORD. */
    joinRoom(id: string, target?: number, password?: string): Promise<MatchPublic>;
    /** 호스트가 친구에게 푸시 초대. 돌아오는 name 은 받은 사람 이름. */
    invite(id: string, memberId: string): Promise<{ name: string }>;
    /** 초대 보낼 수 있는 상대(같은 매장 회원 — 실전 매칭과 같은 목록). */
    listOpponents(): Promise<readonly OpponentLite[]>;
    /** opts.ack: 내 차례 조준 화면에 들어왔음을 알린다(40초 시계 시작). */
    getMatch(id: string, opts?: { ack?: boolean }): Promise<MatchPublic>;
    /** from = 로컬 샷 수 → 놓친 샷(idx ≥ from) */
    getShots(id: string, from?: number): Promise<readonly MatchShot[]>;
    /** 관전·다시보기 목록 */
    getWatchable(): Promise<WatchLists>;
    /** 내 온라인 다마수(종목별) */
    getMyHandicap(): Promise<MyHandicaps>;
    postShot(id: string, req: ShotRequest): Promise<PostShotResponse>;
    /** waiting 인 내 대전이면 취소(canceled), playing 이면 기권(finished, 상대 승) */
    resign(id: string): Promise<ResignResponse>;
    /** 상대가 48시간 넘게 안 쳤을 때만(409 TOO_EARLY 아니면). */
    claim(id: string): Promise<ClaimResponse>;
    /** 40초 룰 시간 초과 처리(내 차례 40초 / 상대 차례 50초 뒤). 서버가 시각을 판정하고 갱신된 대전 행을 돌려준다. 없으면 시계 기능 없음. */
    timeout?(id: string): Promise<MatchPublic>;
    /** 내가 겨누는 방향 알리기(2026-09-16). 응답은 읽지 않는다 — 실패해도 조용히 넘어간다. */
    sendAim?(id: string, phi: number): Promise<void>;
    /**
     * 한마디 보내기(2026-09-16). 자유 입력은 `{ text }`, 고정 인사는 `{ code }` — **한 함수로 둘 다 받는다.**
     * 두 경로로 나누면 칩이 한국어 문장을 text 로 보내게 되어 상대 언어 화면에 한국어가 뜬다.
     * clientKey 는 재시도를 한 줄로 합치는 키다(응답만 유실되는 일이 모바일에서 흔하다).
     */
    sendChat?(id: string, body: { text?: string; code?: string; clientKey?: string }): Promise<{ line: ChatLine; chatSeq: number }>;
    /** 놓친 채팅 따라잡기. seq >= from 인 줄을 순서대로. */
    getChats?(id: string, from?: number): Promise<readonly ChatLine[]>;
}

/** request 를 주입해 만든다(테스트는 가짜 request). 응답은 {success,data} 가 이미 벗겨진 data 여야 한다. */
export function createMatchApi(request: RequestFn): MatchApi {
    return {
        async createMatch(config, room) {
            return parseMatch(await request(matchesUrl(), { method: "POST", body: toCreateMatchBody(config, room) }));
        },
        async listMatches() {
            return parseMatchList(await request(matchesUrl(), { method: "GET" }));
        },
        async lookupCode(code) {
            return parseMatch(await request(matchCodeUrl(sanitizeCode(code)), { method: "GET" }));
        },
        async joinMatch(code, target, password) {
            return parseMatch(await request(matchJoinUrl(sanitizeCode(code)), { method: "POST", body: toJoinBody(target, password) }));
        },
        async listRooms() {
            return parseMatchList(await request(roomsUrl(), { method: "GET" }));
        },
        async joinRoom(id, target, password) {
            return parseMatch(await request(matchJoinByIdUrl(id), { method: "POST", body: toJoinBody(target, password) }));
        },
        async invite(id, memberId) {
            const raw = await request(matchInviteUrl(id), { method: "POST", body: { memberId } });
            return { name: isRecord(raw) && typeof raw.name === "string" ? raw.name : "" };
        },
        async listOpponents() {
            return parseOpponents(await request(opponentsUrl(), { method: "GET" }));
        },
        async getMatch(id, opts) {
            return parseMatch(await request(opts?.ack ? matchAckUrl(id) : matchUrl(id), { method: "GET" }));
        },
        async timeout(id) {
            return parseMatch(await request(matchTimeoutUrl(id), { method: "POST" }));
        },
        async sendAim(id, phi) {
            await request(`${matchUrl(id)}/aim`, { method: "POST", body: { phi } });
        },
        async sendChat(id, body) {
            const r = await request(matchChatUrl(id), { method: "POST", body }) as { line?: unknown; chatSeq?: unknown };
            const line = parseChatLine(r?.line);
            if (!line) throw new Error(BAD_CHAT_MSG[getLocale()] ?? BAD_CHAT_MSG.ko);
            return { line, chatSeq: typeof r?.chatSeq === "number" ? r.chatSeq : line.seq };
        },
        async getChats(id, from = 0) {
            const rows = await request(matchChatsUrl(id, from), { method: "GET" });
            return Array.isArray(rows) ? rows.map(parseChatLine).filter((c): c is ChatLine => c !== null) : [];
        },
        async getShots(id, from) {
            return parseMatchShots(await request(matchShotsUrl(id, from), { method: "GET" }));
        },
        async getMyHandicap() {
            const r = await request(handicapUrl()) as { minInnings?: unknown; innings?: unknown; boards?: unknown };
            const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
            return {
                minInnings: num(r?.minInnings, 20),
                innings: num(r?.innings, 18),
                boards: Array.isArray(r?.boards) ? r.boards as MyHandicap[] : [],
            };
        },
        async getWatchable() {
            const r = await request(watchUrl()) as { live?: unknown; replays?: unknown };
            return {
                live: Array.isArray(r?.live) ? r.live as WatchCard[] : [],
                replays: Array.isArray(r?.replays) ? r.replays as WatchCard[] : [],
            };
        },
        async postShot(id, req) {
            return parsePostShotResponse(await request(matchShotsUrl(id), { method: "POST", body: toShotBody(req) }));
        },
        async resign(id) {
            return parseResignResponse(await request(matchResignUrl(id), { method: "POST" }));
        },
        async claim(id) {
            return parseClaimResponse(await request(matchClaimUrl(id), { method: "POST" }));
        },
    };
}

/** 앱용 기본 인스턴스. */
export const matchApi: MatchApi = createMatchApi((url, options) => apiRequest(url, options));
