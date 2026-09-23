/**
 * 카드형 메시지(2026-09-23). 정산 요청·골프 부킹 공유(옛것)와 + 로 붙이는 카드(온라인 대전 초대·경기 결과·내 기록·매장·
 * 랭큐매치 핀·라운드 결과)를 한곳에서 그린다.
 *
 * 본문은 `message`(서버가 한국어로 저장한 요약)가 아니라 **metadata 로 자기 언어로** 그린다 — 방 전원의 언어가 제각각이다.
 * 옛 앱·모르는 종류는 message 를 그대로 보인다. 이동이 있는 종류만 "열기 ›" 를 단다(MY_STATS 는 이동 없음).
 * 사진·큰 자산은 없다(오너: 용량 최소) — 값 2~3줄이 전부.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BallDot } from "@/components/hiq/BallDot";
import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { INTL_TAG, type ChatMsg } from "./ChatRoom";

interface Props {
    msg: ChatMsg;
    onOpen?: () => void;
    /** 내 회원 id — 매칭 대결 카드가 "내가 방장인가"를 가린다(방장은 열기, 그 밖은 참가하기). */
    meId?: string;
}

/** 이동이 있는 종류 — 없는 것(MY_STATS)은 "열기" 를 안 단다. chat-room.tsx 의 openCard 와 짝. */
/**
 * 눌러서 갈 곳이 있는 카드. GOLF_ROUND 는 일부러 뺐다 — 라운드 결과 화면은 그 라운드 참가자만 열 수 있어서
 * (GET /golf/match/:id 가 403) 정작 보여 주려던 상대에게 실패한다. 카드 본문에 코스·타수·날짜가 다 있다(2026-09-23 리뷰).
 */
export const CARD_OPENABLE = new Set(["settlement", "GOLF_BOOKING", "SIM_INVITE", "GAME_RESULT", "STORE", "GOLF_MATCH", "MATCH_INVITE"]);

/** metadata.type(없으면 정산은 msg.type) — 카드 종류 하나로 정리한다. */
export function cardKind(msg: ChatMsg): string {
    const md = (msg as any).metadata;
    return (md?.type as string | undefined) ?? (msg.type === "settlement" ? "settlement" : "");
}

