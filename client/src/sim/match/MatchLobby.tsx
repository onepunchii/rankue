/**
 * 네트워크 대전 로비 — 만들기(코드 발급 → 상대 대기) / 코드로 참가(코드 → 조회 → 다마수 → 참가).
 * 화면은 SimulatorPage 가 `?lobby=1` 일 때 이걸 띄우고, onStarted(match) 를 받으면 actions.startMatch(match) 로 대전에 들어간다.
 * 서버 호출은 matchApi 만(실전 경기 API 금지). 폼의 시각 언어는 SimSetupDialog 와 같다(h-11 rounded-xl 세그먼트, 토큰만).
 * 문구는 전부 sim.match.* / sim.setup.* 키.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BallDot } from "@/components/hiq/BallDot";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TABLES } from "@shared/sim/params";
import type { GameType, ThreeCushionRuleSet } from "@shared/sim/rules/types";
import { SIM_MODES, type SimMode,
    buildConfig, defaultTableFor, defaultTarget, isValidTarget,
    TARGET_CHIPS, TARGET_MIN, TARGET_MAX, INNING_CAPS, type TableId,
} from "../setupPresets";
import {
    matchApi as defaultApi, formatCode, isCompleteCode, sanitizeCode, MATCH_CODE_LENGTH,
    type MatchApi, type MatchPublic,
} from "../matchApi";
import { gameLabel, inningCapLabel, joinErrorKey, rulesLabel, shareText } from "./matchView";
import { ChevronRightIcon, MinusIcon, PlusIcon } from "../components/railIcons";
import { ModeInfoDialog } from "../components/ModeInfoDialog";
import { InviteDialog } from "./InviteDialog";
import { isValidRoomPassword } from "../matchApi";

export type LobbyTab = "create" | "join";

export interface MatchLobbyProps {
    /** 대전이 playing 이 된 순간(호스트: 상대가 들어옴 / 게스트: 참가 성공). 페이지는 actions.startMatch(match). */
    onStarted: (match: MatchPublic) => void;
    /** 대전 행이 생기거나 바뀐 직후(만들기 성공·참가 성공). 페이지는 목록 쿼리를 무효화한다. */
    onCreated?: (match: MatchPublic) => void;
    onClose: () => void;
    /** 테스트·주입용. 기본 matchApi */
    api?: MatchApi;
    initialTab?: LobbyTab;
    /** 만들기/코드로 참가 탭 줄을 보일지. 기본 false — 진입 화면 카드가 이미 둘을 나눠 주므로 한 화면엔 한 가지만(2026-09-08 오너). */
    showTabs?: boolean;
    /** 호스트가 상대를 기다리는 동안의 폴링 주기 (ms). 기본 2000 */
    pollMs?: number;
    /** 만들기 폼의 "멀티방으로 열기" 토글 초기값(진입 화면 "방 만들기"·목록의 "방 만들기") */
    initialPublic?: boolean;
    /** 참가 탭의 코드 초기값(푸시 초대 딥링크·비밀번호 방) */
    initialCode?: string;
}

const TABLE_IDS: readonly TableId[] = ["DAEDAE", "JUNGDAE_KR"];
/** 클립보드 복사 확인 표시 시간 */
const COPIED_MS = 1500;

/* ------------------------------------------------------------------ 폼 조각(SimSetupDialog 와 같은 모양) */

function Segment({ selected, onClick, children, className, disabled }: {
    selected: boolean; onClick: () => void; children: React.ReactNode; className?: string; disabled?: boolean;
}) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={selected} disabled={disabled}
            className={cn(
                "flex-1 h-11 rounded-xl border flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors disabled:opacity-40",
                selected ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                className,
            )}
        >
            {children}
        </button>
    );
}

function SegmentTwoLine({ selected, onClick, title, desc }: {
    selected: boolean; onClick: () => void; title: string; desc: string;
}) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={selected}
            className={cn(
                "flex-1 min-h-11 py-2 rounded-xl border flex flex-col items-center justify-center leading-tight transition-colors",
                selected ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
            )}
        >
            <span className="text-[13px] font-semibold">{title}</span>
            <span className={cn("text-[12px] font-medium mt-0.5", selected ? "text-ink-3" : "text-ink-4")}>{desc}</span>
        </button>
    );
}

