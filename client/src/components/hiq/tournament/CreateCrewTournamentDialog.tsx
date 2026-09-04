import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";

// 대회 개설 폼. 필드를 일부러 적게 뒀다 —
// 목표 점수·핸디캡은 여기서 정하지 않는다(오너 결정 2026-08-30): 대진에서 경기를 시작하면
// 기존 매칭 화면이 열리고 거기서 그때그때 맞춘다. 대회가 규칙을 미리 못 박으면
// 실력 차가 큰 크루원끼리 붙을 때 매번 대회를 다시 만들어야 한다.

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
}

const SIZES = [4, 8, 16] as const;

export function CreateCrewTournamentDialog({ open, onOpenChange, crewId }: Props) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [gameType, setGameType] = useState<"3c" | "4c">("3c");
    const [maxPlayers, setMaxPlayers] = useState<number>(8);
    const [prize, setPrize] = useState("");
    // 형식은 인원으로 자동 전환하지 않고 크루장이 고른다(오너 결정 2026-09-03). 둘 다 4명부터.
    const [format, setFormat] = useState<"knockout" | "league">("knockout");
    // 한 대진을 몇 판으로 가리는가 — 3판이면 2선승. 유저 건의 "몇전 몇승이 승리인가요?"
    const [bestOf, setBestOf] = useState<1 | 3 | 5>(1);

    const reset = () => {
        setTitle(""); setDescription(""); setGameType("3c"); setMaxPlayers(8); setPrize(""); setFormat("knockout"); setBestOf(1);
    };

    const createM = useMutation({
        mutationFn: (body: any) => apiRequest(`/api/hiq/crews/${crewId}/tournaments`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
        onSuccess: () => {
            toast({ title: t("crewTournament.created") });
            qc.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/tournaments`] });
            onOpenChange(false);
            reset();
        },
        onError: (e: any) => toast({
            title: t("crewTournament.createFail"),
            description: e?.message,
            variant: "destructive",
        }),
    });

    const submit = () => {
        if (!title.trim()) {
            toast({ title: t("crewTournament.needTitle"), variant: "destructive" });
            return;
        }
        createM.mutate({
            title: title.trim(),
            description: description.trim() || null,
            gameType,
            maxPlayers,
            format,
            bestOf,
            prize: prize.trim() || null,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* 항목이 6개라 폰 세로 화면을 넘는다 — 본문만 스크롤하고 제목·개설 버튼은 고정한다.
                안 그러면 맨 아래 "대회 열기" 버튼이 화면 밖으로 잘려 누를 수가 없다. */}
            <DialogContent aria-describedby={undefined} className="max-w-[420px] max-h-[88dvh] rounded-card flex flex-col gap-0 p-0">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
                    <DialogTitle>{t("crewTournament.newTitle")}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="ct-title">{t("crewTournament.fieldTitle")}</Label>
                        <Input
                            id="ct-title" value={title} maxLength={60}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t("crewTournament.titlePlaceholder")}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t("crewTournament.fieldGameType")}</Label>
                        <div className="flex gap-2">
                            {(["3c", "4c"] as const).map((g) => (
                                <button
                                    key={g} type="button" onClick={() => setGameType(g)}
                                    className={cn(
                                        "flex-1 h-11 rounded-xl border flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors",
                                        gameType === g ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                                    )}
                                >
                                    <BallDot type={g} size={13} />
                                    {g === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t("crewTournament.fieldSize")}</Label>
                        <div className="flex gap-2">
                            {SIZES.map((n) => (
                                <button
                                    key={n} type="button" onClick={() => setMaxPlayers(n)}
                                    className={cn(
                                        "flex-1 h-11 rounded-xl border text-[13px] font-semibold rk-num transition-colors",
                                        maxPlayers === n ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                                    )}
                                >
                                    {t("crewTournament.sizeN").replace("{n}", String(n))}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11.5px] text-ink-4 leading-relaxed">{t("crewTournament.sizeHint")}</p>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t("crewTournament.fieldFormat")}</Label>
                        <div className="flex gap-2">
                            {(["knockout", "league"] as const).map((f) => (
                                <button
                                    key={f} type="button" onClick={() => setFormat(f)}
                                    className={cn(
                                        "flex-1 h-11 rounded-xl border text-[13px] font-semibold transition-colors",
                                        format === f ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                                    )}
                                >
                                    {f === "knockout" ? t("crewTournament.knockout") : t("crewTournament.league")}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11.5px] text-ink-4 leading-relaxed">{t("crewTournament.minPlayersHint")}</p>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t("crewTournament.fieldBestOf")}</Label>
                        <div className="flex gap-2">
                            {([1, 3, 5] as const).map((n) => (
                                <button
                                    key={n} type="button" onClick={() => setBestOf(n)}
                                    className={cn(
                                        "flex-1 h-11 rounded-xl border text-[13px] font-semibold rk-num transition-colors",
                                        bestOf === n ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                                    )}
                                >
                                    {t("crewTournament.bestOfN").replace("{n}", String(n))}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11.5px] text-ink-4 leading-relaxed">{t("crewTournament.bestOfHint")}</p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ct-prize">{t("crewTournament.fieldPrize")}</Label>
                        <Input
                            id="ct-prize" value={prize} maxLength={100}
                            onChange={(e) => setPrize(e.target.value)}
                            placeholder={t("crewTournament.prizePlaceholder")}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ct-desc">{t("crewTournament.fieldDesc")}</Label>
                        <Textarea
                            id="ct-desc" value={description} maxLength={500} rows={3}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t("crewTournament.descPlaceholder")}
                        />
                    </div>
                </div>

                <DialogFooter className="shrink-0 px-6 pb-6 pt-3">
                    <Button
                        onClick={submit} disabled={createM.isPending}
                        className="w-full h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {t("crewTournament.createSubmit")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
