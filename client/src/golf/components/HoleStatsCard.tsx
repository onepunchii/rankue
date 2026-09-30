/**
 * 경기 화면 '이 홀 기록' 카드(2026-10-01 오너 승인) — 점수 입력 카드 밑 빈자리에, **폰 주인 자기 것만**(v1).
 *
 *   퍼팅     0 · 1 · 2 · 3 · 4+     한 번 더 누르면 지운다. 0 은 칩인(작은 칸)
 *   페어웨이  왼쪽 · 안착 · 오른쪽     파4·파5 만(파를 모르는 홀은 보인다 — 적는 건 사람이 고른다)
 *   벌타     OB · 해저드 · 벙커       여럿 고른다. **태그만** — 타수는 위의 +/− 가 정본(처음 켤 때 한 번 알려 준다)
 *   그린 적중 입력 없이 계산(타수 − 퍼팅 ≤ 파 − 2) — 퍼팅을 적으면 머리에 작은 배지. 숫자가 안 맞으면 주황 한 줄
 *   맨 아래   지난번 이 홀 5타 · 보기(같은 골프장·코스·홀의 내 최근 기록, 있을 때만) | 이 홀 사진(머리 📷 와 같은 올리기)
 *
 * 혼자 기록(실제 회원이 나 하나)이면 펼쳐서, 여럿이면 한 줄('이 홀 기록 +')로 접어서 시작한다 — 여럿일 땐 점수 줄이
 * 화면을 채우고, 이 기록은 곁다리라서. 펼침은 기기에 기억한다(혼자·여럿 따로). 적지 않아도 점수·평균·도장엔 아무 일도 없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LucideCamera, LucideChevronUp, LucidePlus, LucideArrowUpLeft, LucideArrowUpRight, LucideLoader2 } from "@/lib/icons";
import {
    FAIRWAY_LABEL, PENALTY_LABEL, PENALTY_TAGS, PUTTS_PLUS, fairwayApplies, greenInRegulation, puttsFit,
    type Fairway, type HoleEntry, type PenaltyTag,
} from "@shared/golfHoleStats";
import { useHoleStats } from "../hooks/useHoleStats";
import { scoreName } from "./ScoreCard";

type Tone = "white" | "lime" | "orange";

function Chip({ on, tone = "white", onClick, label, className, children }: {
    on: boolean; tone?: Tone; onClick: () => void; label: string; className?: string; children: ReactNode;
}) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on} aria-label={label}
            className={cn(
                "h-11 rounded-xl text-[14px] tabular-nums inline-flex items-center justify-center gap-1 transition-colors select-none",
                !on && "bg-[#FFFFFF0D] text-[#FFFFFFCC] font-medium active:bg-[#FFFFFF1F]",
                on && tone === "white" && "bg-[#ffffff] text-[#0A0A0A] font-semibold",
                on && tone === "lime" && "bg-[#64DD17] text-[#051907] font-semibold",
                on && tone === "orange" && "bg-[#FF8A3D29] text-[#FFB27A] font-semibold ring-1 ring-inset ring-[#FF8A3DB3]",
                className,
            )}
        >{children}</button>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div role="group" aria-label={label} className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 text-[12.5px] text-[#FFFFFF80]">{label}</span>
            <div className="flex-1 min-w-0 flex gap-1.5">{children}</div>
        </div>
    );
}

/** 접었을 때 한 줄에 보이는 작은 알약 — 적은 것만 */
function Pill({ tone, children }: { tone: "plain" | "lime" | "orange"; children: ReactNode }) {
    return (
        <span className={cn(
            "shrink-0 h-6 px-2 rounded-md text-[12px] font-medium leading-6 tabular-nums",
            tone === "plain" && "bg-[#FFFFFF14] text-[#FFFFFFD9]",
            tone === "lime" && "bg-[#64DD1724] text-[#9BEF5C]",
            tone === "orange" && "bg-[#FF8A3D24] text-[#FFB27A]",
        )}>{children}</span>
    );
}

const puttLabel = (p: number) => (p >= PUTTS_PLUS ? `${PUTTS_PLUS}+` : String(p));

