/**
 * 큐 케이스(2026-10-16 오너: "당구도 골프랑 등산처럼 배찌가 필요해 …" → "큐케이스로 가고 · 2번도 합치자(온라인 장식장)").
 * `/cue-case[?m=<회원 id>][&sec=cue|chalk|glove|medals]`. 옛 장식장(/online-game?shelf=1)은 여기의 메달 · 배지 칸으로 온다.
 *
 * 위에서부터: 가죽 뚜껑(놋쇠 명판 — 누구의 케이스 · 모은 수) → 대표 큐(상감을 크게 훑는다) → 이달 장갑 12칸
 * → [큐 · 초크 · 장갑 · 메달 · 배지]. 큐는 다시 [실전 · 온라인 · 공통 · 양쪽 · 크루]로 가른다.
 * 받은 것은 자리에 들어가 있고, 못 받은 자리는 파인 모양만 — 누르면 받는 법 · 받은 날 · 가진 사람 수가 아래 시트에 나온다.
 * 이 기기에서 처음 보는 것은 '새로' — 열자마자 들어온 것을 한 번 보여 준다(케이스에 넣기).
 * 목록 shared/cueCase · 판정 shared/cueCaseRules · 값 GET /api/hiq/cue-case. 비로그인은 빈 케이스 + 가입 안내.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useGuestGate } from "@/components/hiq/GuestGate";
import { LucideChevronLeft } from "@/lib/icons";
import { RealMedal } from "@/components/hiq/RealMedal";
import { ShelfPage } from "@/sim/rank/ShelfPage";
import { CASE_ITEMS, CHALKS, CUES, GLOVES, PEOPLE_STEPS, caseImage, caseItem, cueHow, type CaseItem, type CaseLocale, type CueGroup } from "@shared/cueCase";
import { CASE_SECTIONS, CUE_CASE_QUERY_KEY, fetchCueCase, readCaseSeen, saveHero, writeCaseSeen, type CaseItemView, type CaseSection, type CueCaseView } from "@/components/hiq/cueCase/cueCaseApi";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];
const asLocale = (l: string): CaseLocale => (LOCALES as readonly string[]).includes(l) ? (l as CaseLocale) : "en";
const EMPTY: CaseItemView = { done: false, at: null, got: null, bars: [], soon: false, holders: 0 };
const GROUP_KEY: Record<CueGroup, string> = { real: "case.group.real", online: "case.group.online", common: "case.group.common", both: "case.group.both", crew: "case.group.crew", stage2: "case.group.stage2" };
/** 크루 · 원정은 아직 열리지 않아 한 칸에 모은다 */
const TAB_GROUPS: readonly CueGroup[] = ["real", "online", "common", "both", "crew"];

