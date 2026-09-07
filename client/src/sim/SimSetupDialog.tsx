import { useEffect, useMemo, useRef, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BallDot } from "@/components/hiq/BallDot";
import { ChevronDown } from "@/lib/icons";
import { MinusIcon, PlusIcon } from "./components/railIcons";
import { BallMotif } from "./entry/BallMotif";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { TABLES } from "@shared/sim/params";
import type { CushionModelId } from "@shared/sim/params";
import type { GameType, ThreeCushionRuleSet } from "@shared/sim/rules/types";
import {
    buildConfig, defaultTableFor, defaultTarget, isValidTarget, conditionLabel, clampCondition,
    TARGET_CHIPS, TARGET_MIN, TARGET_MAX, INNING_CAPS, CUSHION_MODELS, SIM_MODES, modePreset, type SimMode,
    CONDITION_MIN, CONDITION_MAX, CONDITION_STEP, CONDITION_DEFAULT,
    type SimSetupConfig, type TableId,
} from "./setupPresets";

// 시뮬레이터 세션 설정. QuickActions 의 "게임 모드 선택" 모달을 대신한다.
// 형태는 CreateCrewTournamentDialog 와 같다 — 제목·시작 버튼 고정, 본문만 스크롤.
// 항목이 많아 보이지만 첫 화면에서 정할 건 종목·다마수뿐이고 나머지는 기본값이 맞다.
// 쿠션 모델·컨디션은 물리 파라미터라 고급 설정 안에 접어 둔다. 기록하기(연습 모드)는 물리가 아니라 '어떻게 칠지'라
// 고급 밖, 이닝 제한 아래에 둔다 — 접힌 곳에 있으면 연습 모드를 아무도 못 찾는다.
// 초록은 시작하기 하나뿐. 대전·드릴 진입은 중립 두 칸(꺾쇠) — 여기서 고르는 값이 아니라 다른 화면으로 가는 길이다.

export type { SimSetupConfig } from "./setupPresets";

export interface SimStartOptions {
    /** false = 연습 모드(서버 기록 없음, 되돌리기·공 배치 허용). 기본 true. */
    readonly record: boolean;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onStart: (config: SimSetupConfig, opts: SimStartOptions) => void;
}

const TABLE_IDS: readonly TableId[] = ["DAEDAE", "JUNGDAE_KR"];

// 세그먼트 버튼 한 칸. 선택은 테두리+연한 브랜드 배경으로만 말한다(대회 개설 창과 동일).
function Segment({ selected, onClick, children, className }: {
    selected: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={selected}
            className={cn(
                "flex-1 h-11 rounded-xl border flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors",
                selected ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                className,
            )}
        >
            {children}
        </button>
    );
}

// 두 줄짜리 세그먼트(이름 + 한 단어 설명). 쿠션 모델처럼 이름만으론 뜻이 안 보이는 항목용.
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