/** 펼침 기억 — 혼자·여럿 따로(여럿에서 펼쳐 둔 게 혼자 기록까지 따라가지 않게). 저장소를 못 쓰면 기본값으로 */
function useRememberedOpen(solo: boolean): [boolean, (v: boolean) => void] {
    const key = `rankue_golf_holestats_open_${solo ? "solo" : "group"}`;
    const read = () => { try { const v = localStorage.getItem(key); return v == null ? solo : v === "1"; } catch { return solo; } };
    const [open, setOpen] = useState(read);
    // 대기실에서 넘어오며 사람 수가 바뀌면(혼자 → 여럿) 그쪽 기억으로
    useEffect(() => { setOpen(read()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return [open, (v: boolean) => { setOpen(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면은 된다 */ } }];
}

const PENALTY_HINT_KEY = "rankue_golf_penalty_tag_hint";

export interface HoleStatsCardProps {
    sessionId: string;
    /** 지금 홀(0부터) */
    hole: number;
    par: number;
    parKnown: boolean;
    /** 이 홀 내 타수 — 화면에 보이는 값(안 적었으면 파) */
    strokes: number;
    frontCourseName: string | null;
    backCourseName: string | null;
    /** 실제 회원이 나 하나(혼자 기록 포함) — 펼쳐서 시작 */
    solo: boolean;
    isHost: boolean;
    /** 진행 중일 때만 읽고 쓴다 */
    enabled: boolean;
    onPhoto: () => void;
    /** 이 홀에 붙은 사진 수(누구 것이든) · 올리는 중 */
    photoCount: number;
    photoBusy?: boolean;
}

export function HoleStatsCard(props: HoleStatsCardProps) {
    const { sessionId, hole, par, parKnown, strokes, solo, isHost, enabled, onPhoto, photoCount, photoBusy } = props;
    const hs = useHoleStats(sessionId, { enabled, front: props.frontCourseName, back: props.backCourseName, hole });
    const { toast } = useToast();
    const [open, setOpen] = useRememberedOpen(solo);

    const e: HoleEntry = hs.entry(hole);
    const showFairway = fairwayApplies(par, parKnown);
    const gir = greenInRegulation(strokes, e.putts, par, parKnown);
    const misfit = e.putts != null && !puttsFit(strokes, e.putts);
    const last = hs.lastTime?.[hole] ?? null;
    const lastName = last && parKnown ? scoreName(last.strokes - par) : null;

    const onTag = (t: PenaltyTag) => {
        const turningOn = !e.penaltyTags.includes(t);
        hs.toggleTag(hole, t);
        if (!turningOn) return;
        // 태그가 벌타를 더해 주는 줄 알기 쉽다 — 처음 켤 때 한 번만 말한다(기기에 기억)
        try {
            if (localStorage.getItem(PENALTY_HINT_KEY)) return;
            localStorage.setItem(PENALTY_HINT_KEY, "1");
        } catch { return; }
        toast({ title: "기록용 태그예요", description: isHost ? "타수는 그대로예요 · 벌타는 위의 ＋로 더해 주세요" : "타수는 그대로예요 · 타수는 방장이 적어요" });
    };

    // 접었을 때의 한 줄 요약 — 적은 것만, 셋까지(넘치면 +n)
    const pills: { key: string; tone: "plain" | "lime" | "orange"; text: string }[] = [];
    if (e.putts != null) pills.push({ key: "p", tone: "plain", text: `퍼팅 ${puttLabel(e.putts)}` });
    if (e.fairway && showFairway) pills.push({ key: "f", tone: e.fairway === "H" ? "lime" : "plain", text: e.fairway === "H" ? "안착" : `${FAIRWAY_LABEL[e.fairway]} 미스` });
    for (const t of e.penaltyTags) pills.push({ key: t, tone: "orange", text: PENALTY_LABEL[t] });
    if (gir) pills.push({ key: "g", tone: "lime", text: "그린 적중" });
    const shown = pills.slice(0, 3);
    const more = pills.length - shown.length;

    const fairwayChip = (v: Fairway) => (
        <Chip key={v} on={e.fairway === v} tone={v === "H" ? "lime" : "white"} onClick={() => hs.setFairway(hole, v)} label={`페어웨이 ${FAIRWAY_LABEL[v]}`} className="flex-1 min-w-0">
            {v === "L" && <LucideArrowUpLeft weight="bold" className="w-4 h-4 shrink-0 opacity-70" />}
            {FAIRWAY_LABEL[v]}
            {v === "R" && <LucideArrowUpRight weight="bold" className="w-4 h-4 shrink-0 opacity-70" />}
        </Chip>
    );

    return (
        <section className="mx-4 rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F]" aria-label="이 홀 기록">
            {/* 머리 — 누르면 접고 편다 */}
            <button
                type="button" onClick={() => setOpen(!open)} aria-expanded={open}
                className="w-full min-h-[52px] px-4 py-2 flex items-center gap-2 text-left rounded-2xl active:bg-[#FFFFFF08]"
            >
                <span className="shrink-0 text-[14px] font-semibold text-[#ffffff]">이 홀 기록</span>
                {open ? (
                    <>
                        {!solo && <span className="shrink-0 text-[12px] text-[#FFFFFF73]">나만 봐요</span>}
                        <span className="flex-1 min-w-0 flex justify-end">
                            {misfit ? (
                                <span className="text-[12px] font-medium text-[#FFB27A] truncate">퍼팅 수가 타수와 안 맞아요</span>
                            ) : gir ? (
                                <span className="h-6 px-2 rounded-full bg-[#64DD1724] text-[12px] font-semibold leading-6 text-[#9BEF5C]">그린 적중</span>
                            ) : null}
                        </span>
                    </>
                ) : (
                    <span className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
                        {shown.length === 0
                            ? <span className="text-[12.5px] text-[#FFFFFF73] truncate">퍼팅 · 페어웨이 · 벌타</span>
                            : shown.map((p) => <Pill key={p.key} tone={p.tone}>{p.text}</Pill>)}
                        {more > 0 && <Pill tone="plain">+{more}</Pill>}
                    </span>
                )}
                <span aria-hidden className={cn("shrink-0 w-7 h-7 -mr-1 rounded-full flex items-center justify-center", open ? "text-[#FFFFFF80]" : "bg-[#FFFFFF14] text-[#FFFFFFD9]")}>
                    {open ? <LucideChevronUp weight="bold" className="w-4 h-4" /> : <LucidePlus weight="bold" className="w-4 h-4" />}
                </span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-3.5 pb-3.5 space-y-2">
                            <Row label="퍼팅">
                                <Chip on={e.putts === 0} onClick={() => hs.setPutts(hole, 0)} label="퍼팅 0 — 칩인" className={cn("w-10 shrink-0 text-[13px]", e.putts !== 0 && "text-[#FFFFFF99]")}>0</Chip>
                                {[1, 2, 3, PUTTS_PLUS].map((n) => (
                                    <Chip
                                        key={n} on={n === PUTTS_PLUS ? (e.putts ?? -1) >= PUTTS_PLUS : e.putts === n}
                                        onClick={() => hs.setPutts(hole, n)} label={`퍼팅 ${puttLabel(n)}`} className="flex-1 min-w-0"
                                    >{puttLabel(n)}</Chip>
                                ))}
                            </Row>
                            {showFairway && (
                                <Row label="페어웨이">
                                    {(["L", "H", "R"] as const).map(fairwayChip)}
                                </Row>
                            )}
                            <Row label="벌타">
                                {PENALTY_TAGS.map((t) => (
                                    <Chip key={t} on={e.penaltyTags.includes(t)} tone="orange" onClick={() => onTag(t)} label={`${PENALTY_LABEL[t]} 태그`} className="flex-1 min-w-0">
                                        {PENALTY_LABEL[t]}
                                    </Chip>
                                ))}
                            </Row>

                            {/* 지난번 이 홀 | 이 홀 사진 */}
                            <div className="!mt-3 pt-3 border-t border-[#FFFFFF0F] flex items-center gap-3">
                                <span className="flex-1 min-w-0 text-[12.5px] text-[#FFFFFF80] truncate">
                                    {last && (
                                        <>지난번 이 홀 <span className="font-semibold text-[#ffffff] tabular-nums">{last.strokes}타</span>{lastName && <> · {lastName}</>}</>
                                    )}
                                </span>
                                <button
                                    type="button" onClick={onPhoto} aria-label={`이 홀 사진 찍기${photoCount ? ` (${photoCount}장)` : ""}`}
                                    className="shrink-0 h-9 pl-2.5 pr-3 rounded-full bg-[#FFFFFF0F] text-[13px] font-medium text-[#FFFFFFD9] inline-flex items-center gap-1.5 active:bg-[#FFFFFF1F]"
                                >
                                    {photoBusy ? <LucideLoader2 className="w-4 h-4 animate-spin text-[#9BEF5C]" /> : <LucideCamera className="w-[17px] h-[17px]" />}
                                    이 홀 사진
                                    {photoCount > 0 && (
                                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#64DD17] text-[#051907] text-[11px] font-bold leading-[18px] text-center tabular-nums">{photoCount}</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
