/**
 * 방 만들기의 **지난번 설정**(2026-10-12 오너: "방 만드는 거 조금 더 쉽게").
 * 방을 만들 때마다 종목 · 테이블 · 핸디전 · 모드 · 규칙을 처음부터 다시 고르지 않게, 만든 설정을 이 기기에 적어 두고 다음에 그대로 채운다 —
 * 대부분은 지난번과 같은 방을 연다. 그러면 방 만들기는 열고 → '대전 만들기' 한 번이다.
 *
 * 적지 않는 것
 *  - 방제 · 비밀번호: 그 방의 것이다(다음 방에 따라오면 안 된다).
 *  - 멀티방 공개 여부: 들어온 입구가 정한다(방 만들기 = 공개, 친구 초대 = 비공개).
 * 읽은 값은 하나씩 검사한다 — 저장소는 남이 고칠 수 있고, 고를 수 있는 값이 바뀌면 옛 값이 남는다. 틀린 칸은 버리고 기본값을 쓴다.
 * 저장소가 막힌 곳(사파리 개인 정보 보호 · 테스트)에서는 조용히 아무것도 하지 않는다.
 */
import type { GameType, ThreeCushionRuleSet } from "@shared/sim/rules/types";
import { INNING_CAPS, SIM_MODES, isValidTarget, type SimMode, type TableId } from "../setupPresets";

export const LOBBY_PREFS_KEY = "rankue.sim.lobby-prefs";
const TABLE_IDS: readonly TableId[] = ["DAEDAE", "JUNGDAE_KR"];

export interface LobbyPrefs {
    gameType: GameType;
    tableId: TableId;
    /** 핸디전(레이팅 반영)인가. 끄면 친선전 — 그때의 다마수가 target */
    handicap: boolean;
    target: number;
    mode: SimMode;
    ruleSet: ThreeCushionRuleSet;
    threeCushionDouble: boolean;
    inningCap: number;
}

export interface LobbyPrefsStore {
    load(): Partial<LobbyPrefs>;
    save(p: LobbyPrefs): void;
}

/** 적어 둔 글 → 쓸 수 있는 칸만. 깨졌거나 모르는 값은 그 칸만 버린다. */
export function parseLobbyPrefs(raw: string | null | undefined): Partial<LobbyPrefs> {
    if (!raw) return {};
    let o: unknown;
    try { o = JSON.parse(raw); } catch { return {}; }
    if (!o || typeof o !== "object") return {};
    const r = o as Record<string, unknown>;
    const out: Partial<LobbyPrefs> = {};
    if (r.gameType === "3c" || r.gameType === "4c") out.gameType = r.gameType;
    if (typeof r.tableId === "string" && (TABLE_IDS as readonly string[]).includes(r.tableId)) out.tableId = r.tableId as TableId;
    if (typeof r.handicap === "boolean") out.handicap = r.handicap;
    if (typeof r.target === "number" && isValidTarget(r.target)) out.target = r.target;
    if (typeof r.mode === "string" && (SIM_MODES as readonly string[]).includes(r.mode)) out.mode = r.mode as SimMode;
    if (r.ruleSet === "umb" || r.ruleSet === "pba") out.ruleSet = r.ruleSet;
    if (typeof r.threeCushionDouble === "boolean") out.threeCushionDouble = r.threeCushionDouble;
    if (typeof r.inningCap === "number" && (INNING_CAPS as readonly number[]).includes(r.inningCap)) out.inningCap = r.inningCap;
    return out;
}

/** 이 기기의 저장소 — 화면이 기본으로 쓴다. 시험은 가짜 저장소를 넣는다. */
export const deviceLobbyPrefs: LobbyPrefsStore = {
    load() {
        try { return parseLobbyPrefs(window.localStorage.getItem(LOBBY_PREFS_KEY)); } catch { return {}; }
    },
    save(p) {
        try { window.localStorage.setItem(LOBBY_PREFS_KEY, JSON.stringify(p)); } catch { /* 저장소가 막힌 곳 — 다음에 기본값으로 열린다 */ }
    },
};
