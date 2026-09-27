/**
 * "나와 비교하기"(2026-09-27, 오너 승인 시안) — PBA·UMB 선수 페이지 공용.
 *
 * 세 얼굴:
 *  1) 가입 전 방문자(검색 유입): 내 3쿠션 에버리지를 슬라이더·숫자로 넣으면 **로그인 없이** 바로 결과
 *     (선수 대비 %, 랭큐 회원 중 상위 %, 남은 거리, 비슷한 프로). 아래에 가려진 '성장 그래프·하이런·승률'과
 *     [3초 가입하고 경기마다 자동 비교] — 가입·로그인 뒤 이 선수 페이지로 돌아온다(goLogin 의 redirect).
 *  2) 회원: 내 기록으로 항목별 막대(에버리지·하이런·승률), 남은 거리 + 예상 기간(추정, 자료가 모자라면 뺀다),
 *     비슷한 프로, [나 vs 선수 카드 공유](캔버스 PNG)·[내 기록].
 *  3) 에버리지가 없는 선수(UMB 만): 순위끼리 — 세계 n위 vs 랭큐 3쿠션 n위.
 * 3쿠션 기록이 없는 회원은 1)처럼 넣어 보게 하고 버튼만 [첫 경기 기록하기]로 바꾼다.
 * 수치 계산은 shared/proCompare(서버와 같은 식).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { goLogin } from "@/components/hiq/LoginGate";
import { shareImage } from "@/lib/shareImage";
import { flagEmoji } from "@/lib/flag";
import { LucideChevronRight, LucideLock, LucideShare2, LucideTrendingUp, LucideUser, LucideGlobe, LucideLoader2 } from "@/lib/icons";
import {
    COMPARE_AVG_MAX, COMPARE_AVG_MIN, normalizeAvg, proRatio, reachMonths,
    type CompareAvgResponse, type CompareMeResponse, type ComparePro,
} from "@shared/proCompare";
import { drawCompareCard } from "./compareCard";
import { PlayerPhoto } from "@/components/hiq/PlayerPhoto";

const STORE_KEY = "rankue-compare-avg";
const DEFAULT_AVG = 0.8;
const GOLD_BAR = "bg-[#F5B721]";
const GOLD_TEXT = "text-[#8a6a0a]";

export interface ProCompareProps {
    /** 표시 이름(보는 언어 기준) */
    proName: string;
    /** 프로 통산 에버리지 — 없으면 순위끼리(umbRank 필요) */
    proAvg: number | null;
    proHighRun?: number | null;
    /** 0~1 */
    proWinRate?: number | null;
    /** 비슷한 프로 목록에서 뺄 PBA memCode(이 선수 자신) */
    excludeMemCode?: string | null;
    /** UMB 세계랭킹 — 에버리지가 없을 때 순위 비교에 쓴다 */
    umbRank?: number | null;
}

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));

function readSavedAvg(): number {
    try { return normalizeAvg(localStorage.getItem(STORE_KEY)) ?? DEFAULT_AVG; } catch { return DEFAULT_AVG; }
}

/** 입력 디바운스 — 슬라이더를 끄는 동안 요청을 쏘지 않는다 */
function useDebounced<T>(v: T, ms: number): T {
    const [d, setD] = useState(v);
    useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
    return d;
}

function Head({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 rounded-[10px] bg-brand/10 text-brand flex items-center justify-center shrink-0"><LucideUser className="w-[18px] h-[18px]" /></span>
            <h2 className="text-[17px] font-semibold text-ink-1 min-w-0 leading-snug line-clamp-2 break-keep">{title}</h2>
        </div>
    );
}