export default function CueCasePage() {
    const { t, locale } = useT();
    const l = asLocale(locale);
    const [, setLocation] = useLocation();
    const search = useSearch();
    const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
    const memberId = params.get("m");
    const secParam = params.get("sec") as CaseSection | null;
    const sec: CaseSection = secParam && CASE_SECTIONS.includes(secParam) ? secParam : "cue";
    const { member, isGuest } = useAuth();
    const gate = useGuestGate("dark");
    const mineView = !memberId || memberId === member?.id;
    const qc = useQueryClient();
    const q = useQuery({ queryKey: [...CUE_CASE_QUERY_KEY, memberId ?? "me"], queryFn: () => fetchCueCase(memberId), enabled: !!member, staleTime: 20_000, retry: false });
    // 열면 받은 기록이 늘 수 있다 — 홈 입구 띠의 수를 다시 받게
    useEffect(() => { if (q.data?.member.mine) void qc.invalidateQueries({ queryKey: ["cue-case-summary"] }); }, [q.data, qc]);
    const d: CueCaseView | undefined = q.data;
    const items = d?.items ?? {};
    const it = (id: string) => items[id] ?? EMPTY;

    // '새로' — 이 화면을 연 때의 '마지막으로 본 때'. 내 케이스를 열면 지금까지 본 것으로 적는다(남의 것은 적지 않는다)
    const [seenAt] = useState(() => readCaseSeen());
    const fresh = useMemo(() => (d?.member.mine ? CASE_ITEMS.filter((x) => { const v = items[x.id]; return v?.done && v.got !== null && v.got > seenAt; }) : []), [d, items, seenAt]);
    const [reveal, setReveal] = useState<CaseItem[] | null>(null);
    const revealed = useRef(false);
    useEffect(() => {
        if (!d?.member.mine || revealed.current) return;
        revealed.current = true;
        // 처음 여는 사람(본 때가 없다)은 옛 기록으로 한꺼번에 들어온다 — 보여 주되 큐부터
        if (fresh.length > 0) setReveal([...fresh].sort((a, b) => kindOrder(a) - kindOrder(b)));
        const latest = Math.max(0, ...CASE_ITEMS.map((x) => items[x.id]?.got ?? 0));
        if (latest > 0) writeCaseSeen(latest);
    }, [d, fresh, items]);

    const [pick, setPick] = useState<CaseItem | null>(null);
    const [group, setGroup] = useState<CueGroup>("real");
    const setSec = (s: CaseSection) => {
        const p = new URLSearchParams(params);
        if (s === "cue") p.delete("sec"); else p.set("sec", s);
        const qs = p.toString();
        setLocation(qs ? `/cue-case?${qs}` : "/cue-case", { replace: true });
    };
    const back = () => (window.history.length > 1 ? window.history.back() : setLocation("/dashboard"));

    const owned = (list: readonly CaseItem[]) => list.filter((x) => it(x.id).done).length;
    const hero = d?.hero ? caseItem(d.hero) : null;
    const name = d?.member.name ?? "";
    const plate = d && !d.member.mine ? t("case.ownerTitle").replace("{name}", name) : t("case.mine");
    const month = Number((d?.month.key ?? "").slice(5)) || null;
    const monthGlove = month ? GLOVES.find((g) => g.rule.k === "glove" && g.rule.m === month) ?? null : null;

    return (
        <div className="cue-case sim-dark min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }} data-testid="cue-case">
            <div className="mx-auto w-full max-w-[440px] px-4">
                {/* 머리 — 뒤로 · 이름 */}
                <header className="flex h-14 items-center gap-1.5">
                    <button type="button" onClick={back} aria-label={t("common.back")} data-testid="cue-case-back" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--cc-ink)] active:bg-white/10">
                        <LucideChevronLeft weight="bold" className="h-5 w-5" aria-hidden />
                    </button>
                    <h1 className="flex-1 truncate text-[17px] font-semibold tracking-tight">{t("case.title")}</h1>
                </header>

                {/* 가죽 뚜껑 — 놋쇠 명판과 모은 수 */}
                <section className="cc-lid rounded-[26px] px-5 pb-5 pt-6" aria-label={plate}>
                    <div className="cc-plate mx-auto w-fit max-w-full rounded-md px-7 py-1.5 text-center">
                        <p className="truncate text-[14px] font-bold tracking-[0.02em]" data-testid="cue-case-plate">{plate}</p>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center" data-testid="cue-case-counts">
                        {([["cue", CUES], ["chalk", CHALKS], ["glove", GLOVES]] as const).map(([k, list]) => (
                            <div key={k}>
                                <dt className="text-[12px] font-semibold text-[color:var(--cc-gold)]/90">{t(`case.count.${k}`)}</dt>
                                <dd className="rk-num mt-0.5 text-[20px] font-bold leading-none text-white">{owned(list)}<span className="text-[13px] font-semibold text-white/45">/{list.length}</span></dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-3.5 text-center text-[12.5px] leading-relaxed text-white/60 break-keep">{t("case.sub")}</p>
                </section>

                {member && q.isPending && <p className="mt-6 text-center text-[13px] text-white/60" role="status">{t("case.loading")}</p>}
                {member && q.isError && (
                    <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3" data-testid="cue-case-failed">
                        <p className="text-[13px] text-white/80">{t("case.failed")}</p>
                        <button type="button" onClick={() => { void q.refetch(); }} className="h-10 shrink-0 rounded-full border border-white/20 px-4 text-[13px] font-semibold text-white/90">{t("sim.match.retry")}</button>
                    </div>
                )}

                {/* 대표 큐 · 이달 장갑 — 회원의 케이스가 열렸을 때만 */}
                {d && <HeroCue item={hero} view={hero ? it(hero.id) : null} l={l} onOpen={() => hero && setPick(hero)} />}
                {d && monthGlove && (
                    <MonthGlove glove={monthGlove} view={it(monthGlove.id)} cells={d.month.cells} need={d.month.need} month={month!} onOpen={() => setPick(monthGlove)} />
                )}
                {isGuest && (
                    <div className="mt-5 rounded-[22px] border border-[color:var(--cc-gold)]/30 bg-white/[0.04] px-4 py-4" data-testid="cue-case-guest">
                        <p className="text-[15px] font-semibold text-white">{t("case.guestTitle")}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-white/65 break-keep">{t("case.guestDesc")}</p>
                        <button type="button" onClick={() => gate.guard(() => undefined)} className="mt-3 h-11 rounded-full bg-[color:var(--cc-gold)] px-5 text-[14px] font-semibold text-[#2d1a08] active:opacity-90" data-testid="cue-case-join">{t("case.guestCta")}</button>
                    </div>
                )}

                {/* 칸 고르기 */}
                <nav className="mt-6 grid grid-cols-4 gap-1 rounded-full border border-[color:var(--cc-gold)]/20 bg-black/25 p-1" aria-label={t("case.title")}>
                    {CASE_SECTIONS.map((s) => (
                        <button key={s} type="button" aria-pressed={sec === s} onClick={() => setSec(s)} data-testid={`cue-case-sec-${s}`}
                            className="cc-tab h-10 truncate rounded-full px-1 text-[13px] font-semibold text-white/75">{t(`case.sec.${s}`)}</button>
                    ))}
                </nav>

                {sec === "cue" && (
                    <section className="mt-4" aria-label={t("case.sec.cue")}>
                        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t("case.sec.cue")}>
                            {TAB_GROUPS.map((g) => {
                                const list = CUES.filter((c) => c.group === g || (g === "crew" && c.group === "stage2"));
                                return (
                                    <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} data-testid={`cue-case-group-${g}`}
                                        className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold", group === g ? "border-[color:var(--cc-gold)] bg-[color:var(--cc-gold)]/15 text-[color:var(--cc-gold)]" : "border-white/12 text-white/70")}>
                                        {t(GROUP_KEY[g])} <span className="rk-num font-medium opacity-75">{owned(list)}/{list.length}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-white/55 break-keep">{t(`case.groupDesc.${group}`)}</p>
                        <ol className="mt-3 space-y-3.5" data-testid="cue-case-cues">
                            {CUES.filter((c) => c.group === group || (group === "crew" && c.group === "stage2")).map((c) => (
                                <CueRow key={c.id} item={c} view={it(c.id)} l={l} isNew={fresh.includes(c)} onOpen={() => setPick(c)} />
                            ))}
                        </ol>
                    </section>
                )}

                {sec === "chalk" && (
                    <section className="mt-4" aria-label={t("case.sec.chalk")}>
                        <p className="px-1 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("case.chalkDesc")}</p>
                        {d && (
                            <p className="mt-2 px-1 text-[13.5px] font-semibold text-white" data-testid="cue-case-people">
                                {t("case.people").replace("{n}", String(d.people))}
                                {(() => { const next = PEOPLE_STEPS.find((s) => s > d.people); return next ? <span className="ml-2 font-medium text-[color:var(--cc-gold)]">{t("case.peopleNext").replace("{n}", String(next - d.people))}</span> : null; })()}
                            </p>
                        )}
                        <TileGrid list={CHALKS} it={it} l={l} fresh={fresh} onOpen={setPick} />
                    </section>
                )}

                {sec === "glove" && (
                    <section className="mt-4" aria-label={t("case.sec.glove")}>
                        <p className="px-1 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("case.gloveDesc")}</p>
                        <TileGrid list={GLOVES} it={it} l={l} fresh={fresh} onOpen={setPick} current={monthGlove?.id ?? null} />
                    </section>
                )}

                {sec === "medals" && (
                    <section className="mt-4" aria-label={t("case.sec.medals")} data-testid="cue-case-medals">
                        <h2 className="px-1 text-[13px] font-semibold text-[color:var(--cc-gold)]">{t("case.medalsReal")}</h2>
                        {d && (d.handi["3c"] || d.handi["4c"]) ? (
                            <div className="mt-2 flex gap-3 rounded-[20px] bg-black/25 px-4 py-3">
                                {(["3c", "4c"] as const).filter((g) => d.handi[g]).map((g) => (
                                    <div key={g} className="flex items-center gap-2.5">
                                        <RealMedal game={g} handi={d.handi[g]} size={60} />
                                        <span className="text-[13px] font-semibold text-white/85">{t(g === "3c" ? "real.tab3c" : "real.tab4c")}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 rounded-[20px] bg-black/25 px-4 py-3 text-[13px] leading-relaxed text-white/65 break-keep">{t("case.medalsRealNone")}</p>
                        )}
                        <h2 className="mt-5 px-1 text-[13px] font-semibold text-[color:var(--cc-gold)]">{t("case.medalsOnline")}</h2>
                        {d?.online || (d?.member.mine && member) ? (
                            <div className="rank-hall -mx-1 mt-2">
                                <ShelfPage embedded memberId={memberId} onClose={back}
                                    onRank={() => setLocation("/online-game?rank=1")} onPlay={() => setLocation("/online-game?rooms=1")} onCup={() => setLocation("/online-game?cup=1")} />
                            </div>
                        ) : (
                            <p className="mt-2 rounded-[20px] bg-black/25 px-4 py-3 text-[13px] leading-relaxed text-white/65 break-keep">{t("case.medalsOnlineNone")}</p>
                        )}
                    </section>
                )}
            </div>

            {pick && <ItemSheet item={pick} view={it(pick.id)} l={l} mine={!!d?.member.mine && mineView} hero={d?.hero ?? null} onClose={() => setPick(null)} />}
            {reveal && reveal.length > 0 && <RevealSheet list={reveal} l={l} onClose={() => setReveal(null)} />}
            {gate.sheet}
        </div>
    );
}

/** 달 이름 — 한국어 '10월', 영어 'October' … */
const monthName = (m: number, locale: string) => {
    try { return new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, m - 1, 15))); } catch { return String(m); }
};
const kindOrder = (x: CaseItem) => ({ cue: 0, chalk: 1, glove: 2, pennant: 3 })[x.kind];
const fmtDate = (ms: number, locale: string) => {
    try { return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); }
};

function itemName(x: CaseItem, v: CaseItemView, l: CaseLocale, t: (k: string) => string): string {
    return x.hidden && !v.done ? t("case.hidden") : x.name[l];
}

/** 대표 큐 — 받은 큐 가운데 하나를 크게(상감을 천천히 훑는다). 없으면 빈 벨벳과 첫 큐 안내 */
function HeroCue({ item, view, l, onOpen }: { item: CaseItem | null; view: CaseItemView | null; l: CaseLocale; onOpen: () => void }) {
    const { t } = useT();
    const box = useRef<HTMLButtonElement | null>(null);
    const [w, setW] = useState(328);
    useLayoutEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => setW(el.clientWidth));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <section className="mt-5" aria-label={t("case.hero")}>
            <div className="flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-semibold text-[color:var(--cc-gold)]">{t("case.hero")}</h2>
                {item && view && <span className="rk-num text-[12px] text-white/50">{view.holders > 0 ? t("case.holders").replace("{n}", String(view.holders)) : ""}</span>}
            </div>
            <button ref={box} type="button" onClick={onOpen} disabled={!item} className="cc-loupe mt-2 block w-full text-left active:opacity-90" style={{ ["--cc-loupe-w" as string]: `${w}px` }} data-testid="cue-case-hero" aria-label={item ? item.name[l] : t("case.heroEmpty")}>
                {item ? <img src={caseImage(item)} alt="" decoding="async" draggable={false} /> : null}
            </button>
            {item ? (
                <p className="mt-2 px-1 text-[15px] font-semibold text-white">{item.name[l]} <span className="ml-1 text-[12.5px] font-medium text-white/55">{t(GROUP_KEY[item.group ?? "real"])}</span></p>
            ) : (
                <div className="mt-2 px-1">
                    <p className="text-[15px] font-semibold text-white">{t("case.heroEmpty")}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("case.heroEmptyDesc")}</p>
                </div>
            )}
        </section>
    );
}

