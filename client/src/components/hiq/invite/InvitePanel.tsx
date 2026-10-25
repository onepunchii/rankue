/**
 * 큐 케이스의 '친구 초대' 칸(2026-10-16 오너: "한정판 가장 상위에 친구초대 · 해당 큐대로 친구초대 하기 버튼 · 바이럴에 중요").
 * 고른 것: 가입만 센다 · 1명 초크 · 3명 장갑 · 10명 큐 · 30명마다 한정 큐 한 자루를 고른다(12종 × 10자루) · 초대받은 사람 환영 초크.
 *
 *  - 사다리 네 칸(그림 · 사람 수) — 다다른 칸은 불이 켜지고, 지금 칸까지 막대가 찬다
 *  - '내 대표 큐로 친구 초대하기' — 대표 큐가 들어간 카드 + 링크(inviteCard → shareBlob). 링크 복사도 따로
 *  - 고를 수 있는 한정 큐가 있으면 분홍 띠 → 고르기 팝업(남은 자루 · 완판 · 가진 디자인 · 고르면 바꿀 수 없음)
 *  - 가입한 지 7일 안이고 초대로 세지 않았으면 '초대받으셨나요?' 코드 넣기(앱을 깔고 앱에서 가입하면 링크의 표시가 끊긴다)
 * 만화 묶음이라 이 칸만 핫핑크가 들어간다. 그 밖은 큐 케이스의 금 · 벨벳 그대로.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useBackToClose } from "@/hooks/useBackToClose";
import { shareBlob } from "@/sim/share/useShare";
import { canvasToBlob } from "@/sim/share/shareCard";
import { CUES, INVITE_PICK_LIMIT, INVITE_STEPS, caseImage, caseItem, type CaseItem, type CaseLocale } from "@shared/cueCase";
import { cleanInviteCode } from "@shared/invite";
import { CASE_SUMMARY_KEY, CUE_CASE_QUERY_KEY, saveHero, serialText, type CueCaseView } from "@/components/hiq/cueCase/cueCaseApi";
import { INVITE_ME_KEY, claimInvite, fetchInviteMe, pickInviteCue, shareInviteLink } from "./inviteApi";
import { shareWithKakao } from "@/components/share/ShareChooser";
import { renderInviteCard } from "./inviteCard";

const PINK = "#FF4FA3";
const PICKS: readonly CaseItem[] = CUES.filter((c) => c.rule.k === "invitePick");
/** 사다리 네 칸의 그림 — 1명 초크 · 3명 장갑 · 10명 큐 · 30명 한정(말랑 큐볼이 대표로) */
const LADDER = [
    { n: INVITE_STEPS[0], item: caseItem("chalk-invite")! },
    { n: INVITE_STEPS[1], item: caseItem("glove-invite")! },
    { n: INVITE_STEPS[2], item: caseItem("cue-invite-10")! },
    { n: INVITE_STEPS[3], item: caseItem("cue-lt-inv-jelly")! },
];