function VsRow({ label, me, pro, meLabel, proLabel, fmt }: { label: string; me: number | null; pro: number | null; meLabel: string; proLabel: string; fmt: (v: number) => string }) {
    const max = Math.max(me ?? 0, pro ?? 0) || 1;
    const bar = (v: number | null, cls: string) => (
        <span className="flex-1 h-2.5 rounded-full bg-surface-line overflow-hidden">
            {v != null && v > 0 && <span className={cn("block h-full rounded-full", cls)} style={{ width: `${Math.max(4, (v / max) * 100)}%` }} />}
        </span>
    );
    return (
        <div className="mt-3 first:mt-0">
            <div className="text-[12.5px] font-semibold text-ink-3">{label}</div>
            <div className="flex items-center gap-2 mt-1.5">
                <span className={cn("w-12 shrink-0 text-[11.5px] font-semibold truncate", GOLD_TEXT)}>{meLabel}</span>
                {bar(me, GOLD_BAR)}
                <span className="w-12 shrink-0 text-right rk-num text-[13.5px] font-bold">{me != null ? fmt(me) : "—"}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
                <span className="w-12 shrink-0 text-[11.5px] font-semibold text-brand truncate">{proLabel}</span>
                {bar(pro, "bg-brand")}
                <span className="w-12 shrink-0 text-right rk-num text-[13.5px] font-bold">{pro != null ? fmt(pro) : "—"}</span>
            </div>
        </div>
    );
}

function ProRow({ p, onOpen }: { p: ComparePro; onOpen: (memCode: string) => void }) {
    const { locale, t } = useT();
    const name = locale === "ko" ? p.nameKo : (p.nameEn || p.nameKo);
    return (
        <a href={`/pba-player/${encodeURIComponent(p.memCode)}`} onClick={(e) => { e.preventDefault(); onOpen(p.memCode); }}
            className="flex items-center gap-2.5 min-h-12 py-1.5 active:opacity-80">
            <PlayerPhoto memCode={p.memCode} name={name} size={32} />
            <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{name} <span className="text-[12px]">{flagEmoji(p.nationCode ?? "")}</span></span>
                <span className="block text-[12px] text-ink-3 rk-num">{p.league} · {t("compare.avgShort")} {p.average.toFixed(3)}</span>
            </span>
            <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
        </a>
    );
}

