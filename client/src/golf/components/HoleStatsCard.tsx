/**
 * 경기 화면 '이 홀 기록' 카드(2026-10-01 오너 승인) — 점수 입력 카드 밑 빈자리에, **폰 주인 자기 것만**(v1).
 *
 *   퍼팅     0 · 1 · 2 · 3 · 4+     한 번 더 누르면 지운다. 0 은 칩인(작은 칸)
 *   페어웨이  페어웨이 · 러프         파4·파5 만(파를 모르는 홀은 보인다 — 적는 건 사람이 고른다)
 *   그린     레귤러 온 / 실패         입력 없이 퍼팅으로 계산(타수 − 퍼팅 ≤ 파 − 2) — 몇 타 만에 올렸는지도 같이. 숫자가 안 맞으면 주황 한 줄
 *   맨 아래   지난번 이 홀 5타 · 보기(같은 골프장·코스·홀의 내 최근 기록, 있을 때만)
 * 2026-10-01 오너 조정: 벌타 태그는 헷갈려서 뺐고, 페어웨이는 왼쪽·오른쪽 대신 페어웨이/러프 둘, 레귤러 온을 한 줄로 또렷하게,
 * '이 홀 사진'은 머리의 카메라와 겹쳐서 뺐다.
 *
 * 혼자 기록(실제 회원이 나 하나)이면 펼쳐서, 여럿이면 한 줄('이 홀 기록 +')로 접어서 시작한다 — 여럿일 땐 점수 줄이
 * 화면을 채우고, 이 기록은 곁다리라서. 펼침은 기기에 기억한다(혼자·여럿 따로). 적지 않아도 점수·평균·도장엔 아무 일도 없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideChevronUp, LucidePlus } from "@/lib/icons";
import { PUTTS_PLUS, fairwayApplies, greenInRegulation, puttsFit, type HoleEntry } from "@shared/golfHoleStats";
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
}

export function HoleStatsCard(props: HoleStatsCardProps) {
    const { sessionId, hole, par, parKnown, strokes, solo, enabled } = props;
    const hs = useHoleStats(sessionId, { enabled, front: props.frontCourseName, back: props.backCourseName, hole });
    const [open, setOpen] = useRememberedOpen(solo);

    const e: HoleEntry = hs.entry(hole);
    const showFairway = fairwayApplies(par, parKnown);
    const gir = greenInRegulation(strokes, e.putts, par, parKnown);
    const misfit = e.putts != null && !puttsFit(strokes, e.putts);
    const last = hs.lastTime?.[hole] ?? null;
    const lastName = last && parKnown ? scoreName(last.strokes - par) : null;
    /** 러프 — 그 전에 적힌 왼쪽·오른쪽(L·R)도 러프로 보여 준다 */
    const rough = e.fairway === "M" || e.fairway === "L" || e.fairway === "R";
    /** 몇 타 만에 그린에 올렸나(칩인이면 0 퍼팅이라 '칩인'으로) */
    const toGreen = e.putts != null && !misfit ? strokes - e.putts : null;

    // 접었을 때의 한 줄 요약 — 적은 것만(퍼팅 · 페어웨이 · 레귤러 온, 많아야 셋)
    const pills: { key: string; tone: "plain" | "lime" | "orange"; text: string }[] = [];
    if (e.putts != null) pills.push({ key: "p", tone: "plain", text: `퍼팅 ${puttLabel(e.putts)}` });
    if (e.fairway && showFairway) pills.push({ key: "f", tone: e.fairway === "H" ? "lime" : "plain", text: e.fairway === "H" ? "페어웨이" : "러프" });
    if (gir !== null) pills.push({ key: "g", tone: gir ? "lime" : "plain", text: gir ? "레귤러 온" : "레귤러 온 실패" });
    if (misfit) pills.push({ key: "x", tone: "orange", text: "퍼팅 확인" });

    return (
        <section className="mx-4 rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F]" aria-label="이 홀 기록">
            {/* 머리 — 누르면 접고 편다 */}
            <button
                type="button" onClick={() => setOpen(!open)} aria-expanded={open}
                className="w-full min-h-[52px] px-4 py-2 flex items-center gap-2 text-left rounded-2xl active:bg-[#FFFFFF08]"
            >
                <span className="shrink-0 text-[14px] font-semibold text-[#ffffff]">이 홀 기록</span>
                {open ? (
                    <span className="flex-1 min-w-0">
                        {!solo && <span className="text-[12px] text-[#FFFFFF73]">나만 봐요</span>}
                    </span>
                ) : (
                    <span className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
                        {pills.length === 0
                            ? <span className="text-[12.5px] text-[#FFFFFF73] truncate">퍼팅 · 페어웨이 · 레귤러 온</span>
                            : pills.map((p) => <Pill key={p.key} tone={p.tone}>{p.text}</Pill>)}
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
                                    <Chip on={e.fairway === "H"} tone="lime" onClick={() => hs.setFairway(hole, "H")} label="페어웨이 안착" className="flex-1 min-w-0">페어웨이</Chip>
                                    <Chip on={rough} onClick={() => hs.setFairway(hole, rough ? e.fairway : "M")} label="러프" className="flex-1 min-w-0">러프</Chip>
                                </Row>
                            )}
                            {/* 그린 — 레귤러 온은 적지 않는다. 퍼팅을 고르면 타수 − 퍼팅 으로 바로 판정한다 */}
                            <Row label="그린">
                                <div className="flex-1 min-w-0 h-11 flex items-center gap-2" aria-live="polite">
                                    {e.putts == null ? (
                                        <span className="text-[13px] text-[#FFFFFF66] truncate">퍼팅을 고르면 레귤러 온이 나와요</span>
                                    ) : misfit ? (
                                        <span className="text-[13px] font-medium text-[#FFB27A] truncate">퍼팅 수가 타수({strokes})와 안 맞아요</span>
                                    ) : gir === null ? (
                                        <span className="text-[13px] text-[#FFFFFF80] truncate">{e.putts === 0 ? "칩인" : `${toGreen}타 만에 그린`} · 파를 몰라 판정 안 해요</span>
                                    ) : (
                                        <>
                                            <span className={cn(
                                                "shrink-0 h-8 px-3 rounded-full text-[13px] font-semibold leading-8",
                                                gir ? "bg-[#64DD17] text-[#051907]" : "bg-[#FFFFFF14] text-[#FFFFFFCC]",
                                            )}>{gir ? "레귤러 온" : "레귤러 온 실패"}</span>
                                            <span className="min-w-0 truncate text-[12.5px] text-[#FFFFFF80] tabular-nums">
                                                {e.putts === 0 ? "칩인" : `${toGreen}타 만에 그린`}{!gir && ` · 파${par}는 ${par - 2}타`}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </Row>

                            {/* 지난번 이 홀 — 있을 때만 */}
                            {last && (
                                <p className="!mt-3 pt-3 border-t border-[#FFFFFF0F] text-[12.5px] text-[#FFFFFF80] truncate">
                                    지난번 이 홀 <span className="font-semibold text-[#ffffff] tabular-nums">{last.strokes}타</span>{lastName && <> · {lastName}</>}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