/** 이달 장갑 — 12칸(실전 1판 = 3칸 · 온라인 1판 = 1칸) */
function MonthGlove({ glove, view, cells, need, month, onOpen }: { glove: CaseItem; view: CaseItemView; cells: number; need: number; month: number; onOpen: () => void }) {
    const { t, locale } = useT();
    const filled = view.done ? need : Math.min(cells, need);
    return (
        <button type="button" onClick={onOpen} className="mt-4 flex w-full items-center gap-3 rounded-[20px] bg-black/25 px-3.5 py-3 text-left active:bg-black/35" data-testid="cue-case-month">
            <span className="cc-tile relative h-[60px] w-[60px] shrink-0">
                <img src={caseImage(glove)} alt="" decoding="async" className={view.done ? "cc-own" : "cc-ghost"} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-white">{t("case.monthGlove").replace("{m}", monthName(month, locale))}</span>
                    <span className="rk-num shrink-0 text-[12.5px] font-semibold text-[color:var(--cc-gold)]">{view.done ? t("case.monthDone") : t("case.monthCells").replace("{n}", String(filled)).replace("{m}", String(need))}</span>
                </span>
                <span className="mt-2 grid grid-cols-12 gap-[3px]" aria-hidden>
                    {Array.from({ length: need }, (_, i) => (
                        <i key={i} className="h-[9px] rounded-[3px]" style={i < filled ? { background: "linear-gradient(180deg,#f2d595,#c99a4b)", boxShadow: "0 0 6px rgba(232,196,106,0.35)" } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)" }} />
                    ))}
                </span>
                <span className="mt-1.5 block text-[12px] text-white/50">{t("case.monthHint")}</span>
            </span>
        </button>
    );
}

