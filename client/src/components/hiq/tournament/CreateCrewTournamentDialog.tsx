import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";
import { CREW_BTN, CREW_TEXT } from "@/components/hiq/crew-ui";
import { checkTournamentDates } from "@shared/crewTournamentRules";
import { dateToKstInput, kstInputToDate } from "@shared/crewTime";
import { KstDateTimeField } from "./KstDateTimeField";

// 대회 개설·고치기 폼. 필드를 일부러 적게 뒀다 —
// 목표 점수·핸디캡은 여기서 정하지 않는다(오너 결정 2026-08-30): 대진에서 경기를 시작하면
// 기존 매칭 화면이 열리고 거기서 그때그때 맞춘다. 대회가 규칙을 미리 못 박으면
// 실력 차가 큰 크루원끼리 붙을 때 매번 대회를 다시 만들어야 한다.
//
// 2026-09-26: 접수 마감·시작 일시(선택, 한국 시각)를 받는다. 서버는 원래 받고 있었고(접수 마감이 지나면
// 참가 신청을 막는다) 화면에만 칸이 없었다. 고치기(tournament 를 넘기면)는 이름·안내·상품·일시만 —
// 종목·정원·판 수는 이미 신청한 사람과 대진에 묶여 있어 바꾸지 않는다.

export interface EditableTournament {
    id: string;
    title: string;
    description: string | null;
    prize: string | null;
    recruitEnd: string | null;
    startAt: string | null;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    /** 넘기면 고치기 모드. */
    tournament?: EditableTournament | null;
}

// 2의 거듭제곱만 — 대진표가 딱 떨어진다. 2인은 곧 단판(또는 N판) 승부다.
const SIZES = [2, 4, 8, 16] as const;

const toInputs = (v: string | null | undefined) => (v ? dateToKstInput(v) : { date: "", time: "" });

