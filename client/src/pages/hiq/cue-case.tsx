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
import { LucideChevronLeft, LucideLock } from "@/lib/icons";
import { RealMedal } from "@/components/hiq/RealMedal";
import { CoachTour } from "@/components/hiq/CoachTour";
import { ShelfPage } from "@/sim/rank/ShelfPage";
import { useToast } from "@/hooks/use-toast";
import { shareBlob } from "@/sim/share/useShare";
import { canvasToBlob } from "@/sim/share/shareCard";
import { renderCaseCard } from "@/components/hiq/cueCase/caseCard";
import { InvitePanel } from "@/components/hiq/invite/InvitePanel";
import { CASE_ITEMS, CHALKS, CUES, GLOVES, PEOPLE_STEPS, caseImage, caseItem, cueHow, difficulty, type CaseItem, type CaseKind, type CaseLocale, type CueGroup } from "@shared/cueCase";
import { serialText } from "@/components/hiq/cueCase/cueCaseApi";
import { CASE_SECTIONS, CASE_SUMMARY_KEY, CUE_CASE_QUERY_KEY, fetchCueCase, readCaseSeen, saveHero, writeCaseSeen, type CaseItemView, type CaseSection, type CueCaseView } from "@/components/hiq/cueCase/cueCaseApi";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];
const asLocale = (l: string): CaseLocale => (LOCALES as readonly string[]).includes(l) ? (l as CaseLocale) : "en";
const EMPTY: CaseItemView = { done: false, at: null, got: null, bars: [], soon: false, holders: 0, serial: null };
const GROUP_KEY: Record<CueGroup, string> = { real: "case.group.real", online: "case.group.online", common: "case.group.common", both: "case.group.both", crew: "case.group.crew", stage2: "case.group.stage2", limited: "case.group.limited" };
/** 크루 · 원정은 아직 열리지 않아 한 칸에 모은다 */
const TAB_GROUPS: readonly CueGroup[] = ["limited", "real", "online", "common", "both", "crew"];

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
    useEffect(() => { if (q.data?.member.mine) void qc.invalidateQueries({ queryKey: CASE_SUMMARY_KEY }); }, [q.data, qc]);
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
    // 큐 케이스 안내(전체)를 이미 본 사람 — 친구 초대 칸 안내는 그런 사람에게만 따로(처음 여는 사람은 전체 안내에 들어 있다)
    const [tourSeen] = useState(() => {
        try {
            const seen = localStorage.getItem("rankue_tour_cue-case") !== null;
            // 처음 여는 사람은 전체 안내에서 친구 초대 칸을 본다 — 따로 한 번 더 띄우지 않게 적어 둔다
            if (!seen) localStorage.setItem("rankue_tour_cue-case-invite", "1");
            return seen;
        } catch { return false; }
    });
    const [group, setGroup] = useState<CueGroup>("real");
    const setSec = (s: CaseSection) => {
        const p = new URLSearchParams(params);
        if (s === "cue") p.delete("sec"); else p.set("sec", s);
        const qs = p.toString();
        setLocation(qs ? `/cue-case?${qs}` : "/cue-case", { replace: true });
    };
    const back = () => (window.history.length > 1 ? window.history.back() : setLocation("/dashboard"));

    // 카드로 공유(2026-10-16) — 가죽 뚜껑 · 명판 · 받은 큐(대표 큐가 맨 위)를 그림 한 장으로. 샷 카드와 같은 길로 내보낸다
    const { toast } = useToast();
    const [sharing, setSharing] = useState(false);
    const shareCard = async () => {
        if (!d || sharing) return;
        setSharing(true);
        try {
            const owned = CUES.filter((x) => it(x.id).done).sort((a, b) => (a.id === d.hero ? -1 : b.id === d.hero ? 1 : (it(b.id).at ?? 0) - (it(a.id).at ?? 0)));
            const canvas = await renderCaseCard({
                plate: t("case.ownerTitle").replace("{name}", d.member.name),
                counts: ([["cue", CUES], ["chalk", CHALKS], ["glove", GLOVES]] as const).map(([k, list]) => [t(`case.count.${k}`), `${list.filter((x) => it(x.id).done).length}/${list.length}`] as const),
                cues: owned, cueName: (x) => { const sn = it(x.id).serial; return sn ? `${x.name[l]} · ${serialText(sn)}` : x.name[l]; }, more: (n) => t("case.newMore").replace("{n}", String(n)),
                footer: t("case.cardFooter"), url: "rankue.co.kr/cue-case",
            });
            const blob = await canvasToBlob(canvas);
            if (!blob) throw new Error("blob");
            const url = "https://www.rankue.co.kr/cue-case";
            const out = await shareBlob(blob, { title: t("case.ownerTitle").replace("{name}", d.member.name), text: `${t("case.shareText").replace("{n}", String(owned.length))}\n${url}`, filename: `rankue-cue-case-${new Date().toISOString().slice(0, 10)}.png`, url, copied: false });
            if (!out.ok) toast({ title: t("case.shareFail"), variant: "destructive" });
        } catch {
            toast({ title: t("case.shareFail"), variant: "destructive" });
        } finally {
            setSharing(false);
        }
    };

    const owned = (list: readonly CaseItem[]) => list.filter((x) => it(x.id).done).length;
    const hero = d?.hero ? caseItem(d.hero) : null;
    const name = d?.member.name ?? "";
    // 이름을 못 받았으면 "님의 큐 케이스"로 비지 않게 — 내 것으로 적는다(2026-10-17 리뷰)
    const plate = d && !d.member.mine && name.trim() ? t("case.ownerTitle").replace("{name}", name) : t("case.mine");
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
                    <img src="/billiards/case/icon-case.webp" width={30} height={30} alt="" aria-hidden="true" decoding="async" draggable={false} className="h-[30px] w-[30px] shrink-0 object-contain" />
                    <h1 className="flex-1 truncate text-[17px] font-semibold tracking-tight">{t("case.title")}</h1>
                    {d?.member.mine && (
                        <button type="button" onClick={() => { void shareCard(); }} disabled={sharing} data-testid="cue-case-share" data-tour="cc-share" data-track-as="큐 케이스 카드 공유"
                            className="h-9 shrink-0 rounded-full border border-[color:var(--cc-gold)]/40 px-3.5 text-[13px] font-semibold text-[color:var(--cc-gold)] active:bg-white/10 disabled:opacity-60">
                            {t("case.share")}
                        </button>
                    )}
                </header>

                {/* 가죽 뚜껑 — 놋쇠 명판과 모은 수 */}
                <section className="cc-lid rounded-[26px] px-5 pb-5 pt-6" aria-label={plate} data-tour="cc-plate">
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
                {/* 친구 초대 — 내 케이스에만(2026-10-16) */}
                {d?.member.mine && <InvitePanel view={d} l={l} onReveal={(list) => setReveal(list)} focus={params.get("invite") === "1"} />}
                {isGuest && (
                    <div className="mt-5 rounded-[22px] border border-[color:var(--cc-gold)]/30 bg-white/[0.04] px-4 py-4" data-testid="cue-case-guest">
                        <p className="text-[15px] font-semibold text-white">{t("case.guestTitle")}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-white/65 break-keep">{t("case.guestDesc")}</p>
                        <button type="button" onClick={() => gate.guard(() => undefined)} className="mt-3 h-11 rounded-full bg-[color:var(--cc-gold)] px-5 text-[14px] font-semibold text-[#2d1a08] active:opacity-90" data-testid="cue-case-join">{t("case.guestCta")}</button>
                    </div>
                )}

                {/* 칸 고르기 */}
                <nav className="mt-6 grid grid-cols-4 gap-1 rounded-full border border-[color:var(--cc-gold)]/20 bg-black/25 p-1" aria-label={t("case.title")} data-tour="cc-secs">
                    {CASE_SECTIONS.map((s) => (
                        <button key={s} type="button" aria-pressed={sec === s} onClick={() => setSec(s)} data-testid={`cue-case-sec-${s}`}
                            className="cc-tab h-10 truncate rounded-full px-1 text-[13px] font-semibold text-white/75">{t(`case.sec.${s}`)}</button>
                    ))}
                </nav>

                {sec === "cue" && (
                    <section className="mt-4" aria-label={t("case.sec.cue")}>
                        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t("case.sec.cue")} data-tour="cc-groups">
                            {TAB_GROUPS.map((g) => {
                                const list = CUES.filter((c) => c.group === g || (g === "crew" && c.group === "stage2"));
                                return (
                                    <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} data-testid={`cue-case-group-${g}`}
                                        className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold", g === "limited" && group !== g && "border-[color:var(--cc-gold)]/45 text-[color:var(--cc-gold)]", group === g ? (g === "limited" ? "cc-tab-limited" : "border-[color:var(--cc-gold)] bg-[color:var(--cc-gold)]/15 text-[color:var(--cc-gold)]") : g !== "limited" && "border-white/12 text-white/70")}>
                                        {t(GROUP_KEY[g])} <span className="rk-num font-medium opacity-75">{owned(list)}/{list.length}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-white/55 break-keep">{t(`case.groupDesc.${group}`)}</p>
                        {(() => {
                            // 칸마다 '모은 큐'를 위에, '아직'을 아래에(2026-10-16 오너가 고른 A + C) — 같은 묶음 안에서는 조건 순서 그대로
                            const list = CUES.filter((c) => c.group === group || (group === "crew" && c.group === "stage2"));
                            const got = list.filter((c) => it(c.id).done), yet = list.filter((c) => !it(c.id).done);
                            return (
                                <div className="mt-3" data-testid="cue-case-cues">
                                    {got.length > 0 && <p className="mb-2 px-1 text-[12px] font-bold tracking-[0.04em] text-[color:var(--cc-gold)]" data-testid="cue-case-owned-head">{t("case.ownedSec").replace("{n}", String(got.length))}</p>}
                                    <ol className="space-y-3.5">
                                        {got.map((c, i) => <CueRow key={c.id} item={c} view={it(c.id)} l={l} isNew={fresh.includes(c)} onOpen={() => setPick(c)} tour={i === 0 ? "cc-row" : undefined} />)}
                                    </ol>
                                    {got.length > 0 && yet.length > 0 && <i className="my-4 block h-px bg-[color:var(--cc-gold)]/18" aria-hidden />}
                                    {yet.length > 0 && <p className="mb-2 px-1 text-[12px] font-bold tracking-[0.04em] text-white/55" data-testid="cue-case-locked-head">{t("case.lockedSec").replace("{n}", String(yet.length))}</p>}
                                    <ol className="space-y-3.5">
                                        {yet.map((c, i) => <CueRow key={c.id} item={c} view={it(c.id)} l={l} isNew={false} onOpen={() => setPick(c)} tour={got.length === 0 && i === 0 ? "cc-row" : undefined} />)}
                                    </ol>
                                </div>
                            );
                        })()}
                    </section>
                )}

                {sec === "chalk" && (
                    <section className="mt-4" aria-label={t("case.sec.chalk")}>
                        <p className="px-1 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("case.chalkDesc")}</p>
                        {d && (
                            <p className="mt-2 px-1 text-[13.5px] font-semibold text-white" data-testid="cue-case-people" data-tour="cc-people">
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
                            <div className="mt-2 flex gap-3 rounded-[20px] bg-black/25 px-4 py-3" data-tour="cc-real-medal">
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
                            <div className="rank-hall -mx-1 mt-2" data-tour="cc-online-shelf">
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
            {/* 코치마크(2026-10-16 오너: "큐케이스도 코치마크에 추가해줘 · 큐케이스 세부도") — 내 케이스에서만. 새로 들어온 것 창이 떠 있으면 기다린다(대화창이 있으면 멈추는 규칙).
                처음 열 때 전체 한 번, 초크 · 장갑 · 메달 칸은 처음 열 때 그 칸만 */}
            {d?.member.mine && sec === "cue" && <CoachTour id="cue-case" tone="billiards" when={!reveal} steps={[
                { target: "cc-plate", title: t("tour.cc.plateTitle"), body: t("tour.cc.plateBody") },
                { target: "cc-hero", title: t("tour.cc.heroTitle"), body: t("tour.cc.heroBody") },
                { target: "cc-month", title: t("tour.cc.monthTitle"), body: t("tour.cc.monthBody") },
                { target: "cc-secs", title: t("tour.cc.secsTitle"), body: t("tour.cc.secsBody") },
                { target: "cc-groups", title: t("tour.cc.groupsTitle"), body: t("tour.cc.groupsBody") },
                { target: "cc-row", title: t("tour.cc.rowTitle"), body: t("tour.cc.rowBody") },
                { target: "cc-invite", title: t("tour.cc.inviteTitle"), body: t("tour.cc.inviteBody") },
                { target: "cc-share", title: t("tour.cc.shareTitle"), body: t("tour.cc.shareBody") },
            ]} />}
            {/* 친구 초대 칸(2026-10-16) — 큐 케이스 안내를 이미 본 사람에게 한 번 더, 이 칸만 */}
            {d?.member.mine && sec === "cue" && tourSeen && <CoachTour id="cue-case-invite" tone="billiards" when={!reveal} delay={600} steps={[
                { target: "cc-invite", title: t("tour.cc.inviteTitle"), body: t("tour.cc.inviteBody") },
                { target: "cc-invite-share", title: t("tour.cc.inviteShareTitle"), body: t("tour.cc.inviteShareBody") },
            ]} />}
            {d?.member.mine && sec === "chalk" && <CoachTour id="cue-case-chalk" tone="billiards" delay={500} steps={[
                { target: "cc-people", title: t("tour.cc.peopleTitle"), body: t("tour.cc.peopleBody") },
                { target: "cc-tiles", title: t("tour.cc.chalkTitle"), body: t("tour.cc.chalkBody") },
            ]} />}
            {d?.member.mine && sec === "glove" && <CoachTour id="cue-case-glove" tone="billiards" delay={500} steps={[
                { target: "cc-tiles", title: t("tour.cc.gloveTitle"), body: t("tour.cc.gloveBody") },
            ]} />}
            {d?.member.mine && sec === "medals" && <CoachTour id="cue-case-medals" tone="billiards" delay={700} steps={[
                { target: "cc-real-medal", title: t("tour.cc.realMedalTitle"), body: t("tour.cc.realMedalBody") },
                { target: "cc-online-shelf", title: t("tour.cc.onlineShelfTitle"), body: t("tour.cc.onlineShelfBody") },
            ]} />}
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

/** 난이도 별 — 채운 별은 금빛, 나머지는 흐리게. 읽어 주는 이름은 "난이도 3/5" */
function StarRow({ n, size = 12, className }: { n: number; size?: number; className?: string }) {
    const { t } = useT();
    return (
        <span className={cn("inline-flex shrink-0 items-center gap-[1px] align-[1px]", className)} role="img" aria-label={`${t("case.difficulty")} ${n}/5`} data-testid="case-stars" data-stars={n}>
            {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.3 1.3-6.5L2.5 9.4l6.6-.8z" fill={i <= n ? "#e8c46a" : "rgba(255,255,255,0.16)"} />
                </svg>
            ))}
        </span>
    );
}

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
        <section className="mt-5" aria-label={t("case.hero")} data-tour="cc-hero">
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
        <button type="button" onClick={onOpen} className="mt-4 flex w-full items-center gap-3 rounded-[20px] bg-black/25 px-3.5 py-3 text-left active:bg-black/35" data-testid="cue-case-month" data-tour="cc-month">
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
function CueRow({ item, view, l, isNew, onOpen, tour }: { item: CaseItem; view: CaseItemView; l: CaseLocale; isNew: boolean; onOpen: () => void; tour?: string }) {
    const { t, locale } = useT();
    return (
        <li data-item={item.id} data-done={view.done ? "1" : "0"} data-tour={tour}>
            <button type="button" onClick={onOpen} className="block w-full text-left active:opacity-85" aria-label={itemName(item, view, l, t)}>
                <span className={cn("cc-slot block", view.done ? "cc-lit" : "cc-empty")}>
                    <img src={caseImage(item)} alt="" loading="lazy" decoding="async" draggable={false} className={cn(view.done ? "cc-own" : item.hidden ? "cc-secret" : "cc-ghost", view.soon && "cc-soon", isNew && "cc-in")} />
                    {!view.done && <LockMark small />}
                </span>
                <span className="mt-1.5 flex items-baseline gap-2 px-1">
                    <span className={cn("min-w-0 flex-1 truncate text-[14px] font-semibold", view.done ? "text-white" : "text-white/60")}>
                        {itemName(item, view, l, t)}
                        <StarRow n={difficulty(item)} size={11} className="ml-1.5" />
                        {item.online && <span className="ml-1.5 align-[1px] text-[11.5px] font-semibold text-[#46e4e0]">{t("case.onlineMark")}</span>}
                        {isNew && <span className="ml-1.5 rounded-full bg-[color:var(--cc-gold)] px-1.5 py-[1px] align-[1px] text-[11.5px] font-bold text-[#2d1a08]">{t("case.new")}</span>}
                    </span>
                    <span className="rk-num flex shrink-0 items-center gap-1.5 text-[12px] text-white/50">
                        {view.done && view.serial ? <span className="cc-serial cc-serial-sm" data-testid="cue-case-row-serial">{serialText(view.serial)}{item.limit ? <span className="ml-0.5 font-semibold opacity-70">/{item.limit}</span> : null}</span>
                            : view.done && view.at ? fmtDate(view.at, locale)
                                : view.soon ? t("case.soon")
                                    : item.limit ? <span className={cn("font-semibold", view.holders >= item.limit ? "text-white/45" : "text-[color:var(--cc-gold)]")} data-testid="cue-case-row-left">{view.holders >= item.limit ? t("case.soldOut") : t("case.limitedLeft").replace("{n}", String(item.limit - view.holders)).replace("{m}", String(item.limit))}</span>
                                        : view.holders > 0 ? t("case.rowHolders").replace("{n}", String(view.holders)) : ""}
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
        <ol className="mt-3 grid grid-cols-4 gap-x-2.5 gap-y-3.5" data-testid="cue-case-tiles" data-tour="cc-tiles">
            {list.map((x) => {
                const v = it(x.id);
                return (
                    <li key={x.id} data-item={x.id} data-done={v.done ? "1" : "0"}>
                        <button type="button" onClick={() => onOpen(x)} className="block w-full text-center active:opacity-85" aria-label={itemName(x, v, l, t)}>
                            <span className={cn("cc-tile block", v.done ? "cc-lit" : "cc-empty", current === x.id && "ring-1 ring-[color:var(--cc-gold)]/70")}>
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
        onSuccess: () => { void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); void qc.invalidateQueries({ queryKey: CASE_SUMMARY_KEY }); onClose(); },
    });
    const kindLabel = item.kind === "cue" ? t(GROUP_KEY[item.group ?? "real"]) : t(`case.count.${item.kind}`);
    return (
        <Sheet label={itemName(item, view, l, t)} onClose={onClose} testId="cue-case-sheet">
            {/* 잠겨 있어도 누르면 원래 무늬 그대로 보여 준다(2026-10-16 오너: "해금이 안 됐더라도 클릭하면 어떤 큐인지 보이게") — 숨은 큐만 모양으로 */}
            {item.kind === "cue" ? (
                <span className="cc-slot relative block !h-[52px] !rounded-[26px]">
                    <img src={caseImage(item)} alt="" className={view.done || !item.hidden ? "cc-own" : "cc-secret"} />
                    {!view.done && <LockMark />}
                </span>
            ) : (
                <span className="cc-tile relative mx-auto block w-[132px]">
                    <img src={caseImage(item)} alt="" className={view.done || !item.hidden ? "cc-own" : "cc-secret"} />
                    {!view.done && <LockMark />}
                </span>
            )}
            <p className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-[color:var(--cc-gold)]">
                <span>{kindLabel}{item.online ? ` · ${t("case.onlineMark")}` : ""}</span>
            </p>
            <h2 className="mt-0.5 text-[20px] font-bold tracking-tight text-white">{itemName(item, view, l, t)}</h2>
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-white/60" data-testid="cue-case-difficulty">
                <span>{t("case.difficulty")}</span><StarRow n={difficulty(item)} size={16} />
            </p>
            {!view.soon && <OwnerPlate view={view} limit={item.limit} kind={item.kind} />}
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/75 break-keep" data-testid="cue-case-how">{cueHow(item, l, view.done)}</p>
            {view.done && view.at ? (
                <p className="rk-num mt-3 text-[13px] text-white/60">{t("case.got").replace("{date}", fmtDate(view.at, locale))}</p>
            ) : view.soon ? (
                <p className="mt-3 text-[13px] text-white/60">{t("case.soonDesc")}</p>
            ) : (
                <div className="mt-2">
                    <p className="text-[13px] font-semibold text-white/70">{t("case.locked")}</p>
                    <Bars bars={view.bars} />
                </div>
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

/**
 * 주인 패(2026-10-16 오너: "가진 사람도 중요하네 … 총 몇 명이 가지고 넘버링처럼") — 놋쇠 번호판 + 가진 사람 수.
 * 받았으면 내 번호(몇 번째 주인), 아직이면 받으면 받을 번호. 번호는 한 번 정하면 바뀌지 않는다(서버가 적힌 순서로 매긴다).
 */
function OwnerPlate({ view, limit, kind }: { view: CaseItemView; limit?: number; kind: CaseKind }) {
    const { t } = useT();
    const mine = view.done && view.serial;
    const next = view.holders + 1;
    const soldOut = !!limit && !view.done && view.holders >= limit;
    return (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/30 px-3.5 py-3 ring-1 ring-[color:var(--cc-gold)]/25" data-testid="cue-case-owner-plate">
            <span className={cn("cc-serial rk-num", !mine && "cc-serial-next")}>{soldOut ? t("case.soldOut") : serialText(mine ? view.serial! : next)}{limit && !soldOut ? <span className="ml-1 text-[12px] font-semibold opacity-70">/{limit}</span> : null}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-white break-keep">
                    {limit ? t("case.limitedTaken").replace("{n}", String(view.holders)).replace("{m}", String(limit))
                        : view.holders > 0 ? t("case.holders").replace("{n}", String(view.holders)) : t("case.holdersNone")}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-white/60 break-keep">
                    {mine ? (view.serial === 1 ? t(`case.serialFirst.${kind}`) : t(`case.serialMine.${kind}`).replace("{n}", String(view.serial)))
                        : soldOut ? t("case.soldOutDesc") : t("case.serialNext").replace("{no}", serialText(next))}
                </span>
            </span>
        </div>
    );
}

/** 잠김 표시 — 자리 오른쪽 위의 작은 자물쇠 */
function LockMark({ small = false }: { small?: boolean }) {
    return (
        <span className={cn("absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white/80 ring-1 ring-white/15", small ? "right-1.5 h-6 w-6" : "right-2 h-7 w-7")} aria-hidden="true">
            <LucideLock weight="fill" className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </span>
    );
}

/** 열자마자 — 새로 들어온 것./** 열자마자 — 새로 들어온 것. 큐는 자리로 미끄러져 들어간다 */
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

