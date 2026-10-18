/**
 * 금어기 달력(2026-10-18 — 공개, 로그인 없이) /fishing/closed. 수산자원관리법 시행령 별표 1의 금어기 줄을 열두 달 막대로.
 *  · 맨 위: 오늘 금어기인 것(조건 있는 줄은 '조건' 표시)
 *  · 무리(어류 · 갑각류 · 패류 · 해조류 · 기타) 거르기
 *  · 달력: 줄마다 막대(고정 = 붉은 막대 · 그 기간 안에서 따로 고시 = 빗금), 오늘은 세로선. 누르면 원문 그대로
 * 글은 받은 그대로(regs.json — 낚시 규칙 화면과 같은 자료). 막대는 날짜 구간만 읽은 것이라 예외 · 해역 한정은 원문을 보라고 적는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { FISHING_COLORS as C } from "@shared/fishing";
import { CLOSED_GROUPS, FISHING_CLOSED_PATH, closedNow, closedOn, closedRange, closedSeo, minSize, type ClosedRange } from "@shared/fishingClosed";
import { FISH, fishById } from "@shared/fishingFish";
import { FISH_REG_NAMES } from "@shared/fishingFishInfo";
import { fishingFishPath } from "@shared/fishingFishPages";
import { fishingSeaCardUrl } from "@shared/ogCards";
import { INK, PAPER, SEAL } from "../ink";
import { useRegs } from "../Guide";
import { Shell } from "./SpotsPages";

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
/** 법령 이름 → 우리 어종 페이지(있을 때만) */
const fishPageOf = (regName: string): string | null => {
    const id = Object.keys(FISH_REG_NAMES).find((k) => FISH_REG_NAMES[k].includes(regName));
    const f = id ? fishById(id) : FISH.find((x) => x.name === regName);
    return f ? fishingFishPath(f.name) : null;
};

function Bar({ r }: { r: ClosedRange }) {
    const seg = (a: number, b: number, k: number) => {
        const style: React.CSSProperties = { left: `${(a / 365) * 100}%`, width: `${Math.max(0.8, ((b - a + 1) / 365) * 100)}%` };
        return r.kind === "window"
            ? <i key={k} className="absolute top-[3px] h-[14px] rounded-[4px]" style={{ ...style, background: `repeating-linear-gradient(135deg, ${SEAL}66 0 4px, ${SEAL}1F 4px 8px)`, boxShadow: `inset 0 0 0 1px ${SEAL}88` }} />
            : <i key={k} className="absolute top-[3px] h-[14px] rounded-[4px]" style={{ ...style, background: SEAL }} />;
    };
    return <>{r.wraps ? [seg(r.from, 364, 0), seg(0, r.to, 1)] : [seg(r.from, r.to, 0)]}</>;
}