// 한국어는 kst 헬퍼("9월 12일"), 다른 언어는 Intl 이 그 언어 관례로(KST 고정 — 티타임·경기 시각은 한국 기준).
const dateLabel = (iso: string | undefined, locale: Locale) => {
    if (!iso) return "";
    if (locale === "ko") return kstDateLabel(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(INTL_TAG[locale], { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
};
const fill = (s: string, params: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
const num = (v: unknown, digits?: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return digits === undefined ? n.toLocaleString() : n.toFixed(digits);
};
/** 6자리 코드는 "123 456" 으로 — 온라인 대전 화면과 같은 표기. */
const codeLabel = (code: unknown) => { const s = String(code ?? ""); return s.length === 6 ? `${s.slice(0, 3)} ${s.slice(3)}` : s; };

interface MatchStatus { alive: boolean; joined: number; names: string[]; mine: boolean; hostId: string }

/**
 * 매칭 대결 카드 — **살아 있는 카드**다(2026-09-23).
 * 핀을 받아 적을 필요가 없다: 카드가 핀을 들고 있고, "n/seats 참가"가 5초마다 갱신되며,
 * 아직 안 들어온 사람은 [참가하기] 한 번으로 앉는다. 방장은 카드를 눌러 그 핀으로 매칭대결하기 화면을 이어받는다.
 * 쿼리를 카드 안에서 도는 이유: 방에 카드가 여럿일 수 있고 각자 자기 핀만 물어보면 된다.
 */
function MatchInviteBody({ md, meId, canOpen }: { md: any; meId?: string; canOpen: boolean }) {
    const { t } = useT();
    const qc = useQueryClient();
    const [justJoined, setJustJoined] = useState(false);
    const code = md.code ? String(md.code) : "";
    const seats = Number(md.seats) || 2;

    const status = useQuery<MatchStatus>({
        queryKey: ["/api/hiq/invite", code, "status"],
        queryFn: () => apiRequest(`/api/hiq/invite/${code}/status`),
        enabled: !!code,
        refetchInterval: 5000,
        staleTime: 2000,
    });
    const join = useMutation({
        mutationFn: () => apiRequest(`/api/hiq/invite/${code}/join`, { method: "POST" }),
        onSuccess: () => { setJustJoined(true); void qc.invalidateQueries({ queryKey: ["/api/hiq/invite", code, "status"] }); },
    });

    const s = status.data;
    // 아직 못 물어봤으면 카드에 적힌 것만 믿는다 — 숫자가 깜빡이지 않게 방장 1명을 기본으로 둔다.
    const joined = s ? s.joined : 1;
    const alive = s ? s.alive : true;
    const mine = (s?.mine ?? false) || justJoined;
    const full = joined >= seats;
    // 방장 판정은 카드 metadata 가 먼저, 서버가 준 hostId 로 한 번 더 — 옛 카드에 hostId 가 없어도 방장에게 [참가하기]가 뜨지 않게.
    const isHost = !!meId && (String(md.hostId ?? "") === meId || s?.hostId === meId);

    return (
        <>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-1">
                <BallDot type={md.gameType === "4c" ? "4c" : "3c"} size={12} />
                {md.gameType === "4c" ? t("chat.card.game4c") : t("chat.card.game3c")}
                {md.target ? <span className="rk-num font-medium text-ink-2">· {fill(t("chat.card.target"), { n: md.target })}</span> : null}
            </span>
            <span className={cn("block text-[13px] mt-0.5 rk-num font-semibold", alive ? "text-brand" : "text-ink-3")}>
                {fill(t("chat.card.matchSeats"), { n: joined, seats })}
            </span>
            {s && s.names.length > 0 && <span className="block text-[12px] text-ink-3 break-words">{s.names.join(" · ")}</span>}
            <span className="block text-[12px] text-ink-3 mt-0.5 rk-num">{fill(t("chat.card.code"), { code: codeLabel(code) })}</span>

            {!alive ? (
                <span className="block text-[12px] font-medium text-ink-4 mt-1.5">{t("chat.card.matchEnded")}</span>
            ) : isHost ? (
                canOpen ? <span className="block text-[12px] font-medium text-brand mt-1.5">{t("chat.cardOpen")} ›</span> : null
            ) : mine ? (
                <span className="block text-[12px] font-medium text-ink-2 mt-1.5">{t("chat.card.matchJoined")}</span>
            ) : full ? (
                <span className="block text-[12px] font-medium text-ink-4 mt-1.5">{t("chat.card.matchFull")}</span>
            ) : (
                <>
                    <button
                        type="button" disabled={join.isPending}
                        // 바깥 카드(방장 이어받기)와 겹치지 않게 — 참가는 이 버튼만의 일이다.
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!join.isPending) join.mutate(); }}
                        className="mt-2 w-full h-9 rounded-lg bg-brand text-brand-fg text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {join.isPending && <LucideLoader2 className="w-3.5 h-3.5 animate-spin" />}
                        {t("chat.card.matchJoin")}
                    </button>
                    {join.isError && <span className="block text-[11.5px] font-medium text-red-500 mt-1">{(join.error as any)?.message || t("chat.card.matchJoinFailed")}</span>}
                </>
            )}
        </>
    );
}

export function ChatCard({ msg, onOpen, meId }: Props) {
    const { t, locale } = useT();
    const md: any = (msg as any).metadata ?? {};
    const kind = cardKind(msg);
    // 매칭 대결은 방장만 카드를 눌러 이어받는다 — 그 밖의 사람은 카드 안 [참가하기] 버튼으로 앉는다.
    const isMatch = kind === "MATCH_INVITE";
    const isHost = isMatch && !!meId && String(md.hostId ?? "") === meId;
    const gameType = (gt: unknown) => (gt === "4c" ? t("chat.card.game4c") : t("chat.card.game3c"));

    let badge: string;
    let body: ReactNode;
    switch (kind) {
        case "settlement":
            badge = t("chat.cardSettlement");
            body = (
                <>
                    <span className="block text-[14px] font-medium text-ink-1 whitespace-pre-wrap break-words">{msg.message}</span>
                    {md.totalAmount > 0 && <span className="block rk-num text-[13px] text-ink-2 mt-0.5">{fill(t("chat.amountWon"), { n: Number(md.totalAmount).toLocaleString() })}</span>}
                </>
            );
            break;
        case "GOLF_BOOKING":
            badge = t("chat.cardBooking");
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1 break-words">
                        <span className="mr-1.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-brand/10 text-brand align-middle">{md.listingType === "JOIN" ? t("chat.join") : t("chat.booking")}</span>
                        {md.courseName}
                    </span>
                    <span className="block text-[13px] text-ink-2 mt-0.5 rk-num">{dateLabel(md.datetime, locale)} {kstTime(md.datetime ?? "")}</span>
                    {num(md.greenFee) && <span className="block text-[13px] text-ink-2 rk-num">{fill(t("chat.card.greenFee"), { n: num(md.greenFee)! })}</span>}
                </>
            );
            break;
        case "SIM_INVITE":
            badge = t("chat.card.simInvite");
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1">
                        {gameType(md.gameType)}{md.tableId ? ` · ${t(md.tableId === "DAEDAE" ? "sim.setup.tableDaedae" : "sim.setup.tableJungdae")}` : ""} · {md.handicap ? t("chat.card.handicap") : md.target ? fill(t("chat.card.target"), { n: md.target }) : ""}
                    </span>
                    {md.handicap && <span className="block text-[12px] font-medium text-ink-3 leading-snug">{t("chat.card.handicapDesc")}</span>}
                    <span className="block text-[13px] text-ink-2 mt-0.5 rk-num">{fill(t("chat.card.code"), { code: codeLabel(md.code) })}</span>
                    {md.hostName && <span className="block text-[12px] text-ink-3">{fill(t("chat.card.host"), { name: md.hostName })}</span>}
                </>
            );
            break;
        case "GAME_RESULT": {
            const players: { name: string; score: number; isWinner?: boolean }[] = Array.isArray(md.players) ? md.players : [];
            badge = t("chat.card.gameResult");
            body = (
                <>
                    <span className="block text-[12px] font-medium text-ink-3">{gameType(md.gameType)}</span>
                    <span className="block text-[14px] text-ink-1 mt-0.5 rk-num break-words">
                        {players.map((p, i) => (
                            <span key={i}>
                                {i > 0 && <span className="text-ink-4"> : </span>}
                                <span className={p.isWinner ? "font-bold text-brand" : "font-medium"}>{p.name} {num(p.score) ?? p.score}</span>
                            </span>
                        ))}
                    </span>
                    <span className="block text-[12px] text-ink-3 mt-0.5 rk-num">
                        {md.innings != null ? fill(t("chat.card.innings"), { n: md.innings }) : ""}{md.innings != null && md.playedAt ? " · " : ""}{dateLabel(md.playedAt, locale)}
                    </span>
                </>
            );
            break;
        }
        case "MY_STATS": {
            badge = t("chat.card.myStats");
            const golf = md.sport === "GOLF";
            const line3c = md.handi3c != null || md.avg3c != null || md.rating3c != null
                ? fill(t("chat.card.stat3c"), { handi: md.handi3c ?? "-", avg: num(md.avg3c, 3) ?? "-", rating: num(md.rating3c) ?? "-" }) : null;
            const line4c = md.handi4c != null || md.avg4c != null || md.rating4c != null
                ? fill(t("chat.card.stat4c"), { handi: md.handi4c ?? "-", avg: num(md.avg4c, 3) ?? "-", rating: num(md.rating4c) ?? "-" }) : null;
            const lineGolf = md.golfHandicap != null || md.golfAvgScore != null || md.golfGrade != null
                ? fill(t("chat.card.statGolf"), { handi: md.golfHandicap ?? "-", avg: num(md.golfAvgScore, 1) ?? "-", grade: md.golfGrade ?? "-" }) : null;
            // 방 종목의 줄을 먼저, 그게 하나도 없으면 있는 것 아무거나 — 빈 카드가 되지 않게.
            const lines = (golf ? [lineGolf] : [line3c, line4c]).filter(Boolean) as string[];
            const shown = lines.length > 0 ? lines : ([line3c, line4c, lineGolf].filter(Boolean) as string[]);
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1">{md.name}</span>
                    {shown.length === 0 && <span className="block text-[13px] text-ink-3 mt-0.5">{t("chat.card.noStats")}</span>}
                    {shown.map((l) => <span key={l} className="block text-[13px] text-ink-2 mt-0.5 rk-num">{l}</span>)}
                </>
            );
            break;
        }
        case "MATCH_INVITE":
            badge = t("chat.card.matchInvite");
            body = <MatchInviteBody md={md} meId={meId} canOpen={!!onOpen} />;
            break;
        case "STORE":
            badge = t("chat.card.store");
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1 break-words">{md.name}</span>
                    {(md.address || md.region) && <span className="block text-[13px] text-ink-2 mt-0.5 break-words">{md.address || md.region}</span>}
                    {md.phone && <span className="block text-[12px] text-ink-3 rk-num">{md.phone}</span>}
                </>
            );
            break;
        case "GOLF_MATCH":
            badge = t("chat.card.golfMatch");
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1 break-words">{md.courseName}</span>
                    <span className="block text-[13px] text-ink-2 mt-0.5 rk-num">{fill(t("chat.card.pin"), { pin: md.pinCode ?? "" })}</span>
                    {md.hostName && <span className="block text-[12px] text-ink-3">{fill(t("chat.card.host"), { name: md.hostName })}</span>}
                </>
            );
            break;
        case "GOLF_ROUND":
            badge = t("chat.card.golfRound");
            body = (
                <>
                    <span className="block text-[14px] font-semibold text-ink-1 break-words">{md.courseName || t("chat.attach.golfRounds.noCourse")}</span>
                    <span className="block text-[13px] text-ink-2 mt-0.5 rk-num">
                        {md.score != null ? fill(t("chat.card.strokes"), { n: md.score }) : ""}{md.score != null && md.playedAt ? " · " : ""}{dateLabel(md.playedAt, locale)}
                    </span>
                    {md.name && <span className="block text-[12px] text-ink-3">{md.name}</span>}
                </>
            );
            break;
        default:
            // 모르는 종류(앞으로 생길 카드·옛 앱) — 서버 요약 한 줄이라도 보인다.
            badge = t("chat.card.generic");
            body = <span className="block text-[14px] font-medium text-ink-1 whitespace-pre-wrap break-words">{msg.message}</span>;
    }
    const openable = !!onOpen && CARD_OPENABLE.has(kind) && (!isMatch || isHost);
    const shell = "max-w-full min-w-[180px] text-left rounded-2xl border border-surface-line bg-surface-1 px-3.5 py-3 active:bg-surface-2 select-none";

    // 매칭 대결 카드는 안에 [참가하기] 버튼이 들어간다 — button 안의 button 은 못 쓰므로 껍데기를 div 로 바꾼다.
    // (다른 카드는 그대로 button — 회귀를 만들지 않는다.)
    if (isMatch) {
        return (
            <div
                role={openable ? "button" : undefined} tabIndex={openable ? 0 : undefined}
                onClick={() => { if (openable) onOpen?.(); }}
                className={cn(shell, "block w-full")}
            >
                <span className="block text-[11px] font-semibold text-brand mb-0.5">{badge}</span>
                {body}
            </div>
        );
    }

    return (
        <button
            type="button" onClick={() => { if (openable) onOpen?.(); }}
            className={shell}
        >
            <span className="block text-[11px] font-semibold text-brand mb-0.5">{badge}</span>
            {body}
            {openable && <span className="block text-[12px] font-medium text-brand mt-1.5">{t("chat.cardOpen")} ›</span>}
        </button>
    );
}