function ToggleRow({ id, checked, onCheckedChange, title, desc }: {
    id: string; checked: boolean; onCheckedChange: (v: boolean) => void; title: string; desc: string;
}) {
    return (
        <label htmlFor={id} className="flex items-center justify-between gap-4 min-h-11 px-4 py-2.5 rounded-xl border border-surface-line cursor-pointer">
            <span className="flex flex-col leading-tight">
                <span className="text-[13px] font-semibold text-ink-1">{title}</span>
                <span className="text-[12px] font-medium text-ink-4 mt-0.5">{desc}</span>
            </span>
            <Switch
                id={id} checked={checked} onCheckedChange={onCheckedChange}
                className="shrink-0 data-[state=checked]:bg-brand data-[state=unchecked]:bg-surface-3"
            />
        </label>
    );
}

/** 다마수 칩 줄 + 직접 입력. 값은 문자열(지우는 도중의 빈 칸을 0 으로 바꾸지 않기 위해). */
export function TargetPicker({ id, gameType, text, onText, label }: {
    id: string; gameType: GameType; text: string; onText: (v: string) => void; label: string;
}) {
    const { t } = useT();
    const n = text.trim() === "" ? NaN : Number(text);
    const ok = isValidTarget(n);
    // ± 한 단계: 3쿠션 1점, 4구 10점. 빈 칸이면 종목 기본값에서 시작. 설정 창(SimSetupDialog)과 같은 큰 숫자 꼴.
    const step = gameType === "4c" ? 10 : 1;
    const bump = (dir: -1 | 1) => {
        const cur = ok ? n : defaultTarget(gameType);
        onText(String(Math.max(TARGET_MIN, Math.min(TARGET_MAX, cur + dir * step))));
    };
    const roundBtn = "w-11 h-11 rounded-pill border border-surface-line bg-surface-1 text-ink-2 flex items-center justify-center active:bg-surface-3 shrink-0";
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => bump(-1)} aria-label={t("sim.setup.targetMinus").replace("{n}", String(step))} className={roundBtn}><MinusIcon /></button>
                <Input
                    id={id} inputMode="numeric" pattern="[0-9]*" maxLength={3} value={text}
                    onChange={(e) => onText(e.target.value.replace(/[^0-9]/g, ""))}
                    aria-invalid={!ok}
                    className={cn("h-14 w-[132px] rounded-xl rk-num text-[32px] font-bold text-center bg-surface-3 border-transparent", !ok && "border-ink-3")}
                />
                <button type="button" onClick={() => bump(1)} aria-label={t("sim.setup.targetPlus").replace("{n}", String(step))} className={roundBtn}><PlusIcon /></button>
            </div>
            <div className="flex gap-2">
                {TARGET_CHIPS[gameType].map((c) => (
                    <Segment key={c} selected={ok && n === c} onClick={() => onText(String(c))} className="rk-num px-0">{c}</Segment>
                ))}
            </div>
            <p className={cn("text-[12px] font-medium leading-relaxed text-center", ok ? "text-ink-4" : "text-ink-2")}>
                {ok ? `${TARGET_MIN}~${TARGET_MAX}` : t("sim.setup.targetRange")}
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ 만들기 */