export function InvitePanel({ view, l, onReveal, focus = false }: { view: CueCaseView; l: CaseLocale; onReveal: (items: CaseItem[]) => void; focus?: boolean }) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const q = useQuery({ queryKey: INVITE_ME_KEY, queryFn: fetchInviteMe, staleTime: 30_000, retry: false });
    const me = q.data;
    const [sharing, setSharing] = useState(false);
    const [picking, setPicking] = useState(false);
    const [code, setCode] = useState("");
    // 방금 고른 한정 큐 — 축하 화면(번호 · 대표 큐로 · 자랑하기)
    const [picked, setPicked] = useState<{ item: CaseItem; serial: number } | null>(null);
    // 홈의 '친구 초대하고 한정 큐 받기'로 왔으면 이 칸으로
    const box = useRef<HTMLElement>(null);
    useEffect(() => { if (focus) window.setTimeout(() => box.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 350); }, [focus]);
    const count = me?.count ?? view.invite?.count ?? 0;
    const left = me?.picks.left ?? view.invite?.picks.left ?? 0;
    const next = INVITE_STEPS.find((s) => s > count) ?? null;
    // 30명을 넘으면 '다음 한 자루'까지 — 30 · 60 · 90
    const nextPick = count >= INVITE_STEPS[3] ? Math.ceil((count + 1) / INVITE_STEPS[3]) * INVITE_STEPS[3] : null;
    const toNext = (next ?? nextPick ?? 0) - count;

    const share = async (hero: string | null = view.hero) => {
        if (!me || sharing) return;
        setSharing(true);
        try {
            const title = t("inv.cardTitle").replace("{name}", view.member.name);
            const canvas = await renderInviteCard({ title, sub: t("inv.cardSub"), codeLabel: t("inv.cardCode"), code: me.code, url: me.url, hero, gift: caseItem("chalk-welcome")!.name[l] });
            const blob = await canvasToBlob(canvas);
            if (!blob) throw new Error("blob");
            const out = await shareBlob(blob, { title, text: `${t("inv.shareText").replace("{name}", view.member.name)}\n${me.url}`, filename: `rankue-invite-${me.code}.png`, url: me.url, copied: false });
            if (!out.ok) toast({ title: t("case.shareFail"), variant: "destructive" });
        } catch {
            toast({ title: t("case.shareFail"), variant: "destructive" });
        } finally { setSharing(false); }
    };
    // 버튼 하나 — 링크와 글을 보낸다(받는 쪽에 초대 카드 미리보기가 붙는다). 공유창이 없으면 복사
    // 웹에서는 먼저 카카오톡 카드를 고를 수 있다(2026-10-25 — components/share/ShareChooser)
    const sendLink = () => {
        if (!me || sharing) return;
        shareWithKakao({
            title: t("inv.cardTitle").replace("{name}", view.member.name), description: t("inv.shareText").replace("{name}", view.member.name),
            url: me.url, imageUrl: "https://www.rankue.co.kr/og.png", buttonTitle: "초대 받기", fallback: systemSendLink,
        });
    };
    const systemSendLink = async () => {
        if (!me || sharing) return;
        setSharing(true);
        try {
            const title = t("inv.cardTitle").replace("{name}", view.member.name);
            const out = await shareInviteLink({ title, text: t("inv.shareText").replace("{name}", view.member.name), url: me.url });
            if (out === "copied") toast({ title: t("inv.copied") });
            else if (out === "failed") toast({ title: me.url });
        } finally { setSharing(false); }
    };
    const copy = async () => {
        if (!me) return;
        const { copyText } = await import("@/sim/share/useShare");
        toast({ title: (await copyText(me.url)) ? t("inv.copied") : me.url });
    };
    const claim = useMutation({
        mutationFn: (c: string) => claimInvite(c),
        onSuccess: () => {
            setCode("");
            void qc.invalidateQueries({ queryKey: INVITE_ME_KEY }); void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); void qc.invalidateQueries({ queryKey: CASE_SUMMARY_KEY });
            const w = caseItem("chalk-welcome"); if (w) onReveal([w]);
        },
        onError: (e: any) => toast({ title: typeof e?.message === "string" && e.message ? e.message : t("inv.claimFail"), variant: "destructive" }),
    });
    const clean = cleanInviteCode(code);

    return (
        <section ref={box} className="mt-5 scroll-mt-4 overflow-hidden rounded-[24px] ring-1 ring-[#FF4FA3]/35" style={{ background: "linear-gradient(160deg, #2A0F24 0%, #160A1C 55%, #0E0A18 100%)" }} aria-label={t("inv.title")} data-testid="cue-case-invite" data-tour="cc-invite">
            <div className="px-4 pb-4 pt-4">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[16px] font-semibold text-white">{t("inv.title")}</h2>
                    <p className="rk-num text-[13px] font-semibold" style={{ color: PINK }} data-testid="cue-case-invite-count">{t("inv.count").replace("{n}", String(count))}</p>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("inv.desc")}</p>

                {/* 사다리 — 네 칸 */}
                <ol className="relative mt-4 grid grid-cols-4 gap-1.5" data-testid="cue-case-invite-ladder">
                    {LADDER.map((s, i) => {
                        const on = count >= s.n, prev = i ? LADDER[i - 1].n : 0, part = on ? 1 : Math.max(0, Math.min(1, (count - prev) / (s.n - prev)));
                        return (
                            <li key={s.n} className="relative flex flex-col items-center" data-on={on ? "1" : "0"}>
                                <span className={cn("relative flex h-[62px] w-full items-center justify-center overflow-hidden rounded-2xl", on ? "bg-white/[0.10]" : "bg-black/30")} style={on ? { boxShadow: `0 0 0 1.5px ${PINK}, 0 0 16px ${PINK}55` } : { boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                                    {s.item.kind === "cue"
                                        ? <img src={caseImage(s.item)} alt="" className={cn("w-[150%] max-w-none -rotate-[28deg]", !on && "opacity-35 grayscale")} draggable={false} />
                                        : <img src={caseImage(s.item)} alt="" className={cn("h-[52px] w-[52px] object-contain", !on && "opacity-35 grayscale")} draggable={false} />}
                                    {i === 3 && <span className="absolute right-1 top-1 rounded-[4px] px-1 text-[12px] font-bold leading-[16px]" style={{ background: "#FFE14D", color: "#1A0B14" }}>×12</span>}
                                </span>
                                <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${Math.round(part * 100)}%`, background: PINK }} /></span>
                                <span className={cn("mt-1 text-[12px] font-semibold", on ? "text-white" : "text-white/55")}>{t("inv.stepN").replace("{n}", String(s.n))}</span>
                                {i === 3 && <span className="text-[12px] leading-tight text-white/45">{t("inv.ladderPick")}</span>}
                            </li>
                        );
                    })}
                </ol>
                {toNext > 0 && <p className="mt-2 text-center text-[12.5px] text-white/60" data-testid="cue-case-invite-next">{t("inv.next").replace("{n}", String(toNext))}</p>}

                {left > 0 && (
                    <button type="button" onClick={() => setPicking(true)} className="mt-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left active:opacity-90" style={{ background: "#FFE14D", color: "#1A0B14", boxShadow: "0 4px 0 #1A0B14" }} data-testid="cue-case-invite-pick-open">
                        <span className="flex-1 text-[14.5px] font-bold">{t("inv.pickReady").replace("{n}", String(left))}</span>
                        <span className="rounded-full px-3 py-1.5 text-[13px] font-bold" style={{ background: "#1A0B14", color: "#FFE14D" }}>{t("inv.pickCta")}</span>
                    </button>
                )}

                <button type="button" onClick={() => { void sendLink(); }} disabled={!me || sharing} className="mt-3 h-12 w-full rounded-full text-[15px] font-bold text-white active:opacity-90 disabled:opacity-60" style={{ background: PINK, boxShadow: "0 4px 0 #7A0F4C" }} data-testid="cue-case-invite-share" data-tour="cc-invite-share" data-track-as="친구 초대 링크 보내기">
                    {t("inv.share")}
                </button>
                {q.isError ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3.5 py-2.5" data-testid="cue-case-invite-me-fail">
                        <p className="text-[12.5px] text-white/75">{t("inv.meFail")}</p>
                        <button type="button" onClick={() => { void q.refetch(); }} className="h-9 shrink-0 rounded-full border border-white/20 px-3.5 text-[13px] font-semibold text-white/90">{t("inv.retry")}</button>
                    </div>
                ) : (
                    <p className="mt-1.5 text-center text-[12px] text-white/55 break-keep" data-testid="cue-case-invite-share-hint">{t("inv.shareHint")}</p>
                )}
                {me && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
                        <button type="button" onClick={() => { void copy(); }} className="flex items-center gap-1.5 text-[12.5px] text-white/60 active:opacity-70" data-testid="cue-case-invite-copy">
                            {t("inv.code")} <span className="rk-num text-[14px] font-bold tracking-[0.16em] text-white" data-testid="cue-case-invite-code">{me.code}</span>
                        </button>
                        <button type="button" onClick={() => { void share(); }} disabled={sharing} className="text-[12.5px] font-semibold underline-offset-2 active:opacity-70 disabled:opacity-50" style={{ color: PINK }} data-testid="cue-case-invite-card">
                            {sharing ? t("inv.sharing") : t("inv.cardOnly")}
                        </button>
                    </div>
                )}
                {me?.invitedBy && <p className="mt-2.5 text-center text-[12.5px] text-white/55" data-testid="cue-case-invited-by">{t("inv.invitedBy").replace("{name}", me.invitedBy)}</p>}
                {me?.canClaim && (
                    <div className="mt-3 rounded-2xl bg-white/[0.05] px-3.5 py-3" data-testid="cue-case-invite-claim">
                        <p className="text-[13.5px] font-semibold text-white">{t("inv.claimTitle")}</p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("inv.claimDesc")}</p>
                        <div className="mt-2.5 flex gap-2">
                            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder={t("inv.claimPlaceholder")} autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text"
                                className="rk-num h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 text-[16px] font-semibold tracking-[0.16em] text-white placeholder:tracking-normal placeholder:text-white/35 focus:border-[#FF4FA3] focus:outline-none" data-testid="cue-case-invite-claim-input" />
                            <button type="button" onClick={() => clean && claim.mutate(clean)} disabled={!clean || claim.isPending} className="h-11 shrink-0 rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-40" style={{ background: PINK }} data-testid="cue-case-invite-claim-go">{t("inv.claimCta")}</button>
                        </div>
                    </div>
                )}
            </div>
            {picking && <PickSheet view={view} l={l} left={left} onClose={() => setPicking(false)} onPicked={(x, serial) => { setPicking(false); setPicked({ item: x, serial }); }} />}
            {picked && <PickedCelebration item={picked.item} serial={picked.serial} l={l} hero={view.hero} sharing={sharing} onShare={() => { void share(picked.item.id); }} onClose={() => setPicked(null)} />}
        </section>
    );
}

/** 고르기 팝업 — 열두 디자인, 남은 자루 · 완판 · 가진 것. 누르면 한 번 더 묻는다(고르면 바꿀 수 없다) */
function PickSheet({ view, l, left, onClose, onPicked }: { view: CueCaseView; l: CaseLocale; left: number; onClose: () => void; onPicked: (x: CaseItem, serial: number) => void }) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [sure, setSure] = useState<CaseItem | null>(null);
    useBackToClose(true, () => (sure ? setSure(null) : onClose()));
    const pick = useMutation({
        mutationFn: (x: CaseItem) => pickInviteCue(x.id).then((r) => ({ x, serial: r.serial })),
        onSuccess: ({ x, serial }) => {
            void qc.invalidateQueries({ queryKey: INVITE_ME_KEY }); void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); void qc.invalidateQueries({ queryKey: CASE_SUMMARY_KEY });
            onPicked(x, serial);
        },
        onError: (e: any) => { setSure(null); void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); toast({ title: typeof e?.message === "string" && e.message ? e.message : t("inv.pickFail"), variant: "destructive" }); },
    });
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65" onClick={onClose} data-testid="cue-case-pick-backdrop">
            <div role="dialog" aria-modal="true" aria-label={t("inv.pickTitle")} onClick={(e) => e.stopPropagation()} data-testid="cue-case-pick"
                className="cue-case flex max-h-[88dvh] w-full max-w-[440px] flex-col rounded-t-[26px] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}>
                <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-white/20" aria-hidden />
                <div className="px-5">
                    <p className="text-[12.5px] font-bold" style={{ color: PINK }}>{t("inv.pickReady").replace("{n}", String(left))}</p>
                    <h2 className="mt-0.5 text-[20px] font-bold tracking-tight text-white">{t("inv.pickTitle")}</h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-white/60 break-keep">{t("inv.pickSub")}</p>
                </div>
                <ol className="mt-3 flex-1 space-y-2.5 overflow-y-auto px-5 pb-2" data-testid="cue-case-pick-list">
                    {PICKS.map((x) => {
                        const v = view.items[x.id], have = !!v?.done, rest = Math.max(0, INVITE_PICK_LIMIT - (v?.holders ?? 0)), out = !have && rest <= 0;
                        return (
                            <li key={x.id}>
                                <button type="button" disabled={have || out || pick.isPending} onClick={() => setSure(x)} className={cn("w-full rounded-2xl px-3 py-2.5 text-left active:bg-white/[0.08]", have ? "bg-white/[0.06]" : "bg-black/25", (have || out) && "opacity-55")}
                                    style={sure?.id === x.id ? { boxShadow: `0 0 0 2px ${PINK}` } : undefined} data-testid={`cue-case-pick-${x.id}`} data-left={rest}>
                                    <span className="cc-slot block"><img src={caseImage(x)} alt="" className="cc-own" draggable={false} /></span>
                                    <span className="mt-1.5 flex items-center justify-between gap-2">
                                        <span className="truncate text-[14px] font-semibold text-white">{x.name[l]}</span>
                                        <span className={cn("rk-num shrink-0 text-[12.5px] font-semibold", have ? "text-[color:var(--cc-gold)]" : out ? "text-white/45" : "")} style={!have && !out ? { color: PINK } : undefined}>
                                            {have ? t("inv.pickHave") : out ? t("case.soldOut") : t("case.limitedLeft").replace("{n}", String(rest)).replace("{m}", String(INVITE_PICK_LIMIT))}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
                {sure ? (
                    <div className="border-t border-white/10 px-5 pt-3" data-testid="cue-case-pick-confirm">
                        <p className="text-center text-[14.5px] font-semibold text-white">{t("inv.pickConfirm").replace("{name}", sure.name[l])}</p>
                        <div className="mt-2.5 flex gap-2">
                            <button type="button" onClick={() => setSure(null)} className="h-12 flex-1 rounded-full border border-white/15 text-[14px] font-semibold text-white/85">{t("inv.pickNo")}</button>
                            <button type="button" onClick={() => pick.mutate(sure)} disabled={pick.isPending} className="h-12 flex-[1.4] rounded-full text-[15px] font-bold text-white disabled:opacity-60" style={{ background: PINK }} data-testid="cue-case-pick-yes">{t("inv.pickYes")}</button>
                        </div>
                    </div>
                ) : (
                    <div className="px-5 pt-2"><button type="button" onClick={onClose} className="h-12 w-full rounded-full border border-white/15 text-[14px] font-semibold text-white/85">{t("inv.later")}</button></div>
                )}
            </div>
        </div>
    );
}

/**
 * 한정 큐를 고른 순간(2026-10-16 — 이 묶음의 가장 큰 순간). 빛살 · 색종이 · 벨벳 자리로 미끄러져 들어오는 큐 · 놋쇠 번호판 "No.008 / 10".
 * 바로 대표 큐로 할 수 있고(게임 큐대 · 초대 카드에 들어간다), 이 큐가 들어간 초대 카드로 자랑할 수 있다. 동작 줄이기면 멈춘 한 장.
 */
function PickedCelebration({ item, serial, l, hero, sharing, onShare, onClose }: { item: CaseItem; serial: number; l: CaseLocale; hero: string | null; sharing: boolean; onShare: () => void; onClose: () => void }) {
    const { t } = useT();
    const qc = useQueryClient();
    useBackToClose(true, onClose);
    const makeHero = useMutation({
        mutationFn: () => saveHero(item.id),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: CUE_CASE_QUERY_KEY }); void qc.invalidateQueries({ queryKey: CASE_SUMMARY_KEY }); },
    });
    const isHero = hero === item.id || makeHero.isSuccess;
    const bits = Array.from({ length: 26 }, (_, i) => i);
    const COLORS = ["#FF4FA3", "#FFE14D", "#7CF2C8", "#8FB8FF", "#FFFFFF"];
    return (
        <div role="dialog" aria-modal="true" aria-label={t("inv.pickedTitle")} className="cc-picked fixed inset-0 z-[70] flex items-center justify-center overflow-hidden px-5" onClick={onClose} data-testid="cue-case-picked">
            <div aria-hidden className="cc-picked-rays pointer-events-none absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2" />
            {bits.map((i) => (
                <span key={i} aria-hidden className="cc-confetti pointer-events-none absolute top-[-4%] block h-3 w-2 rounded-[2px]"
                    style={{ left: `${(i * 37.7) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 9) * 0.17}s`, animationDuration: `${2.4 + (i % 5) * 0.35}s` }} />
            ))}
            <div className="cue-case relative w-full max-w-[400px] rounded-[28px] px-5 pb-5 pt-6 text-center" onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(180deg, #2A0F24, #120A1C)", boxShadow: `0 0 0 2px ${PINK}, 0 0 60px ${PINK}66` }}>
                <p className="text-[13px] font-bold tracking-[0.06em]" style={{ color: PINK }}>{t("case.group.limited")}</p>
                <h2 className="mt-1 text-[22px] font-bold tracking-tight text-white">{t("inv.pickedTitle")}</h2>
                <span className="cc-slot cc-lit mt-5 block"><img src={caseImage(item)} alt={item.name[l]} className="cc-own cc-picked-cue" draggable={false} /></span>
                <p className="mt-3 text-[18px] font-bold text-white" data-testid="cue-case-picked-name">{item.name[l]}</p>
                <div className="mx-auto mt-3 w-fit rounded-md px-5 py-1.5" style={{ background: "linear-gradient(180deg, #f6dfa8, #d6a956 45%, #b0823a 60%, #e2bf78)", color: "#3a230f", boxShadow: "0 3px 10px rgba(0,0,0,0.55)" }}>
                    <span className="rk-num text-[20px] font-bold tracking-[0.04em]" data-testid="cue-case-picked-serial">{serialText(serial)}<span className="text-[14px] opacity-70"> / {item.limit ?? INVITE_PICK_LIMIT}</span></span>
                </div>
                <p className="mt-2 text-[12.5px] text-white/60">{t("inv.pickedSerial").replace("{n}", String(serial)).replace("{m}", String(item.limit ?? INVITE_PICK_LIMIT))}</p>
                <div className="mt-5 space-y-2">
                    <button type="button" onClick={() => makeHero.mutate()} disabled={isHero || makeHero.isPending} className="h-12 w-full rounded-full text-[15px] font-bold disabled:opacity-80" style={isHero ? { background: "#FFFFFF14", color: "#e8c46a" } : { background: "#FFE14D", color: "#1A0B14" }} data-testid="cue-case-picked-hero">
                        {isHero ? t("inv.pickedHeroDone") : t("inv.pickedHero")}
                    </button>
                    <button type="button" onClick={onShare} disabled={sharing} className="h-12 w-full rounded-full text-[15px] font-bold text-white disabled:opacity-60" style={{ background: PINK }} data-testid="cue-case-picked-share">
                        {sharing ? t("inv.sharing") : t("inv.pickedShare")}
                    </button>
                    <button type="button" onClick={onClose} className="h-11 w-full rounded-full text-[14px] font-semibold text-white/70">{t("sim.common.close")}</button>
                </div>
            </div>
        </div>
    );
}