function Bars({ bars }: { bars: CaseItemView["bars"] }) {
    const { t } = useT();
    if (bars.length === 0) return null;
    return (
        <span className={cn("mt-1.5 grid gap-1.5", bars.length > 1 && "grid-cols-2")}>
            {bars.map((b, i) => (
                <span key={`${b.side}-${i}`} className="block min-w-0">
                    <span className="flex items-baseline justify-between gap-1 text-[12px] text-white/55">
                        <span className="truncate">{b.side === "all" ? "" : t(`case.side.${b.side}`)}</span>
                        <span className="rk-num shrink-0">{b.have}/{b.need}</span>
                    </span>
                    <span className={cn("cc-bar mt-0.5 block", b.side === "online" && "cc-online")}><i style={{ width: `${Math.round((b.have / b.need) * 100)}%` }} /></span>
                </span>
            ))}
        </span>
    );
}

/** 큐 한 줄 — 벨벳에 판 자리 + 이름 · 받는 법 · 차오르는 막대 */
function CueRow({ item, view, l, isNew, onOpen }: { item: CaseItem; view: CaseItemView; l: CaseLocale; isNew: boolean; onOpen: () => void }) {
    const { t, locale } = useT();
    return (
        <li data-item={item.id} data-done={view.done ? "1" : "0"}>
            <button type="button" onClick={onOpen} className="block w-full text-left active:opacity-85" aria-label={itemName(item, view, l, t)}>
                <span className="cc-slot block">
                    <img src={caseImage(item)} alt="" loading="lazy" decoding="async" draggable={false} className={cn(view.done ? "cc-own" : item.hidden ? "cc-secret" : "cc-ghost", view.soon && "cc-soon", isNew && "cc-in")} />
                </span>
                <span className="mt-1.5 flex items-baseline gap-2 px-1">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
                        {itemName(item, view, l, t)}
                        {item.online && <span className="ml-1.5 align-[1px] text-[11.5px] font-semibold text-[#46e4e0]">{t("case.onlineMark")}</span>}
                        {isNew && <span className="ml-1.5 rounded-full bg-[color:var(--cc-gold)] px-1.5 py-[1px] align-[1px] text-[11.5px] font-bold text-[#2d1a08]">{t("case.new")}</span>}
                    </span>
                    <span className="rk-num shrink-0 text-[12px] text-white/50">
                        {view.done && view.at ? fmtDate(view.at, locale) : view.soon ? t("case.soon") : ""}
                    </span>
                </span>
                {!view.done && <span className="mt-0.5 block px-1 text-[12.5px] leading-snug text-white/55 break-keep">{cueHow(item, l)}</span>}
                {!view.done && !view.soon && <span className="block px-1"><Bars bars={view.bars} /></span>}
            </button>
        </li>
    );
}