function CreateTab({ api, pollMs, onStarted, onCreated, initialPublic = false }: { api: MatchApi; pollMs: number; onStarted: (m: MatchPublic) => void; onCreated?: (m: MatchPublic) => void; initialPublic?: boolean }) {
    const { t } = useT();
    const [gameType, setGameType] = useState<GameType>("3c");
    const [tableId, setTableId] = useState<TableId>(defaultTableFor("3c"));
    const [targetText, setTargetText] = useState<string>(String(defaultTarget("3c")));
    const [ruleSet, setRuleSet] = useState<ThreeCushionRuleSet>("umb");
    const [threeCushionDouble, setThreeCushionDouble] = useState(false);
    const [passiveFoul, setPassiveFoul] = useState(false);
    // 플레이 모드: 방장이 고르면 게스트도 같은 모드(서버 aimAssist). 물리 기본값은 buildConfig 의 모드 프리셋이 채운다.
    const [mode, setMode] = useState<SimMode>("normal");
    const [modeInfo, setModeInfo] = useState<SimMode | null>(null);
    // 세부 설정(규칙 · 이닝 제한)은 접어 둔다 — 대전 만들기는 종목·테이블·다마수·모드면 충분하다(2026-09-07 오너)
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [inningCap, setInningCap] = useState<number>(0);
    // 대전 미리보기: 기본 짧게(첫 접촉 + 꺾임 꼬리). 켜면 연습처럼 전체 경로(친구끼리 편하게 칠 때).
    const [fullPreview, setFullPreview] = useState(false);
    // 멀티방(공개 방, 2026-09-08 오너): 목록에 떠서 누구나 참가. 비밀번호(선택 4~20자)는 공개 방에서만 받는다.
    const [isPublic, setIsPublic] = useState(initialPublic);
    const [password, setPassword] = useState("");
    const [inviteOpen, setInviteOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<MatchPublic | null>(null);
    const [copied, setCopied] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const onStartedRef = useRef(onStarted);
    onStartedRef.current = onStarted;

    const targetNum = targetText.trim() === "" ? NaN : Number(targetText);
    const targetOk = isValidTarget(targetNum);
    const passwordOk = !isPublic || isValidRoomPassword(password);

    const pickGameType = (g: GameType) => {
        if (g === gameType) return;
        setGameType(g);
        setTableId(defaultTableFor(g));
        setTargetText(String(defaultTarget(g)));
    };

    const create = async () => {
        if (!targetOk || !passwordOk || creating) return;
        setCreating(true);
        setError(null);
        try {
            const m = await api.createMatch(buildConfig({
                gameType, tableId, target: targetNum, inningCap, mode, matchPreview: fullPreview ? "full" : "short",
                rules: gameType === "3c" ? { ruleSet } : { threeCushionDouble, passiveOpponentContactIsFoul: passiveFoul },
            }), { isPublic, password: isPublic && password !== "" ? password : undefined });
            setCreated(m);
            onCreated?.(m);
        } catch {
            setError(t("sim.match.createFailed"));
        } finally {
            setCreating(false);
        }
    };

    // 상대가 들어올 때까지 폴링. playing 이 되면 onStarted, 취소·종료면 폼으로.
    useEffect(() => {
        if (!created || created.status !== "waiting") return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            try {
                const m = await api.getMatch(created.id);
                if (stop) return;
                if (m.status === "playing") { onStartedRef.current(m); return; }
                if (m.status !== "waiting") { setCreated(null); return; }
            } catch { /* 다음 주기에 다시 */ }
            if (!stop) timer = setTimeout(tick, pollMs);
        };
        timer = setTimeout(tick, pollMs);
        return () => { stop = true; if (timer) clearTimeout(timer); };
    }, [created, api, pollMs]);

    useEffect(() => {
        if (!copied) return;
        const h = setTimeout(() => setCopied(false), COPIED_MS);
        return () => clearTimeout(h);
    }, [copied]);

    const copyCode = useCallback(async (code: string) => {
        try {
            await navigator.clipboard?.writeText(code);
            setCopied(true);
        } catch { /* 클립보드 권한 없음 — 코드는 화면에 크게 보인다 */ }
    }, []);

    const share = useCallback(async (code: string) => {
        const text = shareText(code, t);
        const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
        if (typeof nav.share === "function") {
            try { await nav.share({ text }); return; } catch { /* 취소 → 복사로 */ }
        }
        await copyCode(code);
    }, [t, copyCode]);

    const cancel = async () => {
        if (!created || canceling) return;
        setCanceling(true);
        try { await api.resign(created.id); } catch { /* 이미 취소됐거나 시작됨 — 폴링이 처리 */ }
        setCanceling(false);
        setCreated(null);
    };

    // 방을 연 뒤 흐른 시간(초 단위 갱신) — 대기 화면이 살아 있어 보이게
    const [waited, setWaited] = useState(0);
    useEffect(() => {
        if (!created) { setWaited(0); return; }
        const from = Date.parse(created.createdAt) || Date.now();
        const tick = () => setWaited(Math.max(0, Math.floor((Date.now() - from) / 1000)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [created]);
    const waitedLabel = `${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, "0")}`;

    const tableName = (id: TableId) => (id === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae"));
    const tableSize = (id: TableId) => `${TABLES[id].width.toFixed(2)} × ${TABLES[id].length.toFixed(2)} m`;

    if (created) {
        return (
            <div className="space-y-4" data-testid="lobby-waiting">
                <div className="rounded-card border border-surface-line bg-surface-2 px-5 py-6 text-center space-y-2">
                    <p className="text-[13px] font-semibold text-ink-3">{t("sim.match.codeTitle")}</p>
                    <p className="rk-num text-[40px] leading-none font-bold text-ink-1" aria-label={t("sim.match.codeTitle")}>{formatCode(created.code)}</p>
                    <p className="text-[12px] font-medium text-ink-4 leading-relaxed">{created.isPublic ? t("sim.match.publicWaiting") : t("sim.match.codeHint")}</p>
                    {created.isPublic && (
                        <p className="flex justify-center gap-1.5">
                            <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.entry.rooms")}</span>
                            {created.hasPassword && <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.match.publicLocked")}</span>}
                        </p>
                    )}
                </div>
                {/* 친구에게 보내기: 푸시 초대 → 받은 쪽이 누르면 바로 참가 */}
                <Button
                    type="button" variant="outline" onClick={() => setInviteOpen(true)}
                    className="w-full h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                >
                    {t("sim.match.invite")}
                </Button>
                <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} api={api} matchId={created.id} />
                <div className="flex gap-2">
                    <Button
                        type="button" variant="outline" onClick={() => { void copyCode(created.code); }}
                        className="flex-1 h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                    >
                        {copied ? t("sim.match.copied") : t("sim.match.copy")}
                    </Button>
                    <Button
                        type="button" onClick={() => { void share(created.code); }}
                        className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {t("sim.match.share")}
                    </Button>
                </div>
                {/* 멈춰 보이지 않게: 도는 점 + 경과 시간 + "앱을 닫아도 알림이 갑니다"(2026-09-08 오너) */}
                <div className="rounded-card border border-surface-line bg-surface-1 px-4 py-3 text-center">
                    <p className="text-[13px] font-semibold text-ink-1 flex items-center justify-center gap-2">
                        <span className="relative inline-flex w-2 h-2" aria-hidden="true">
                            <span className="absolute inset-0 rounded-pill bg-brand animate-ping opacity-60" />
                            <span className="relative inline-flex w-2 h-2 rounded-pill bg-brand" />
                        </span>
                        {t("sim.match.waitingGuest")}
                        <span className="rk-num text-ink-3 font-medium">{waitedLabel}</span>
                    </p>
                    <p className="text-[12px] font-medium text-ink-3 mt-1">{gameLabel(created, t)} · {created.hostTarget}</p>
                    <p className="text-[12px] font-medium text-ink-4 mt-2 leading-relaxed">{t("sim.match.waitingPush")}</p>
                </div>
                <Button
                    type="button" variant="ghost" onClick={() => { void cancel(); }} disabled={canceling}
                    className="w-full h-11 rounded-xl text-ink-3 font-semibold"
                >
                    {t("sim.match.cancelWait")}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label>{t("sim.setup.gameType")}</Label>
                <div className="flex gap-2">
                    {(["3c", "4c"] as const).map((g) => (
                        <Segment key={g} selected={gameType === g} onClick={() => pickGameType(g)}>
                            <BallDot type={g} size={13} />
                            {g === "3c" ? t("sim.setup.type3c") : t("sim.setup.type4c")}
                        </Segment>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label>{t("sim.setup.table")}</Label>
                <div className="flex gap-2">
                    {TABLE_IDS.map((id) => (
                        <SegmentTwoLine key={id} selected={tableId === id} onClick={() => setTableId(id)} title={tableName(id)} desc={tableSize(id)} />
                    ))}
                </div>
            </div>

            <TargetPicker id="sim-match-target" gameType={gameType} text={targetText} onText={setTargetText} label={t("sim.match.myTarget")} />

            <div className="space-y-1.5">
                <Label>{t("sim.setup.mode")}</Label>
                <div className="flex gap-2">
                    {SIM_MODES.map((m) => (
                        <Segment key={m} selected={mode === m} onClick={() => setModeInfo(m)}>
                            {m === "normal" ? t("sim.setup.modeNormal") : t("sim.setup.modeReality")}
                        </Segment>
                    ))}
                </div>
                <ModeInfoDialog
                    open={modeInfo !== null} mode={modeInfo ?? mode}
                    onOpenChange={(o) => { if (!o) setModeInfo(null); }}
                    onView={setModeInfo}
                    onPick={(m) => { setMode(m); setModeInfo(null); }}
                />
            </div>

            {/* 멀티방으로 열기(공개 방) + 비밀번호(선택) */}
            <div className="space-y-2">
                <ToggleRow id="sim-match-public" checked={isPublic} onCheckedChange={setIsPublic} title={t("sim.match.publicRoom")} desc={t("sim.match.publicRoomDesc")} />
                {isPublic && (
                    <div className="space-y-1.5">
                        <Label htmlFor="sim-match-password">{t("sim.match.passwordLabel")}</Label>
                        <Input
                            id="sim-match-password" type="password" autoComplete="off" value={password}
                            onChange={(e) => setPassword(e.target.value)} placeholder={t("sim.match.passwordPlaceholder")}
                            aria-invalid={!passwordOk} className="h-12 rounded-xl"
                        />
                        {!passwordOk && <p className="text-[12px] font-medium text-ink-2">{t("sim.match.passwordInvalid")}</p>}
                    </div>
                )}
            </div>

            {/* 세부 설정 — 규칙 · 이닝 제한. 요약 한 줄이 접힌 상태를 말한다. */}
            <div>
                <button type="button" onClick={() => setAdvancedOpen((o) => !o)} aria-expanded={advancedOpen} className="w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left">
                    <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink-2">{t("sim.setup.advanced")}</span>
                        <span className="block text-[12px] font-medium text-ink-4 truncate">
                            {(gameType === "3c"
                                ? (ruleSet === "umb" ? t("sim.setup.ruleUmb") : t("sim.setup.rulePba"))
                                : ([threeCushionDouble ? t("sim.setup.opt3cDouble") : null, passiveFoul ? t("sim.setup.optPassiveFoul") : null].filter(Boolean).join(" · ") || t("sim.setup.ruleBasic4c")))}
                            {" · "}
                            {inningCap === 0 ? `${t("sim.setup.inningCap")} ${t("sim.setup.inningNone")}` : t("sim.setup.inningN").replace("{n}", String(inningCap))}
                        </span>
                    </span>
                    <span className={cn("text-ink-3 shrink-0 transition-transform", advancedOpen ? "rotate-90" : "")}><ChevronRightIcon /></span>
                </button>
                {advancedOpen && (
                    <div className="space-y-4 pt-1">
                        <div className="space-y-1.5">
                            <Label>{t("sim.setup.rules")}</Label>
                            {gameType === "3c" ? (
                                <div className="flex gap-2">
                                    {(["umb", "pba"] as const).map((r) => (
                                        <SegmentTwoLine
                                            key={r} selected={ruleSet === r} onClick={() => setRuleSet(r)}
                                            title={r === "umb" ? t("sim.setup.ruleUmb") : t("sim.setup.rulePba")}
                                            desc={r === "umb" ? t("sim.setup.ruleUmbHint") : t("sim.setup.rulePbaHint")}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <ToggleRow
                                        id="sim-match-3c-double" checked={threeCushionDouble} onCheckedChange={setThreeCushionDouble}
                                        title={t("sim.setup.opt3cDouble")} desc={t("sim.setup.opt3cDoubleDesc")}
                                    />
                                    <ToggleRow
                                        id="sim-match-passive-foul" checked={passiveFoul} onCheckedChange={setPassiveFoul}
                                        title={t("sim.setup.optPassiveFoul")} desc={t("sim.setup.optPassiveFoulDesc")}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t("sim.setup.inningCap")}</Label>
                            <div className="flex gap-2">
                                {INNING_CAPS.map((n) => (
                                    <Segment key={n} selected={inningCap === n} onClick={() => setInningCap(n)} className="rk-num px-0">
                                        {n === 0 ? t("sim.setup.inningNone") : t("sim.setup.inningN").replace("{n}", String(n))}
                                    </Segment>
                                ))}
                            </div>
                        </div>

                        <ToggleRow
                            id="sim-match-full-preview" checked={fullPreview} onCheckedChange={setFullPreview}
                            title={t("sim.setup.previewFull")} desc={t("sim.setup.previewFullDesc")}
                        />
                    </div>
                )}
            </div>

            {error && <p className="text-[12px] font-medium text-ink-2">{error}</p>}
            <Button
                type="button" onClick={() => { void create(); }} disabled={!targetOk || !passwordOk || creating}
                className="w-full h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
            >
                {creating ? t("sim.match.creating") : t("sim.match.create")}
            </Button>
        </div>
    );
}

/* ------------------------------------------------------------------ 코드로 참가 */

type Lookup =
    | { readonly status: "idle" }
    | { readonly status: "looking" }
    | { readonly status: "found"; readonly match: MatchPublic }
    | { readonly status: "error"; readonly key: string };

function JoinTab({ api, onStarted, onCreated, initialCode }: { api: MatchApi; onStarted: (m: MatchPublic) => void; onCreated?: (m: MatchPublic) => void; initialCode?: string }) {
    const { t } = useT();
    const [code, setCode] = useState(initialCode ? sanitizeCode(initialCode) : "");
    // 비밀번호 방(hasPassword)일 때만 묻는다
    const [password, setPassword] = useState("");
    const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
    const [targetText, setTargetText] = useState("");
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const reqRef = useRef(0);

    // 6자리가 차면 바로 조회한다(자동 진행). 지우면 다시 idle.
    useEffect(() => {
        const id = ++reqRef.current;
        if (!isCompleteCode(code)) {
            setLookup({ status: "idle" });
            setJoinError(null);
            return;
        }
        setLookup({ status: "looking" });
        setJoinError(null);
        void api.lookupCode(code).then(
            (m) => { if (reqRef.current !== id) return; setLookup({ status: "found", match: m }); setTargetText(String(m.hostTarget)); },
            (e: unknown) => { if (reqRef.current !== id) return; setLookup({ status: "error", key: joinErrorKey(e) }); },
        );
    }, [code, api]);

    const found = lookup.status === "found" ? lookup.match : null;
    const targetNum = targetText.trim() === "" ? NaN : Number(targetText);
    const targetOk = isValidTarget(targetNum);
    const needsPassword = !!found?.hasPassword;
    const canJoin = !!found && targetOk && (!needsPassword || password !== "");

    const join = async () => {
        if (!found || !canJoin || joining) return;
        setJoining(true);
        setJoinError(null);
        try {
            const m = needsPassword ? await api.joinMatch(code, targetNum, password) : await api.joinMatch(code, targetNum);
            onCreated?.(m);
            onStarted(m);
        } catch (e) {
            setJoinError(t(joinErrorKey(e)));
        } finally {
            setJoining(false);
        }
    };

    const hint = useMemo(() => {
        if (lookup.status === "looking") return t("sim.match.lookingUp");
        if (lookup.status === "error") return t(lookup.key);
        return null;
    }, [lookup, t]);

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="sim-match-code">{t("sim.match.codeLabel")}</Label>
                <Input
                    id="sim-match-code"
                    inputMode="numeric" pattern="[0-9]*" maxLength={MATCH_CODE_LENGTH} autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(sanitizeCode(e.target.value))}
                    aria-invalid={lookup.status === "error"}
                    className={cn("h-14 rounded-xl rk-num text-[24px] font-semibold text-center", lookup.status === "error" && "border-ink-3")}
                />
                <p className={cn("text-[12px] font-medium leading-relaxed min-h-[18px]", lookup.status === "error" ? "text-ink-2" : "text-ink-4")}>
                    {hint ?? " "}
                </p>
            </div>

            {found && (
                <div className="space-y-4" data-testid="lobby-found">
                    <div className="rounded-tile border border-surface-line bg-surface-2 px-4 py-3 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px] font-medium text-ink-4">{t("sim.match.hostLabel")}</span>
                            <span className="text-[14px] font-semibold text-ink-1 truncate">{found.hostName}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px] font-medium text-ink-4">{t("sim.setup.gameType")}</span>
                            <span className="text-[13px] font-semibold text-ink-2">{gameLabel(found, t)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px] font-medium text-ink-4">{t("sim.setup.rules")}</span>
                            <span className="text-[13px] font-semibold text-ink-2">{rulesLabel(found, t)} · {inningCapLabel(found.inningCap, t)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px] font-medium text-ink-4">{t("sim.match.hostTarget")}</span>
                            <span className="rk-num text-[14px] font-semibold text-ink-1">{found.hostTarget}</span>
                        </div>
                    </div>

                    <TargetPicker id="sim-match-guest-target" gameType={found.gameType} text={targetText} onText={setTargetText} label={t("sim.match.myTarget")} />

                    {needsPassword && (
                        <div className="space-y-1.5">
                            <Label htmlFor="sim-match-join-password">{t("sim.rooms.password")}</Label>
                            <Input
                                id="sim-match-join-password" type="password" autoComplete="off" value={password}
                                onChange={(e) => setPassword(e.target.value)} placeholder={t("sim.rooms.passwordHint")} className="h-12 rounded-xl"
                            />
                        </div>
                    )}

                    {joinError && <p className="text-[12px] font-medium text-ink-2">{joinError}</p>}
                    <Button
                        type="button" onClick={() => { void join(); }} disabled={!canJoin || joining}
                        className="w-full h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {joining ? t("sim.match.joining") : t("sim.match.join")}
                    </Button>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ 로비 */

export function MatchLobby({ onStarted, onCreated, onClose, api = defaultApi, initialTab = "create", showTabs = false, pollMs = 2000, initialPublic = false, initialCode }: MatchLobbyProps) {
    const { t } = useT();
    const [tab, setTab] = useState<LobbyTab>(initialTab);
    const title = showTabs ? t("sim.match.title") : tab === "create" ? (initialPublic ? t("sim.entry.roomCreate") : t("sim.entry.create")) : t("sim.entry.join");

    return (
        <div className="flex flex-col gap-4 w-full max-w-[420px] mx-auto px-5 pt-4 pb-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[18px] font-semibold text-ink-1 leading-tight">{title}</h2>
                </div>
                <button
                    type="button" onClick={onClose}
                    className="shrink-0 h-11 px-3 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2"
                >
                    {t("sim.common.close")}
                </button>
            </div>

            {showTabs && (
            <div className="flex gap-2" role="tablist" aria-label={t("sim.match.title")}>
                {(["create", "join"] as const).map((k) => (
                    <button
                        key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={cn(
                            "flex-1 h-11 rounded-xl border text-[13px] font-semibold transition-colors",
                            tab === k ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                        )}
                    >
                        {k === "create" ? t("sim.match.tabCreate") : t("sim.match.tabJoin")}
                    </button>
                ))}
            </div>
            )}

            {tab === "create"
                ? <CreateTab api={api} pollMs={pollMs} onStarted={onStarted} onCreated={onCreated} initialPublic={initialPublic} />
                : <JoinTab api={api} onStarted={onStarted} onCreated={onCreated} initialCode={initialCode} />}
        </div>
    );
}

export default MatchLobby;