export function CreateCrewTournamentDialog({ open, onOpenChange, crewId, tournament }: Props) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const editing = !!tournament;

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [gameType, setGameType] = useState<"3c" | "4c">("3c");
    const [maxPlayers, setMaxPlayers] = useState<number>(8);
    const [prize, setPrize] = useState("");
    // 한 대진을 몇 판으로 가리는가 — 3판이면 2선승. 유저 건의 "몇전 몇승이 승리인가요?"
    const [bestOf, setBestOf] = useState<1 | 3 | 5>(1);
    const [recruitDate, setRecruitDate] = useState("");
    const [recruitTime, setRecruitTime] = useState("23:59");
    const [startDate, setStartDate] = useState("");
    const [startTime, setStartTime] = useState("19:00");

    const reset = () => {
        setTitle(""); setDescription(""); setGameType("3c"); setMaxPlayers(8); setPrize(""); setBestOf(1);
        setRecruitDate(""); setRecruitTime("23:59"); setStartDate(""); setStartTime("19:00");
    };

    // 고치기로 열 때 지금 값을 채운다.
    useEffect(() => {
        if (!open || !tournament) return;
        setTitle(tournament.title);
        setDescription(tournament.description ?? "");
        setPrize(tournament.prize ?? "");
        const r = toInputs(tournament.recruitEnd);
        setRecruitDate(r.date); setRecruitTime(r.time || "23:59");
        const s = toInputs(tournament.startAt);
        setStartDate(s.date); setStartTime(s.time || "19:00");
    }, [open, tournament]);

    const listKey = `/api/hiq/crews/${crewId}/tournaments`;
    const saveM = useMutation({
        mutationFn: (body: any) => editing
            ? apiRequest(`${listKey}/${tournament!.id}`, { method: "PATCH", body: JSON.stringify(body) })
            : apiRequest(listKey, { method: "POST", body: JSON.stringify(body) }),
        onSuccess: () => {
            toast({ title: editing ? t("crewTourney.saved") : t("crewTournament.created") });
            qc.invalidateQueries({ queryKey: [listKey] });
            if (editing) qc.invalidateQueries({ queryKey: [`${listKey}/${tournament!.id}`] });
            onOpenChange(false);
            if (!editing) reset();
        },
        onError: (e: any) => toast({
            title: editing ? t("crewTournament.actionFail") : t("crewTournament.createFail"),
            description: e?.message,
            variant: "destructive",
        }),
    });

    const submit = () => {
        if (!title.trim()) {
            toast({ title: t("crewTournament.needTitle"), variant: "destructive" });
            return;
        }
        const recruitEnd = recruitDate ? kstInputToDate(recruitDate, recruitTime) : null;
        const startAt = startDate ? kstInputToDate(startDate, startTime) : null;
        if ((recruitDate && !recruitEnd) || (startDate && !startAt)) {
            toast({ title: t("crewTourney.dateInvalid"), variant: "destructive" });
            return;
        }
        // 고치기에서 그대로 둔 옛 접수 마감은 지났어도 통과(서버와 같은 규칙).
        const recruitChanged = !editing || (recruitEnd?.getTime() ?? null) !== (tournament?.recruitEnd ? new Date(tournament.recruitEnd).getTime() : null);
        const err = checkTournamentDates({ recruitEnd, startAt }, Date.now(), recruitChanged);
        if (err) {
            toast({
                title: err === "recruitEndPast" ? t("crewTourney.recruitEndPast")
                    : err === "startBeforeRecruitEnd" ? t("crewTourney.startBeforeRecruitEnd")
                        : t("crewTourney.dateInvalid"),
                variant: "destructive",
            });
            return;
        }
        const common = {
            title: title.trim(),
            description: description.trim() || null,
            prize: prize.trim() || null,
            recruitEnd: recruitEnd?.toISOString() ?? null,
            startAt: startAt?.toISOString() ?? null,
        };
        saveM.mutate(editing ? common : { ...common, gameType, maxPlayers, bestOf });
    };

    const seg = (on: boolean) => cn(
        "flex-1 h-11 rounded-tile border flex items-center justify-center gap-2 text-[13px] font-semibold rk-num transition-colors",
        on ? "border-brand bg-brand/10 text-ink-1" : "border-surface-line text-ink-3",
    );
    const today = dateToKstInput(Date.now()).date;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* 항목이 많아 폰 세로 화면을 넘는다 — 본문만 스크롤하고 제목·저장 버튼은 고정한다.
                안 그러면 맨 아래 "대회 열기" 버튼이 화면 밖으로 잘려 누를 수가 없다. */}
            <DialogContent aria-describedby={undefined} className="bg-surface-1 text-ink-1 max-w-[420px] max-h-[88dvh] rounded-card flex flex-col gap-0 p-0">
                <DialogHeader className="shrink-0 px-4 pt-5 pb-3 pr-14 text-left">
                    <DialogTitle className={CREW_TEXT.section}>{editing ? t("crewTourney.editTitle") : t("crewTournament.newTitle")}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ct-title" className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldTitle")}</Label>
                        <Input
                            id="ct-title" value={title} maxLength={60}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t("crewTournament.titlePlaceholder")}
                            className="h-12 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                        />
                    </div>

                    {!editing && (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldGameType")}</Label>
                                <div className="flex gap-2">
                                    {(["3c", "4c"] as const).map((g) => (
                                        <button key={g} type="button" aria-pressed={gameType === g} onClick={() => setGameType(g)} className={seg(gameType === g)}>
                                            <BallDot type={g} size={13} />
                                            {g === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldSize")}</Label>
                                <div className="flex gap-2">
                                    {SIZES.map((n) => (
                                        <button key={n} type="button" aria-pressed={maxPlayers === n} onClick={() => setMaxPlayers(n)} className={seg(maxPlayers === n)}>
                                            {t("crewTournament.sizeN").replace("{n}", String(n))}
                                        </button>
                                    ))}
                                </div>
                                {/* 2인은 설명이 필요 없다 — 정원 2가 곧 둘이 붙는다는 뜻이다(오너 지적 2026-09-04). */}
                                {maxPlayers !== 2 && <p className={cn(CREW_TEXT.caption, "leading-relaxed")}>{t("crewTournament.sizeHint")}</p>}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldBestOf")}</Label>
                                <div className="flex gap-2">
                                    {([1, 3, 5] as const).map((n) => (
                                        <button key={n} type="button" aria-pressed={bestOf === n} onClick={() => setBestOf(n)} className={seg(bestOf === n)}>
                                            {n === 1 ? t("crewTournament.bestOf1") : t("crewTournament.bestOfWin").replace("{n}", String(n)).replace("{w}", String(Math.ceil(n / 2)))}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    <KstDateTimeField
                        id="ct-recruit" label={t("crewTourney.fieldRecruitEnd")}
                        date={recruitDate} time={recruitTime} onDate={setRecruitDate} onTime={setRecruitTime} min={today}
                    />
                    <KstDateTimeField
                        id="ct-start" label={t("crewTourney.fieldStartAt")}
                        date={startDate} time={startTime} onDate={setStartDate} onTime={setStartTime} min={recruitDate || today}
                    />
                    <p className={cn(CREW_TEXT.caption, "-mt-2 leading-relaxed")}>{t("crewTourney.dateHint")}</p>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ct-prize" className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldPrize")}</Label>
                        <Input
                            id="ct-prize" value={prize} maxLength={100}
                            onChange={(e) => setPrize(e.target.value)}
                            placeholder={t("crewTournament.prizePlaceholder")}
                            className="h-12 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 pb-2">
                        <Label htmlFor="ct-desc" className="text-[13px] font-semibold text-ink-2">{t("crewTournament.fieldDesc")}</Label>
                        <Textarea
                            id="ct-desc" value={description} maxLength={500} rows={3}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t("crewTournament.descPlaceholder")}
                            className="text-[15px] bg-surface-2 border-surface-line rounded-tile"
                        />
                    </div>
                </div>

                <DialogFooter className="shrink-0 px-4 pb-4 pt-3 border-t border-surface-line">
                    <button type="button" onClick={submit} disabled={saveM.isPending} className={cn(CREW_BTN.primary, "w-full")}>
                        {editing ? t("crewTourney.save") : t("crewTournament.createSubmit")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
