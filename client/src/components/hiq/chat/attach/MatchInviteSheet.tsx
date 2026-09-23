/**
 * 매칭 대결 — 대화하다 바로 실전 한 판(2026-09-23 오너: "내 기록 빼고 매칭 대결 넣자").
 *
 * 온라인 대전(시뮬레이터)이 아니다. **오프라인 테이블에서 치고 앱으로 점수만 기록**하는 그 경기다.
 * 보통은 6자리 핀을 불러 주고 상대가 받아 적었는데, 여기서는 **카드가 핀을 들고** 방에 올라가 한 번 누르면 들어온다.
 *
 * 고르는 것은 셋뿐이고 기본값이 다 채워져 있다 — 그대로 눌러도 된다.
 *   종목(3쿠션·4구) · 인원(2·3·4) · 내 목표 점수
 * 목표는 **내 것만** 정한다 — 들어오는 사람은 자기 다마수로 자기 목표를 가진다(핸디는 이어받기 화면에서 조절).
 */
import { useEffect, useState } from "react";
import { LucideLoader2, LucideMinus, LucidePlus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BallDot } from "@/components/hiq/BallDot";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface MatchInvitePick { gameType: "3c" | "4c"; seats: 2 | 3 | 4; target: number }

/** 종목별 기본 목표 — 3쿠션 15점, 4구 80점(앱 어디서나 같은 기본값). */
const DEFAULT_TARGET: Record<"3c" | "4c", number> = { "3c": 15, "4c": 80 };
const MIN_TARGET = 1;
const MAX_TARGET = 999;

/**
 * SimInviteSheet 의 Row 는 `grid-cols-2` 가 박혀 있어 3칸 세그먼트를 못 쓴다 —
 * 그 파일을 고치면 온라인 대전 시트까지 흔들려서, 칸 수를 받는 Row 를 여기 따로 둔다.
 */
function Row({ label, cols, children }: { label: string; cols: 2 | 3; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-[72px] shrink-0 text-[12.5px] font-medium text-ink-3">{label}</span>
            <div className={cn("flex-1 grid gap-1.5 p-1 rounded-xl bg-surface-2", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>{children}</div>
        </div>
    );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on}
            className={cn("h-10 rounded-lg text-[13.5px] font-semibold transition-colors flex items-center justify-center gap-1.5", on ? "bg-surface-0 text-ink-1 shadow-sm" : "text-ink-3")}
        >{children}</button>
    );
}

export function MatchInviteSheet({ open, onOpenChange, busy, seatsFixed, onPick }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    busy?: boolean;
    /** 1:1 방이면 2인 말고는 뜻이 없다 — 인원 줄을 안 그리고 한 줄로 알려 준다. */
    seatsFixed?: 2;
    onPick: (pick: MatchInvitePick) => void;
}) {
    const { t } = useT();
    const [gameType, setGameType] = useState<"3c" | "4c">("3c");
    const [seats, setSeats] = useState<2 | 3 | 4>(2);
    const [target, setTarget] = useState(DEFAULT_TARGET["3c"]);
    // 종목을 바꾸면 목표도 그 종목의 기본으로 — 3쿠션 15를 들고 4구로 가면 30초 만에 끝난다.
    const pickGame = (g: "3c" | "4c") => { setGameType(g); setTarget(DEFAULT_TARGET[g]); };
    const bump = (d: number) => setTarget((n) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, n + d)));
    // 열 때마다 기본값으로 돌린다 — 앞서 고른 값이 남아 있으면 다음 대결을 엉뚱하게 연다(SimInviteSheet 와 같은 규칙).
    useEffect(() => { if (open) { setGameType("3c"); setSeats(seatsFixed ?? 2); setTarget(DEFAULT_TARGET["3c"]); } }, [open, seatsFixed]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.matchInvite")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3 leading-relaxed">{t("chat.attach.matchInvitePick")}</SheetDescription>
                </SheetHeader>
                <div className="px-5 space-y-2.5">
                    <Row label={t("chat.attach.matchInviteGame")} cols={2}>
                        <Seg on={gameType === "3c"} onClick={() => pickGame("3c")}><BallDot type="3c" size={12} />{t("chat.attach.threeBall")}</Seg>
                        <Seg on={gameType === "4c"} onClick={() => pickGame("4c")}><BallDot type="4c" size={12} />{t("chat.attach.fourBall")}</Seg>
                    </Row>
                    {seatsFixed ? (
                        <p className="pl-[84px] text-[12px] font-medium text-ink-3">{t("chat.attach.matchInviteSeatsFixed")}</p>
                    ) : (
                        <Row label={t("chat.attach.matchInviteSeats")} cols={3}>
                            {([2, 3, 4] as const).map((n) => (
                                <Seg key={n} on={seats === n} onClick={() => setSeats(n)}>{t("chat.attach.matchInviteSeatsN").replace("{n}", String(n))}</Seg>
                            ))}
                        </Row>
                    )}
                    <div className="flex items-center gap-3">
                        <span className="w-[72px] shrink-0 text-[12.5px] font-medium text-ink-3">{t("chat.attach.matchInviteTarget")}</span>
                        <div className="flex-1 flex items-center gap-1.5 p-1 rounded-xl bg-surface-2">
                            <button
                                type="button" onClick={() => bump(-1)} disabled={target <= MIN_TARGET} aria-label={t("chat.attach.matchInviteMinus")}
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-2 disabled:opacity-35 active:bg-surface-3"
                            ><LucideMinus className="w-4 h-4" /></button>
                            <span className="flex-1 text-center rk-num text-[17px] font-bold text-ink-1">{target}</span>
                            <button
                                type="button" onClick={() => bump(1)} disabled={target >= MAX_TARGET} aria-label={t("chat.attach.matchInvitePlus")}
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-2 disabled:opacity-35 active:bg-surface-3"
                            ><LucidePlus className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <p className="text-[11.5px] font-medium text-ink-4 leading-relaxed pt-0.5">{t("chat.attach.matchInviteNote")}</p>
                </div>
                <div className="px-5 pt-4 pb-5">
                    <button
                        type="button" disabled={busy} onClick={() => onPick({ gameType, seats: seatsFixed ?? seats, target })}
                        className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {busy && <LucideLoader2 className="w-4 h-4 animate-spin" />}
                        {t("chat.attach.matchInviteGo")}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
