/**
 * 온라인 대전 — 대화하다 바로 한 판(2026-09-23 오너: "친구 초대·같이하기를 엄청 간소화").
 *
 * 고르는 것은 셋뿐이고 기본값이 다 채워져 있다 — 그대로 눌러도 된다.
 *   종목(3쿠션·4구) · 테이블(대대·중대) · 목표(핸디전·같은 점수)
 * 나머지(비밀번호 없음·이닝 제한 없음·기본 규칙)는 서버가 방 만들기와 같은 값으로 맞춘다.
 * 핸디전이면 **상대가 들어오는 순간** 두 사람의 온라인 기록으로 각자 목표가 정해진다(자기신고 다마수는 안 쓴다).
 */
import { useEffect, useState } from "react";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { defaultTableFor, type TableId } from "@/sim/setupPresets";
import type { GameType } from "@shared/sim/rules/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface SimInvitePick { gameType: GameType; tableId: TableId; handicap: boolean }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-[64px] shrink-0 text-[12.5px] font-medium text-ink-3">{label}</span>
            <div className="flex-1 grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-2">{children}</div>
        </div>
    );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on}
            className={cn("h-10 rounded-lg text-[13.5px] font-semibold transition-colors", on ? "bg-surface-0 text-ink-1 shadow-sm" : "text-ink-3")}
        >{children}</button>
    );
}

export function SimInviteSheet({ open, onOpenChange, busy, onPick }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    busy?: boolean;
    onPick: (pick: SimInvitePick) => void;
}) {
    const { t } = useT();
    const [gameType, setGameType] = useState<GameType>("3c");
    const [tableId, setTableId] = useState<TableId>(defaultTableFor("3c"));
    const [handicap, setHandicap] = useState(true);
    // 종목을 바꾸면 테이블도 그 종목의 기본으로(3쿠션 대대 · 4구 중대) — 방 만들기 화면과 같은 규칙.
    const pickGame = (g: GameType) => { setGameType(g); setTableId(defaultTableFor(g)); };
    // 열 때마다 기본값으로 돌린다 — 앞서 고른 값이 남아 있으면 다음 방을 엉뚱하게 만든다.
    useEffect(() => { if (open) { setGameType("3c"); setTableId(defaultTableFor("3c")); setHandicap(true); } }, [open]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.simInvite")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3 leading-relaxed">{t("chat.attach.simInvitePick")}</SheetDescription>
                </SheetHeader>
                <div className="px-5 space-y-2.5">
                    <Row label={t("chat.attach.simInviteGame")}>
                        <Seg on={gameType === "3c"} onClick={() => pickGame("3c")}>{t("chat.attach.threeBall")}</Seg>
                        <Seg on={gameType === "4c"} onClick={() => pickGame("4c")}>{t("chat.attach.fourBall")}</Seg>
                    </Row>
                    <Row label={t("chat.attach.simInviteTable")}>
                        <Seg on={tableId === "DAEDAE"} onClick={() => setTableId("DAEDAE")}>{t("sim.setup.tableDaedae")}</Seg>
                        <Seg on={tableId === "JUNGDAE_KR"} onClick={() => setTableId("JUNGDAE_KR")}>{t("sim.setup.tableJungdae")}</Seg>
                    </Row>
                    <Row label={t("chat.attach.simInviteTarget")}>
                        <Seg on={handicap} onClick={() => setHandicap(true)}>{t("chat.card.handicap")}</Seg>
                        <Seg on={!handicap} onClick={() => setHandicap(false)}>{t("chat.attach.simInviteSame")}</Seg>
                    </Row>
                    <p className="text-[11.5px] font-medium text-ink-4 leading-relaxed pt-0.5">
                        {handicap ? t("chat.attach.simInviteHandicapNote") : t("chat.attach.simInviteSameNote")}
                    </p>
                </div>
                <div className="px-5 pt-4 pb-5">
                    <button
                        type="button" disabled={busy} onClick={() => onPick({ gameType, tableId, handicap })}
                        className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {busy && <LucideLoader2 className="w-4 h-4 animate-spin" />}
                        {t("chat.attach.simInviteGo")}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