/** 금지체장 줄자 — 0cm 부터 그 길이까지 노란 줄자, 눈금 5cm. 이 길이 '이하'는 놓아 준다(무게 기준은 글로) */
function MinRuler({ rows, onOpen, open }: { rows: { group: string; name: string; rule: string }[]; onOpen: (n: string | null) => void; open: string | null }) {
    const sized = rows.map((r) => ({ r, m: minSize(r.rule) }));
    const max = Math.max(10, Math.ceil(Math.max(...sized.map((x) => x.m?.cm ?? 0)) / 10) * 10);
    const ticks = Array.from({ length: max / 5 + 1 }, (_, i) => i * 5);
    return (
        <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }} data-testid="min-ruler">
            <div className="flex items-end px-3 pb-1 pt-3 text-[12px] tabular-nums" style={{ color: "#0F2838B3" }}>
                <span className="w-[86px] shrink-0">cm</span>
                <span className="relative h-4 flex-1">{ticks.filter((t) => t % 10 === 0).map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}</span>
            </div>
            <ul>
                {sized.map(({ r, m }) => {
                    const href = fishPageOf(r.name), isOpen = open === r.name;
                    return (
                        <li key={`${r.group}-${r.name}`} style={{ borderTop: "1px dashed #0F283826" }}>
                            <button type="button" onClick={() => onOpen(isOpen ? null : r.name)} aria-expanded={isOpen} className="flex w-full items-center px-3 py-2 text-left" data-testid="min-row">
                                <span className="w-[86px] shrink-0 pr-2">
                                    <span className="block text-[13px] font-semibold leading-tight [word-break:keep-all]">{r.name.replace(/\(.*\)/, "")}</span>
                                    {m?.conditional && <span className="block text-[12px]" style={{ color: "#0F2838B3" }}>조건 있음</span>}
                                </span>
                                <span className="relative h-5 flex-1">
                                    {ticks.map((t) => <i key={t} className="absolute top-0 w-px" style={{ left: `${(t / max) * 100}%`, height: t % 10 === 0 ? "100%" : "40%", background: "#0F283822" }} aria-hidden />)}
                                    {m?.cm != null ? (
                                        <>
                                            <i className="absolute left-0 top-[3px] h-[14px] rounded-r-[4px]" style={{ width: `${(m.cm / max) * 100}%`, background: "repeating-linear-gradient(90deg, #F2C230 0 calc(100% / 40), #E4B21E calc(100% / 40) calc(100% / 20))", boxShadow: "inset 0 0 0 1px #0F28381F" }} aria-hidden />
                                            <span className="absolute top-[1px] pl-1.5 text-[12px] font-semibold tabular-nums" style={{ left: `${(m.cm / max) * 100}%` }}>{m.cm}</span>
                                        </>
                                    ) : m?.g != null ? <span className="absolute left-0 top-[1px] text-[12px] font-semibold">{m.g}g 이하(무게)</span> : null}
                                </span>
                            </button>
                            {isOpen && (
                                <div className="px-3 pb-3 text-[13px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838CC" }}>
                                    <p>{r.rule}</p>
                                    {href && <Link href={href} className="mt-1.5 inline-block font-semibold underline underline-offset-2" style={{ color: SEAL }}>{r.name} 어종 한 장</Link>}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="px-3 py-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ borderTop: "1px dashed #0F283826", color: "#0F2838B3" }}>줄자의 길이 '이하'는 놓아 줘야 해요. 재는 자리(전장 · 체장 · 두흉갑장 …)는 어종마다 달라요 — 원문을 따르세요.</div>
        </div>
    );
}

export function ClosedPage() {
    const { data: regs } = useRegs();
    const today = kstToday();
    const month = Number(today.slice(5, 7)), day = Number(today.slice(8, 10));
    const todayPos = ((Array.from({ length: month - 1 }, (_, i) => [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]).reduce((a, b) => a + b, 0) + day - 1) / 365) * 100;
    const rows = useMemo(() => (regs?.rows ?? []).filter((r) => r.kind === "closed"), [regs]);
    const now = useMemo(() => closedNow(rows, month, day), [rows, month, day]);
    const groups = CLOSED_GROUPS.filter((g) => rows.some((r) => r.group === g));
    const [group, setGroup] = useState<string>("전체");
    const [open, setOpen] = useState<string | null>(null);
    const [tab, setTab] = useState<"closed" | "min">(() => (typeof window !== "undefined" && window.location.hash === "#min" ? "min" : "closed"));
    const minRows = useMemo(() => (regs?.rows ?? []).filter((r) => r.kind === "min"), [regs]);
    const shown = rows.filter((r) => group === "전체" || r.group === group);
    const seo = closedSeo(rows.length || 33, minRows.length);
    useSeo({ title: seo.title, description: seo.description, path: FISHING_CLOSED_PATH, locale: "ko", image: fishingSeaCardUrl("https://www.rankue.co.kr", "closed") });
    return (
        <Shell title={seo.h1}>
            <div className="relative h-[170px] overflow-hidden" data-testid="closed-cover">
                <img src="/fishing/art/band-rules.webp" alt="" width={640} height={640} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 50%" }} draggable={false} decoding="async" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D77 55%,#0B1E2D 100%)" }} aria-hidden />
                <div className="absolute inset-x-5 bottom-4">
                    <h1 className="text-[26px] font-semibold tracking-tight">{seo.h1}</h1>
                    <p className="mt-0.5 text-[13px]" style={{ color: "#F3ECDDCC" }}>수산자원관리법 시행령 별표 1 · {rows.length || "…"}줄</p>
                </div>
            </div>

            <div className="flex gap-1.5 px-5 pt-4" role="tablist" aria-label="보기">
                {([["closed", "금어기 달력"], ["min", "금지체장 줄자"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="h-10 flex-1 rounded-full text-[14px] font-semibold" style={tab === id ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }} data-testid={`closed-tab-${id}`}>{label}</button>)}
            </div>
            {tab === "min" ? (
                <section className="px-5 pt-4" data-testid="closed-min">
                    <h2 className="mb-2.5 text-[17px] font-semibold">놓아 줄 크기 <span className="text-[13px] font-normal tabular-nums" style={{ color: C.dim }}>{minRows.length}가지</span></h2>
                    <MinRuler rows={minRows} open={open} onOpen={setOpen} />
                    <p className="mt-2 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>출처: {regs?.titles?.min ?? "수산자원관리법 시행령 별표 2"} — {regs?.basis ?? ""}. 낚시하는 사람에게도 적용돼요. 법률 자문이 아니에요.</p>
                </section>
            ) : (<>
            {/* 오늘 금어기 */}
            <section className="px-5 pt-5" data-testid="closed-today">
                <h2 className="mb-2.5 text-[17px] font-semibold">오늘 금어기 <span className="text-[13px] font-normal tabular-nums" style={{ color: C.dim }}>{Number(today.slice(5, 7))}월 {Number(today.slice(8))}일 · {now.length}가지</span></h2>
                {now.length === 0 ? <p className="rounded-2xl px-4 py-3.5 text-[13.5px]" style={{ background: "#FFFFFF0A", color: C.soft }}>오늘 날짜로 걸리는 금어기는 없어요.</p> : (
                    <div className="flex flex-wrap gap-1.5">
                        {now.map((r) => {
                            const c = closedRange(r.rule)!, href = fishPageOf(r.name);
                            const body = <>{r.name}{c.conditional ? <span className="ml-1 text-[12px] opacity-75">조건</span> : null}</>;
                            const cls = "flex h-9 items-center rounded-full px-3 text-[13px] font-semibold";
                            const st = { background: c.kind === "window" ? "#C8372D33" : SEAL, color: "#FFF4EC" };
                            return href ? <Link key={r.name} href={href} className={cls} style={st}>{body}</Link> : <span key={r.name} className={cls} style={st}>{body}</span>;
                        })}
                    </div>
                )}
                <p className="mt-2 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>'조건'은 해역 · 지역 한정이나 예외가 있는 줄이에요. 아래 달력에서 눌러 원문을 확인하세요.</p>
            </section>

            {/* 무리 거르기 */}
            <div className="-mx-0 flex gap-1.5 overflow-x-auto px-5 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="무리">
                {["전체", ...groups].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className="h-9 shrink-0 rounded-full px-3.5 text-[13px]" style={group === g ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>{g}{g !== "전체" ? <span className="ml-1 tabular-nums opacity-70">{rows.filter((r) => r.group === g).length}</span> : null}</button>)}
            </div>

            {/* 달력 */}
            <section className="px-5 pt-3" data-testid="closed-calendar">
                <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                    <div className="flex items-end px-3 pb-1 pt-3 text-[12px] tabular-nums" style={{ color: "#0F2838B3" }}>
                        <span className="w-[86px] shrink-0" />
                        <span className="relative flex flex-1">{MONTHS.map((m) => <span key={m} className="flex-1 text-center">{m}</span>)}</span>
                    </div>
                    <ul>
                        {shown.map((r) => {
                            const c = closedRange(r.rule), href = fishPageOf(r.name), isOpen = open === r.name, on = c ? closedOn(c, month, day) : false;
                            return (
                                <li key={`${r.group}-${r.name}`} style={{ borderTop: "1px dashed #0F283826" }}>
                                    <button type="button" onClick={() => setOpen(isOpen ? null : r.name)} aria-expanded={isOpen} className="flex w-full items-center px-3 py-2 text-left" data-testid="closed-row">
                                        <span className="w-[86px] shrink-0 pr-2">
                                            <span className="block text-[13px] font-semibold leading-tight [word-break:keep-all]" style={{ color: on ? SEAL : INK }}>{r.name.replace(/\(.*\)/, "")}</span>
                                            {c?.conditional && <span className="block text-[12px]" style={{ color: "#0F2838B3" }}>조건 있음</span>}
                                        </span>
                                        <span className="relative h-5 flex-1">
                                            {/* 달 칸 */}
                                            {MONTHS.map((m) => <i key={m} className="absolute top-0 h-full" style={{ left: `${((m - 1) / 12) * 100}%`, width: 1, background: "#0F283814" }} aria-hidden />)}
                                            {c && <Bar r={c} />}
                                            <i className="absolute top-[-2px] h-[24px] w-[2px] rounded-full" style={{ left: `${todayPos}%`, background: "#1F5A78" }} aria-hidden />
                                        </span>
                                    </button>
                                    {isOpen && (
                                        <div className="px-3 pb-3 text-[13px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838CC" }} data-testid="closed-rule">
                                            <p>{r.rule}</p>
                                            {href && <Link href={href} className="mt-1.5 inline-block font-semibold underline underline-offset-2" style={{ color: SEAL }}>{r.name} 어종 한 장</Link>}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[12px]" style={{ borderTop: "1px dashed #0F283826", color: "#0F2838B3" }}>
                        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px]" style={{ background: SEAL }} aria-hidden />금어기</span>
                        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px]" style={{ background: `repeating-linear-gradient(135deg, ${SEAL}66 0 4px, ${SEAL}1F 4px 8px)` }} aria-hidden />이 안에서 따로 고시</span>
                        <span className="flex items-center gap-1.5"><i className="h-3 w-[2px] rounded-full" style={{ background: "#1F5A78" }} aria-hidden />오늘</span>
                    </div>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>출처: {regs?.basis ?? "수산자원관리법 시행령 별표 1"}. 막대는 날짜만 읽은 것이에요 — 해역 한정 · 예외 · 지자체 고시는 원문을 따르세요. 법률 자문이 아니에요.</p>
                <Link href="/fishing/fish" className="mt-3 flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>낚시 어종 보기</Link>
            </section>
            </>)}
        </Shell>
    );
}
