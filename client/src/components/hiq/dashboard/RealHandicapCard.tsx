/**
 * 홈 전적 카드 아래 "내 실전 핸디"(2026-09-27, 오너 승인 시안 → 콤팩트 개편).
 * 실전 매칭 대결 기록만 — 3쿠션은 닮은 프로·재미 등급·사다리 + 비교표(나 | 닮은 프로 | 다음 핸디),
 * 4구는 프로 기록이 없어 랭큐 회원 순위 + 비교표(나 | 같은 핸디 회원 평균 | 다음 핸디). 버튼 [매칭 대결][프로][공유].
 * '다음 핸디까지'는 핸디를 매기는 기준(최근 공식 10경기 평균, shared/realHandicap)으로 센다 — 실제로 오르는 값과 맞게.
 * 온라인 에버는 한 줄 비교로만 보인다(계산에 섞지 않는다). 공식 경기 5판 전에는 진행 막대. 로그인 전에는 그리지 않는다.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shareImage } from "@/lib/shareImage";
import { Swords } from "@/lib/icons";
import { proRatio, type LookalikeResponse, type RealCompareResponse, type RealSide } from "@shared/proCompare";
import { drawCompareCard } from "@/components/hiq/compare/compareCard";
import { BadgeAvatar, CardActions, CompareTable, GOLD_TEXT, MeAvatar, NeedMore, NextCell, ProAvatar, ProTwinHeader, fill, gapText, proName } from "@/components/hiq/compare/lookalikeUi";

export function RealHandicapCard({ onStartMatch }: { onStartMatch: () => void }) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [sharing, setSharing] = useState(false);
    const q = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    // 온라인 에버 한 줄 — 온라인 카드와 같은 쿼리(캐시를 같이 쓴다)
    const online = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    const [tab, setTab] = useState<"3c" | "4c" | null>(null);
    useEffect(() => { if (q.data && tab === null) setTab(q.data.preferred); }, [q.data, tab]);
    if (!member || !q.data || !tab) return null;
    const d: RealSide = q.data[tab];

    const tabs = (
        <div className="inline-flex p-[3px] rounded-full bg-surface-3 shrink-0" role="tablist">
            {(["3c", "4c"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={cn("h-7 px-3 rounded-full text-[12.5px] font-bold transition-colors", tab === k ? "bg-surface-1 text-ink-1 shadow-sm" : "text-ink-3")}>
                    {k === "3c" ? t("real.tab3c") : t("real.tab4c")}
                </button>
            ))}
        </div>
    );
    const head = (
        <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14.5px] font-bold text-ink-1 truncate">🎱 {t("real.title")}</h3>
            {tabs}
        </div>
    );
    const matchAction = { label: t("real.match"), icon: Swords, onClick: onStartMatch };

    if (!d.ready || d.avg == null) {
        return (
            <section className="rk-card p-4">
                {head}
                <NeedMore
                    title={fill(t("real.needTitle"), { n: d.needed })}
                    sub={fill(t("real.needSub"), { m: Math.min(d.games, d.needed), left: Math.max(1, d.needed - d.games) })}
                    pct={(d.games / d.needed) * 100}
                    action={matchAction}
                />
            </section>
        );
    }

    const next = d.nextHandi;
    const nextCol = next ? fill(t("real.nextHandi"), { n: next.handi }) : t("real.topHandi");
    // 다음 칸 얼굴 — 사람이 아니라 핸디라서 숫자 동그라미(최고 핸디면 트로피)
    const nextColFace = { label: next ? fill(t("real.nextHandi"), { n: "" }).trim() : nextCol, tone: "next" as const, avatar: <BadgeAvatar next>{next ? next.handi : "🏆"}</BadgeAvatar> };
    const share = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const other = d.type === "3c" && d.pro ? proName(d.pro, locale) : t("real.peersAvg");
            const ratio = d.type === "3c" && d.pro ? proRatio(d.avg!, d.pro.average) : null;
            const blob = await drawCompareCard({
                title: d.type === "3c" && d.pro ? fill(t("compare.cardTitle"), { name: other }) : t("real.cardTitle4c"),
                meLabel: t("compare.me"), proLabel: other,
                heroValue: ratio != null ? `${ratio}%` : d.members ? fill(t("compare.topPct"), { n: d.members.topPct }) : `${d.handi}`,
                heroLabel: ratio != null ? fill(t("compare.ofPro"), { name: other }) : t("compare.amongMembers"),
                sub: [fill(t("real.handiLine"), { n: d.handi ?? "-" }), next ? fill(t("real.nextLine"), { n: next.handi, gap: gapText(next.gap) }) : ""].filter(Boolean).join(" · "),
                rows: [
                    { label: t("lookalike.rowAvg"), me: d.avg, pro: d.type === "3c" ? d.pro?.average ?? null : d.peers?.avg ?? null, fmt: (v) => v.toFixed(3) },
                    { label: t("lookalike.rowHighRun"), me: d.highRun, pro: d.type === "3c" ? d.pro?.highRun ?? null : d.peers?.highRun != null ? Math.round(d.peers.highRun) : null, fmt: (v) => String(v) },
                ],
                footer: t("compare.cardFooter"),
            });
            const outcome = await shareImage({ blob, filename: "rankue-handicap.png", title: t("real.title"), text: `${t("real.title")} · https://www.rankue.co.kr` });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } catch {
            toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally { setSharing(false); }
    };

    const foot = (
        <p className="text-[11.5px] text-ink-4 mt-2 rk-num">
            {[
                online.data?.ready && online.data.avg != null && d.type === "3c" ? fill(t("real.onlineAvg"), { v: online.data.avg.toFixed(2) }) : "",
                fill(t("real.games"), { n: d.games }),
                t("real.handiNote"),
            ].filter(Boolean).join(" · ")}
        </p>
    );

    if (d.type === "3c" && d.pro) {
        const pro = d.pro;
        const openPro = () => setLocation(`/pba-player/${encodeURIComponent(pro.memCode)}`);
        return (
            <section className="rk-card p-4">
                {head}
                <ProTwinHeader
                    pro={pro} tier={d.tier} pos={d.pos} onOpen={openPro}
                    extra={d.members ? <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold bg-surface-1 text-ink-2 rk-num">{fill(t("compare.topPctLong"), { n: d.members.topPct })}</span> : null}
                />
                <CompareTable
                    cols={[{ label: t("compare.me"), tone: "me", avatar: <MeAvatar /> }, { label: proName(pro, locale), avatar: <ProAvatar pro={pro} /> }, nextColFace]}
                    rows={[
                        { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), pro.average.toFixed(2), next ? <NextCell value={next.avg.toFixed(2)} gap={next.gap} /> : "🏆"] },
                        { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", pro.highRun ?? "—", "—"] },
                        { label: t("lookalike.rowHandi"), cells: [d.handi ?? "—", "—", next ? next.handi : "—"] },
                    ]}
                />
                {foot}
                <CardActions primary={matchAction} onPro={openPro} onShare={() => void share()} sharing={sharing} />
            </section>
        );
    }

    // 4구 — 랭큐 회원끼리
    const m = d.members;
    return (
        <section className="rk-card p-4">
            {head}
            <div className="mt-3 flex items-center gap-3 rounded-tile bg-brand/[0.05] p-3">
                <span className={cn("w-12 h-12 shrink-0 rounded-xl bg-[#F5B721]/20 flex flex-col items-center justify-center rk-num", GOLD_TEXT)}>
                    <b className="text-[15px] leading-none">{m ? `${m.topPct}%` : "—"}</b>
                    <span className="text-[9.5px] font-bold mt-0.5">{t("real.topWord")}</span>
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11.5px] font-semibold text-ink-3">{t("real.rank4c")}</span>
                    <span className="block text-[15px] font-bold rk-num truncate">{m ? fill(t("real.rankLine"), { total: m.total.toLocaleString(), rank: m.rank.toLocaleString() }) : "—"}</span>
                </span>
            </div>
            <CompareTable
                cols={[{ label: t("compare.me"), tone: "me", avatar: <MeAvatar /> }, { label: t("real.peersAvg"), avatar: <BadgeAvatar>{d.handi ?? "–"}</BadgeAvatar> }, nextColFace]}
                rows={[
                    { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), d.peers?.avg != null ? d.peers.avg.toFixed(2) : "—", next ? <NextCell value={next.avg.toFixed(2)} gap={next.gap} /> : "🏆"] },
                    { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", d.peers?.highRun != null ? Math.round(d.peers.highRun) : "—", "—"] },
                    { label: t("lookalike.rowHandi"), cells: [d.handi ?? "—", d.peers ? fill(t("real.peersCount"), { h: d.handi ?? "-", n: d.peers.count }) : "—", next ? next.handi : "—"] },
                ]}
            />
            <p className="text-[11.5px] text-ink-4 mt-2">{t("real.note4c")}</p>
            <CardActions primary={matchAction} onShare={() => void share()} sharing={sharing} />
        </section>
    );
}