// 스위치 한 줄(제목 + 설명). 4구 옵션처럼 켜고 끄는 규칙용.
function ToggleRow({ id, checked, onCheckedChange, title, desc }: {
    id: string; checked: boolean; onCheckedChange: (v: boolean) => void; title: string; desc: string;
}) {
    return (
        <label htmlFor={id} className="flex items-center justify-between gap-4 h-auto min-h-11 px-4 py-2.5 rounded-xl border border-surface-line cursor-pointer">
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

export function SimSetupDialog({ open, onOpenChange, onStart }: Props) {
    const { t } = useT();
    // 회원 핸디는 다마수 기본값으로만 읽는다. 절대 쓰지 않는다(짠다마 방지: PATCH /me 가 핸디를 받지 않는 설계).
    const { member } = useAuth();

    const [gameType, setGameType] = useState<GameType>("3c");
    const [tableId, setTableId] = useState<TableId>(defaultTableFor("3c"));
    // 다마수는 문자열로 들고 있다 — 지우는 도중의 빈 칸을 0 으로 바꿔 버리면 입력이 망가진다.
    const [targetText, setTargetText] = useState<string>("");
    const [ruleSet, setRuleSet] = useState<ThreeCushionRuleSet>("umb");
    const [threeCushionDouble, setThreeCushionDouble] = useState(false);
    const [passiveFoul, setPassiveFoul] = useState(false);
    const [inningCap, setInningCap] = useState<number>(0);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [cushionModel, setCushionModel] = useState<CushionModelId>("han2005");
    const [condition, setCondition] = useState<number>(CONDITION_DEFAULT);
    // 기록 여부. 끄면 연습 모드(useSimulator record=false: 서버 호출 없음, 되돌리기·공 배치 허용). 기본 켜짐.
    const [record, setRecord] = useState(true);
    // 플레이 모드. 일반 = 조준 보정 자동, 리얼리티 = 큐 방향 그대로 + 마타반 2010 + 대회 테이블. 모드가 물리 기본값을 채우고 세부 설정에서 바꿀 수 있다.
    const [mode, setMode] = useState<SimMode>("normal");
    const pickMode = (m: SimMode) => {
        if (m === mode) return;
        setMode(m);
        const preset = modePreset(m);
        setCushionModel(preset.cushionModel);
        setCondition(preset.condition);
    };

    const handicap = gameType === "3c" ? member?.handi3c : member?.handi4c;

    // 사용자가 다마수를 직접 손댔는지. 열 때·종목을 바꿀 때 초기화한다 — 그 전까지는 늦게 도착한
    // 핸디(/api/hiq/me 가 다이얼로그보다 늦게 응답)도 기본값에 반영하고, 손댄 뒤에는 절대 덮어쓰지 않는다.
    const touched = useRef(false);
    const editTarget = (text: string) => {
        touched.current = true;
        setTargetText(text);
    };

    // 종목이 바뀌면 그 종목의 기본 테이블·다마수로 되돌린다. 4구 다마수를 3쿠션에 들고 가면 말이 안 된다.
    const pickGameType = (g: GameType) => {
        if (g === gameType) return;
        touched.current = false;
        setGameType(g);
        setTableId(defaultTableFor(g));
        setTargetText(String(defaultTarget(g, g === "3c" ? member?.handi3c : member?.handi4c)));
    };

    useEffect(() => {
        if (open) touched.current = false;
    }, [open]);

    // 열려 있고 아직 손대지 않았으면 다마수를 기본값(핸디 → 종목 기본)으로 채운다. 핸디가 늦게 와도 따라간다.
    useEffect(() => {
        if (!open || touched.current) return;
        setTargetText(String(defaultTarget(gameType, handicap)));
    }, [open, handicap, gameType]);

    const targetNum = targetText.trim() === "" ? NaN : Number(targetText);
    const targetOk = isValidTarget(targetNum);
    // "핸디를 기본으로 넣었어요" 안내는 지금 값이 정말 핸디일 때만 — 칩을 누르거나 다른 수를 넣으면 사라진다.
    const handicapUsed = isValidTarget(handicap) && targetOk && targetNum === handicap;
    const chips = TARGET_CHIPS[gameType];
    const condLabel = conditionLabel(condition);

    const condText = useMemo(() => ({
        slow: t("sim.setup.condSlow"),
        normal: t("sim.setup.condNormal"),
        fast: t("sim.setup.condFast"),
    }), [t]);

    const submit = () => {
        if (!targetOk) return;
        onStart(buildConfig({
            gameType, tableId, target: targetNum, inningCap, cushionModel, condition, mode,
            rules: gameType === "3c"
                ? { ruleSet }
                : { threeCushionDouble, passiveOpponentContactIsFoul: passiveFoul },
        }), { record });
    };

    const tableName = (id: TableId) => (id === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae"));
    const tableSize = (id: TableId) => `${TABLES[id].width.toFixed(2)} × ${TABLES[id].length.toFixed(2)} m`;

    // ± 한 단계: 3쿠션 1점, 4구 10점(다마수 단위). 빈 칸이면 종목 기본값에서 시작. 범위 밖은 경계에서 멈춘다.
    const targetStep = gameType === "4c" ? 10 : 1;
    const stepTarget = (dir: -1 | 1) => {
        const cur = targetOk ? targetNum : defaultTarget(gameType, handicap);
        editTarget(String(Math.max(TARGET_MIN, Math.min(TARGET_MAX, cur + dir * targetStep))));
    };
    // 세부 설정 요약 한 줄 — 접혀 있어도 규칙·이닝·기록 상태가 보인다
    const ruleSummary = gameType === "3c"
        ? (ruleSet === "umb" ? t("sim.setup.ruleUmb") : t("sim.setup.rulePba"))
        : ([threeCushionDouble ? t("sim.setup.opt3cDouble") : null, passiveFoul ? t("sim.setup.optPassiveFoul") : null].filter(Boolean).join(" · ") || t("sim.setup.ruleBasic4c"));
    const inningSummary = inningCap === 0 ? `${t("sim.setup.inningCap")} ${t("sim.setup.inningNone")}` : t("sim.setup.inningN").replace("{n}", String(inningCap));
    const advancedSummary = `${ruleSummary} · ${inningSummary} · ${record ? t("sim.setup.record") : t("sim.setup.practiceMode")}`;
    const roundBtn = "w-11 h-11 rounded-pill border border-surface-line bg-surface-1 text-ink-2 flex items-center justify-center active:bg-surface-3 shrink-0";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[420px] max-h-[88dvh] rounded-card flex flex-col gap-0 p-0">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3 text-left">
                    <div className="flex items-center gap-3">
                        <BallMotif kind="single" size={44} />
                        <div className="min-w-0">
                            <DialogTitle>{t("sim.setup.title")}</DialogTitle>
                            <DialogDescription className="text-[13px] font-medium text-ink-3">{t("sim.setup.desc")}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 space-y-4 pb-2">
                    {/* 종목 */}
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

                    {/* 테이블 */}
                    <div className="space-y-1.5">
                        <Label>{t("sim.setup.table")}</Label>
                        <div className="flex gap-2">
                            {TABLE_IDS.map((id) => (
                                <SegmentTwoLine
                                    key={id} selected={tableId === id} onClick={() => setTableId(id)}
                                    title={tableName(id)} desc={tableSize(id)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* 다마수 — 큰 숫자 + ± + 칩. 시작 화면의 주인공 */}
                    <div className="space-y-2">
                        <Label htmlFor="sim-target">{t("sim.setup.target")}</Label>
                        <div className="flex items-center justify-center gap-3">
                            <button type="button" onClick={() => stepTarget(-1)} aria-label={t("sim.setup.targetMinus").replace("{n}", String(targetStep))} className={roundBtn}>
                                <MinusIcon />
                            </button>
                            <Input
                                id="sim-target"
                                inputMode="numeric" pattern="[0-9]*" maxLength={3}
                                value={targetText}
                                onChange={(e) => editTarget(e.target.value.replace(/[^0-9]/g, ""))}
                                aria-invalid={!targetOk}
                                className={cn("h-14 w-[132px] rounded-xl rk-num text-[32px] font-bold text-center bg-surface-3 border-transparent", !targetOk && "border-ink-3")}
                            />
                            <button type="button" onClick={() => stepTarget(1)} aria-label={t("sim.setup.targetPlus").replace("{n}", String(targetStep))} className={roundBtn}>
                                <PlusIcon />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            {chips.map((n) => (
                                <Segment
                                    key={n} selected={targetOk && targetNum === n} onClick={() => editTarget(String(n))}
                                    className="rk-num px-0"
                                >
                                    {n}
                                </Segment>
                            ))}
                        </div>
                        {/* 잘못된 값은 진한 테두리 + 안내 문구로만 말한다(README 토큰 목록 안에서). aria-invalid 가 상태를 전달한다. */}
                        <p className={cn("text-[12px] font-medium leading-relaxed text-center", targetOk ? "text-ink-4" : "text-ink-2")}>
                            {!targetOk
                                ? t("sim.setup.targetRange")
                                : handicapUsed
                                    ? t("sim.setup.targetFromHandicap")
                                    : `${TARGET_MIN}~${TARGET_MAX}`}
                        </p>
                    </div>

                    {/* 모드 — 일반(조준 보정 자동) / 리얼리티(큐 방향 그대로 · 마타반 2010 · 대회 테이블). 설명 한 줄이 따라 붙는다. */}
                    <div className="space-y-1.5">
                        <Label>{t("sim.setup.mode")}</Label>
                        <div className="flex gap-2">
                            {SIM_MODES.map((m) => (
                                <SegmentTwoLine
                                    key={m} selected={mode === m} onClick={() => pickMode(m)}
                                    title={m === "normal" ? t("sim.setup.modeNormal") : t("sim.setup.modeReality")}
                                    desc={m === "normal" ? t("sim.setup.modeNormalDesc") : t("sim.setup.modeRealityDesc")}
                                />
                            ))}
                        </div>
                        <p className="text-[12px] font-medium leading-relaxed text-ink-4">
                            {mode === "normal" ? t("sim.setup.modeNormalHint") : t("sim.setup.modeRealityHint")}
                        </p>
                    </div>

                    {/* 세부 설정 — 접힘. 규칙 · 이닝 제한 · 기록하기 · 쿠션 모델 · 컨디션. 요약 한 줄이 접힌 상태를 대신 말한다(2026-09-07 오너). */}
                    <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                        <CollapsibleTrigger asChild>
                            <button type="button" className="w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left">
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold text-ink-2">{t("sim.setup.advanced")}</span>
                                    <span className="block text-[12px] font-medium text-ink-4 truncate">{advancedSummary}</span>
                                </span>
                                <ChevronDown className={cn("w-4 h-4 text-ink-3 shrink-0 transition-transform", advancedOpen && "rotate-180")} />
                            </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-1">
                            {/* 규칙 — 종목별로 다른 폼 */}
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
                                            id="sim-opt-3c-double" checked={threeCushionDouble} onCheckedChange={setThreeCushionDouble}
                                            title={t("sim.setup.opt3cDouble")} desc={t("sim.setup.opt3cDoubleDesc")}
                                        />
                                        <ToggleRow
                                            id="sim-opt-passive-foul" checked={passiveFoul} onCheckedChange={setPassiveFoul}
                                            title={t("sim.setup.optPassiveFoul")} desc={t("sim.setup.optPassiveFoulDesc")}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 이닝 제한 */}
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

                            {/* 기록하기 — 끄면 연습 모드(되돌리기·공 배치). 기본 켜짐 */}
                            <ToggleRow
                                id="sim-opt-record" checked={record} onCheckedChange={setRecord}
                                title={t("sim.setup.record")} desc={t("sim.setup.recordDesc")}
                            />

                            <div className="space-y-1.5">
                                <Label>{t("sim.setup.cushionModel")}</Label>
                                <div className="flex gap-2">
                                    {CUSHION_MODELS.map((m) => (
                                        <SegmentTwoLine
                                            key={m} selected={cushionModel === m} onClick={() => setCushionModel(m)}
                                            title={m === "han2005" ? t("sim.setup.cushionHan") : t("sim.setup.cushionMathavan")}
                                            desc={m === "han2005" ? t("sim.setup.cushionHanDesc") : t("sim.setup.cushionMathavanDesc")}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-baseline justify-between">
                                    <Label>{t("sim.setup.condition")}</Label>
                                    <span className="text-[13px] font-semibold text-ink-1">
                                        {condText[condLabel]}
                                        <span className="rk-num font-medium text-ink-4 ml-1.5">{condition.toFixed(2)}</span>
                                    </span>
                                </div>
                                <SliderPrimitive.Root
                                    aria-label={t("sim.setup.condition")}
                                    min={CONDITION_MIN} max={CONDITION_MAX} step={CONDITION_STEP}
                                    value={[condition]}
                                    onValueChange={([v]) => setCondition(clampCondition(v))}
                                    className="relative flex w-full h-11 touch-none select-none items-center"
                                >
                                    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-3">
                                        <SliderPrimitive.Range className="absolute h-full bg-brand" />
                                    </SliderPrimitive.Track>
                                    <SliderPrimitive.Thumb className="block h-6 w-6 rounded-full border-2 border-brand bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
                                </SliderPrimitive.Root>
                                <div className="flex justify-between text-[12px] font-medium text-ink-4">
                                    <span>{condText.slow}</span>
                                    <span>{condText.normal}</span>
                                    <span>{condText.fast}</span>
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>

                <DialogFooter className="shrink-0 px-6 pb-6 pt-3 flex-col gap-3">
                    <div className="flex flex-row gap-2 w-full">
                        <Button
                            type="button" variant="outline" onClick={() => onOpenChange(false)}
                            className="h-12 px-5 rounded-xl border-surface-line text-ink-2 font-semibold"
                        >
                            {t("sim.common.cancel")}
                        </Button>
                        <Button
                            type="button" onClick={submit} disabled={!targetOk}
                            className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                        >
                            {t("sim.setup.start")}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