export function ProCompareCard({ proName, proAvg, proHighRun, proWinRate, excludeMemCode, umbRank }: ProCompareProps) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const exclude = excludeMemCode ? `&exclude=${encodeURIComponent(excludeMemCode)}` : "";

    // 회원의 내 기록 — 사람마다 다르다(캐시 안 함)
    const me = useQuery<CompareMeResponse>({ queryKey: [`/api/hiq/compare/me?x=1${exclude}`], enabled: !!member, staleTime: 60_000, retry: false });
    const stats = me.data?.stats ?? null;

    // 넣어 보기(가입 전·기록 없는 회원) — 마지막 값을 이 기기에 기억한다
    const [input, setInput] = useState<number>(() => readSavedAvg());
    const [text, setText] = useState<string>(() => readSavedAvg().toFixed(3));
    const tryAvg = useDebounced(input, 250);
    useEffect(() => { try { localStorage.setItem(STORE_KEY, String(tryAvg)); } catch { /* 저장 못 해도 된다 */ } }, [tryAvg]);
    const trying = !stats && !(member && me.isPending);
    const tryQ = useQuery<CompareAvgResponse>({
        queryKey: [`/api/hiq/compare/avg?avg=${tryAvg.toFixed(2)}${exclude}`],
        enabled: trying,
        staleTime: 10 * 60_000,
        placeholderData: (prev) => prev,
    });

    const setFromSlider = (v: number) => { setInput(v); setText(v.toFixed(3)); };
    const setFromText = (s: string) => {
        setText(s);
        const n = normalizeAvg(s);
        if (n != null) setInput(n);
    };

    const openPro = (memCode: string) => { window.scrollTo({ top: 0 }); setLocation(`/pba-player/${encodeURIComponent(memCode)}`); };
    const signup = () => goLogin(setLocation);
    const title = fill(t("compare.title"), { name: proName });

    // ── 회원(기록 있음) ──
    const [sharing, setSharing] = useState(false);
    const share = async () => {
        if (!stats || sharing) return;
        setSharing(true);
        try {
            const ratio = proRatio(stats.avg, proAvg);
            const blob = await drawCompareCard({
                title: fill(t("compare.cardTitle"), { name: proName }),
                meLabel: t("compare.me"), proLabel: proName,
                heroValue: ratio != null ? `${ratio}%` : me.data?.members ? fill(t("compare.topPct"), { n: me.data.members.topPct }) : "",
                heroLabel: ratio != null ? fill(t("compare.ofPro"), { name: proName }) : t("compare.amongMembers"),
                sub: [me.data?.members ? fill(t("compare.topPctLong"), { n: me.data.members.topPct }) : "", proAvg != null && proAvg > stats.avg ? fill(t("compare.gapShort"), { gap: (proAvg - stats.avg).toFixed(3) }) : ""].filter(Boolean).join(" · "),
                rows: [
                    { label: t("compare.avg"), me: stats.avg, pro: proAvg, fmt: (v) => v.toFixed(3) },
                    { label: t("compare.highRun"), me: stats.highRun, pro: proHighRun ?? null, fmt: (v) => String(v) },
                    { label: t("compare.winRate"), me: stats.winRate != null ? stats.winRate * 100 : null, pro: proWinRate != null ? proWinRate * 100 : null, fmt: (v) => `${Math.round(v)}%` },
                ],
                footer: t("compare.cardFooter"),
            });
            const outcome = await shareImage({ blob, filename: "rankue-vs.png", title: fill(t("compare.cardTitle"), { name: proName }), text: `${fill(t("compare.cardTitle"), { name: proName })} · https://www.rankue.co.kr${window.location.pathname}` });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } catch {
            toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally { setSharing(false); }
    };

    const tryRes = tryQ.data;
    const tryRatio = proRatio(tryAvg, proAvg);
    const tryRankVs = useMemo(() => tryRes?.members ?? null, [tryRes]);

    // 로딩 자리 — 회원 기록을 묻는 동안 넣어 보기 화면이 깜빡이지 않게
    if (member && me.isPending) {
        return (
            <section className="rk-card p-4">
                <Head title={title} />
                <div className="h-40 rounded-tile bg-surface-3 animate-pulse" />
            </section>
        );
    }

    // ── 3) 순위끼리(UMB, 에버리지 없음) ──
    if (proAvg == null) {
        if (umbRank == null) return null;
        const mine = stats ? me.data?.members ?? null : tryRankVs;
        return (
            <section className="rk-card p-4">
                <Head title={title} />
                {/* 두 줄로 쌓는다 — UMB 시트처럼 폭이 좁은 곳에서도 숫자가 줄바꿈되지 않게 */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3 rounded-tile bg-brand text-brand-fg px-3.5 py-3">
                        <LucideGlobe className="w-5 h-5 shrink-0 opacity-90" />
                        <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-semibold truncate">{t("compare.umbRank")}</span>
                            <span className="block text-[11.5px] opacity-80 truncate">{t("compare.umbSub")}</span>
                        </span>
                        <span className="rk-num text-[26px] font-bold shrink-0 whitespace-nowrap">{fill(t("compare.rankN"), { n: umbRank })}</span>
                    </div>
                    <div className="self-center text-[11px] font-bold text-ink-4 leading-none py-0.5">VS</div>
                    <div className="flex items-center gap-3 rounded-tile bg-[#F5B721]/15 px-3.5 py-3">
                        <LucideUser className={cn("w-5 h-5 shrink-0", GOLD_TEXT)} />
                        <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-semibold text-ink-1 truncate">{stats ? t("compare.myRankue") : t("compare.yourRankue")}</span>
                            <span className={cn("block text-[11.5px] leading-snug break-keep", GOLD_TEXT)}>{mine ? fill(t("compare.ofMembers"), { total: mine.total.toLocaleString(), n: mine.topPct }) : "—"}</span>
                        </span>
                        <span className="rk-num text-[26px] font-bold text-ink-1 shrink-0 whitespace-nowrap">{mine ? fill(t("compare.rankN"), { n: mine.rank.toLocaleString() }) : "—"}</span>
                    </div>
                </div>
                {!stats && <div className="mt-3.5" />}
                {!stats && <AvgInput value={input} text={text} onSlider={setFromSlider} onText={setFromText} />}
                <Cta member={!!member} hasStats={!!stats} onSignup={signup} onRecord={() => setLocation("/dashboard")} onHistory={() => setLocation("/history")} />
            </section>
        );
    }

    // ── 2) 회원(기록 있음) ──
    if (stats) {
        const ratio = proRatio(stats.avg, proAvg);
        const gap = proAvg - stats.avg;
        const months = reachMonths(gap, stats.perMonth);
        const m = me.data?.members;
        return (
            <section className="rk-card p-4">
                <Head title={fill(t("compare.titleMember"), { name: proName })} />
                <div className="flex items-center gap-2.5 rounded-tile bg-surface-3 px-3 py-2.5">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-[#F5B721] text-white text-[14px] font-bold flex items-center justify-center">{(member?.name ?? "").trim().charAt(0) || "?"}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold truncate">{member?.name} · {t("compare.my3c")} <span className="rk-num">{stats.avg.toFixed(3)}</span></span>
                        <span className="block text-[12px] text-ink-3 truncate">{[m ? fill(t("compare.topPctLong"), { n: m.topPct }) : "", fill(t("compare.games"), { n: stats.games })].filter(Boolean).join(" · ")}</span>
                    </span>
                    {ratio != null && <span className="rk-num text-[20px] font-bold text-brand shrink-0">{ratio}%</span>}
                </div>
                <div className="mt-3">
                    <VsRow label={t("compare.avg")} me={stats.avg} pro={proAvg} meLabel={t("compare.me")} proLabel={proName} fmt={(v) => v.toFixed(3)} />
                    {(stats.highRun != null || proHighRun != null) && <VsRow label={t("compare.highRun")} me={stats.highRun} pro={proHighRun ?? null} meLabel={t("compare.me")} proLabel={proName} fmt={(v) => String(v)} />}
                    {(stats.winRate != null || proWinRate != null) && <VsRow label={t("compare.winRate")} me={stats.winRate != null ? stats.winRate * 100 : null} pro={proWinRate != null ? proWinRate * 100 : null} meLabel={t("compare.me")} proLabel={proName} fmt={(v) => `${Math.round(v)}%`} />}
                </div>
                <div className="mt-3 flex gap-2.5 items-center rounded-tile bg-brand/[0.07] p-3">
                    <LucideTrendingUp className="w-5 h-5 text-brand shrink-0" />
                    <p className="flex-1 text-[13px] leading-snug">
                        {gap > 0
                            ? <>{fill(t("compare.gap"), { name: proName })} <b className="rk-num">+{gap.toFixed(3)}</b></>
                            : <b>{fill(t("compare.ahead"), { name: proName })}</b>}
                        {gap > 0 && months != null && (
                            <span className="block text-[12px] text-ink-3 mt-0.5">{fill(t("compare.reach"), { d: formatMonths(months, t) })}</span>
                        )}
                    </p>
                </div>
                <SimilarPros pros={me.data?.pros ?? []} onOpen={openPro} />
                <div className="flex gap-2 mt-3.5">
                    <button type="button" onClick={() => void share()} disabled={sharing}
                        className="flex-1 h-11 rounded-full border border-surface-line-strong bg-surface-1 text-[13.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {sharing ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideShare2 className="w-4 h-4" />}
                        {fill(t("compare.shareCard"), { name: proName })}
                    </button>
                    <button type="button" onClick={() => setLocation("/history")} className="h-11 px-4 rounded-full bg-brand text-brand-fg text-[13.5px] font-semibold shrink-0">{t("compare.myRecord")}</button>
                </div>
            </section>
        );
    }

    // ── 1) 넣어 보기(가입 전 · 기록 없는 회원) ──
    return (
        <section className="rk-card p-4">
            <Head title={title} />
            <AvgInput value={input} text={text} onSlider={setFromSlider} onText={setFromText} />
            <div className="mt-3.5 rounded-tile bg-brand/[0.07] p-3.5">
                <div className="flex">
                    <div className="flex-1 text-center">
                        <div className="rk-num text-[26px] font-bold text-brand leading-tight">{tryRatio != null ? `${tryRatio}%` : "—"}</div>
                        <div className="text-[12px] font-semibold text-ink-3">{fill(t("compare.ofPro"), { name: proName })}</div>
                    </div>
                    <div className="w-px bg-surface-line mx-2" />
                    <div className="flex-1 text-center">
                        <div className="rk-num text-[26px] font-bold text-brand leading-tight">{tryRes?.members ? fill(t("compare.topPct"), { n: tryRes.members.topPct }) : "—"}</div>
                        <div className="text-[12px] font-semibold text-ink-3">{tryRes?.members ? fill(t("compare.amongN"), { n: tryRes.members.total.toLocaleString() }) : t("compare.amongMembers")}</div>
                    </div>
                </div>
                <p className="text-[12.5px] text-ink-2 text-center mt-2.5">
                    {proAvg > tryAvg ? <>{fill(t("compare.gap"), { name: proName })} <b className="rk-num">+{(proAvg - tryAvg).toFixed(3)}</b></> : <b>{fill(t("compare.ahead"), { name: proName })}</b>}
                </p>
            </div>
            <SimilarPros pros={tryRes?.pros ?? []} onOpen={openPro} />
            {!member && (
                // 가입하면 열리는 것 — 흐리게 보여 궁금하게 만든다(내용은 장식, 실제 수치 아님)
                <div className="relative mt-3 rounded-tile border border-surface-line p-3 overflow-hidden" aria-hidden="true">
                    <div className="blur-[3px] opacity-70">
                        <div className="text-[13px] font-semibold">{t("compare.lockedTitle")}</div>
                        <div className="h-11 mt-2 rounded-lg bg-gradient-to-r from-brand/15 to-brand/35" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-1">
                        <LucideLock className="w-4 h-4" />{t("compare.locked")}
                    </div>
                </div>
            )}
            <Cta member={!!member} hasStats={false} onSignup={signup} onRecord={() => setLocation("/dashboard")} onHistory={() => setLocation("/history")} />
        </section>
    );
}

function formatMonths(m: number, t: (k: string) => string): string {
    const y = Math.floor(m / 12), mm = m % 12;
    if (y && mm) return fill(t("compare.yearsMonths"), { y, m: mm });
    if (y) return fill(t("compare.years"), { y });
    return fill(t("compare.months"), { m: mm });
}

function AvgInput({ value, text, onSlider, onText }: { value: number; text: string; onSlider: (v: number) => void; onText: (s: string) => void }) {
    const { t } = useT();
    return (
        <div>
            <label htmlFor="compare-avg" className="text-[13px] font-semibold text-ink-2">{t("compare.inputLabel")}</label>
            <div className="flex items-center gap-3 mt-2">
                <input
                    type="range" min={COMPARE_AVG_MIN} max={2} step={0.01} value={Math.min(2, value)} aria-label={t("compare.inputLabel")}
                    onChange={(e) => onSlider(Number(e.target.value))}
                    className="flex-1 h-11 accent-brand"
                />
                <input
                    id="compare-avg" type="text" inputMode="decimal" value={text} onChange={(e) => onText(e.target.value)}
                    className="w-[84px] h-11 rounded-[10px] border-[1.5px] border-brand bg-surface-1 text-center rk-num text-[17px] font-bold outline-none focus:ring-2 focus:ring-brand/30"
                />
            </div>
            <div className="flex justify-between text-[11px] text-ink-4 -mt-1 pr-[96px]"><span>{COMPARE_AVG_MIN}</span><span>1.0</span><span>2.0</span></div>
            <p className="sr-only">{fill(t("compare.inputRange"), { min: COMPARE_AVG_MIN, max: COMPARE_AVG_MAX })}</p>
        </div>
    );
}

function SimilarPros({ pros, onOpen }: { pros: ComparePro[]; onOpen: (memCode: string) => void }) {
    const { t } = useT();
    if (!pros.length) return null;
    return (
        <div className="mt-3.5">
            <div className="text-[13px] font-semibold">{t("compare.similarPros")}</div>
            <div className="divide-y divide-surface-line">{pros.map((p) => <ProRow key={p.memCode} p={p} onOpen={onOpen} />)}</div>
        </div>
    );
}

function Cta({ member, hasStats, onSignup, onRecord, onHistory }: { member: boolean; hasStats: boolean; onSignup: () => void; onRecord: () => void; onHistory: () => void }) {
    const { t } = useT();
    if (!member) {
        return (
            <>
                <button type="button" onClick={onSignup} className="w-full h-12 mt-3.5 rounded-full bg-brand text-brand-fg text-[15px] font-semibold">{t("compare.signupCta")}</button>
                <p className="text-[12px] text-ink-3 text-center mt-2">
                    {t("compare.signupNote")} <button type="button" onClick={onSignup} className="font-semibold text-brand min-h-6">{t("compare.login")}</button>
                </p>
            </>
        );
    }
    return hasStats
        ? <button type="button" onClick={onHistory} className="w-full h-12 mt-3.5 rounded-full bg-brand text-brand-fg text-[15px] font-semibold">{t("compare.climbCta")}</button>
        : <button type="button" onClick={onRecord} className="w-full h-12 mt-3.5 rounded-full bg-brand text-brand-fg text-[15px] font-semibold">{t("compare.firstGameCta")}</button>;
}