/** 초크 · 장갑 — 네모 자리 넷씩 */
function TileGrid({ list, it, l, fresh, onOpen, current = null }: { list: readonly CaseItem[]; it: (id: string) => CaseItemView; l: CaseLocale; fresh: readonly CaseItem[]; onOpen: (x: CaseItem) => void; current?: string | null }) {
    const { t } = useT();
    return (
        <ol className="mt-3 grid grid-cols-4 gap-x-2.5 gap-y-3.5" data-testid="cue-case-tiles">
            {list.map((x) => {
                const v = it(x.id);
                return (
                    <li key={x.id} data-item={x.id} data-done={v.done ? "1" : "0"}>
                        <button type="button" onClick={() => onOpen(x)} className="block w-full text-center active:opacity-85" aria-label={itemName(x, v, l, t)}>
                            <span className={cn("cc-tile block", current === x.id && "ring-1 ring-[color:var(--cc-gold)]/70")}>
                                <img src={caseImage(x)} alt="" loading="lazy" decoding="async" draggable={false} className={cn(v.done ? "cc-own" : "cc-ghost", v.soon && "cc-soon")} />
                                {fresh.includes(x) && <span className="absolute right-1 top-1 rounded-full bg-[color:var(--cc-gold)] px-1.5 text-[11px] font-bold text-[#2d1a08]">{t("case.new")}</span>}
                            </span>
                            <span className={cn("mt-1.5 line-clamp-2 block text-[12px] font-semibold leading-tight break-keep", v.done ? "text-white" : "text-white/55")}>{itemName(x, v, l, t)}</span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

function Sheet({ label, onClose, children, testId, closeLabel }: { label: string; onClose: () => void; children: ReactNode; testId: string; closeLabel?: string }) {
    const { t } = useT();
    useBackToClose(true, onClose);
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose} data-testid={`${testId}-backdrop`}>
            <div role="dialog" aria-modal="true" aria-label={label} data-testid={testId} onClick={(e) => e.stopPropagation()}
                className="cue-case w-full max-w-[440px] rounded-t-[26px] px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)]">
                <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/20" aria-hidden />
                {children}
                <button type="button" onClick={onClose} data-testid={`${testId}-close`} className="mt-4 h-12 w-full rounded-full border border-white/15 text-[14px] font-semibold text-white/85 active:bg-white/10">{closeLabel ?? t("sim.common.close")}</button>
            </div>
        </div>
    );
}

/** 하나를 눌렀을 때 — 큰 그림 · 받는 법 · 받은 날 · 가진 사람 · 대표 큐로 */
function ItemSheet({ item, view, l, mine, hero, onClose }: { item: CaseItem; view: CaseItemView; l: CaseLocale; mine: boolean; hero: string | null; onClose: () => void }) {
    const { t, locale } = useT();
    const qc = useQueryClient();
    const pickHero = useMutation({
        mutationFn: () => saveHero(item.id),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); onClose(); },
    });
    const kindLabel = item.kind === "cue" ? t(GROUP_KEY[item.group ?? "real"]) : t(`case.count.${item.kind}`);
    return (
        <Sheet label={itemName(item, view, l, t)} onClose={onClose} testId="cue-case-sheet">
            {item.kind === "cue" ? (
                <span className="cc-slot block !h-[52px] !rounded-[26px]"><img src={caseImage(item)} alt="" className={view.done ? "cc-own" : item.hidden ? "cc-secret" : "cc-ghost"} /></span>
            ) : (
                <span className="cc-tile mx-auto block w-[132px]"><img src={caseImage(item)} alt="" className={view.done ? "cc-own" : "cc-ghost"} /></span>
            )}
            <p className="mt-4 text-[12.5px] font-semibold text-[color:var(--cc-gold)]">{kindLabel}{item.online ? ` · ${t("case.onlineMark")}` : ""}</p>
            <h2 className="mt-0.5 text-[20px] font-bold tracking-tight text-white">{itemName(item, view, l, t)}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/75 break-keep" data-testid="cue-case-how">{cueHow(item, l, view.done)}</p>
            {view.done && view.at ? (
                <p className="rk-num mt-3 text-[13px] text-white/60">{t("case.got").replace("{date}", fmtDate(view.at, locale))}{view.holders > 0 ? ` · ${view.holders === 1 ? t("case.holdersOnly") : t("case.holders").replace("{n}", String(view.holders))}` : ""}</p>
            ) : view.soon ? (
                <p className="mt-3 text-[13px] text-white/60">{t("case.soonDesc")}</p>
            ) : (
                <div className="mt-2"><Bars bars={view.bars} /></div>
            )}
            {mine && item.kind === "cue" && view.done && (
                hero === item.id
                    ? <p className="mt-4 text-center text-[13px] font-semibold text-[color:var(--cc-gold)]">{t("case.heroPicked")}</p>
                    : <button type="button" onClick={() => pickHero.mutate()} disabled={pickHero.isPending} data-testid="cue-case-pick-hero"
                        className="mt-4 h-12 w-full rounded-full bg-[color:var(--cc-gold)] text-[14px] font-semibold text-[#2d1a08] active:opacity-90 disabled:opacity-60">{t("case.heroPick")}</button>
            )}
        </Sheet>
    );
}

/** 열자마자 — 새로 들어온 것. 큐는 자리로 미끄러져 들어간다 */
function RevealSheet({ list, l, onClose }: { list: readonly CaseItem[]; l: CaseLocale; onClose: () => void }) {
    const { t } = useT();
    const shown = list.slice(0, 6);
    return (
        <Sheet label={t("case.newTitle")} onClose={onClose} testId="cue-case-reveal" closeLabel={t("case.newPut")}>
            <p className="text-[12.5px] font-semibold text-[color:var(--cc-gold)]">{t("case.newCount").replace("{n}", String(list.length))}</p>
            <h2 className="mt-0.5 text-[20px] font-bold tracking-tight text-white">{t("case.newTitle")}</h2>
            <ul className="mt-4 space-y-3">
                {shown.map((x, i) => (
                    <li key={x.id} className="flex items-center gap-3" style={{ animationDelay: `${i * 90}ms` }}>
                        {x.kind === "cue"
                            ? <span className="cc-slot block min-w-0 flex-1"><img src={caseImage(x)} alt="" className="cc-own cc-in" style={{ animationDelay: `${i * 110}ms` }} /></span>
                            : <span className="cc-tile block h-12 w-12 shrink-0"><img src={caseImage(x)} alt="" className="cc-own" /></span>}
                        <span className={cn("text-[13.5px] font-semibold text-white", x.kind === "cue" ? "w-[38%] shrink-0 truncate" : "min-w-0 flex-1 truncate")}>{x.name[l]}</span>
                    </li>
                ))}
            </ul>
            {list.length > shown.length && <p className="mt-3 text-[12.5px] text-white/55">{t("case.newMore").replace("{n}", String(list.length - shown.length))}</p>}
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/55 break-keep">{t("case.newHint")}</p>
        </Sheet>
    );
}

