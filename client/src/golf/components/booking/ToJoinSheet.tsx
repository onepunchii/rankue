/**
 * 조인으로 전환(2026-09-23 오너: "내가 올린 부킹 내역에서 조인 돌리기로 버튼이 있고
 * 그때 해당 옵션을 넣고 바로 조인으로 전환시키게" · 같은 날 "'조인으로 돌리기'가 아니라 그냥 '조인으로 전환'").
 *
 * 여기서 묻는 것은 하나다 — **이제부터 몇 자리를 더 받나**, 그리고 그 자리에 누구를 받나.
 * 올릴 때 묻지 않고 지금 묻는 이유: 부킹은 앱 밖에서도 팔린다. 몇 자리가 팔렸는지는 판 사람만 알고,
 * 그건 올리는 순간이 아니라 **팔린 뒤**에 아는 숫자다(BookingCreateSheet 머리말 참고).
 *
 * 2026-09-24: 앱에서 팔린 자리는 **앱이 안다**(승인된 신청의 인원 합 = item.joinApplied). 그건 묻지 않는다.
 * 그래서 칩은 '몇 자리 남았나요(1~4)' 가 아니라 **'몇 자리를 더 받나요(1 ~ 4-확정)'** 이고, 기본값은 그 상한이다 —
 * 오너가 말한 "2명이니깐 2명을 더" 가 한 번만 눌러도 되는 기본이 된다.
 * 자리 배열은 **서버가 만든다**(shared/golfJoin.conversionSlots). 화면이 보낸 배열을 믿으면
 * "두 자리 팔렸는데 네 자리 남았다"가 통과해 한 팀에 여섯 명을 받게 된다.
 *
 * 그림·문법은 이미 있는 것을 그대로 쓴다 — 자리 그림은 SeatDiagram(부킹 올리기에서 쓰던 그 그림),
 * 성별 토글과 자리 점은 조인 만들기(joinUi)의 것. 같은 개념이 화면마다 다르게 생기면 그게 새 학습이다.
 *
 * 되돌리기는 **없다.** 신청자가 붙은 뒤 부킹으로 되돌리면 그 사람들이 갈 곳이 없다 — 대신 전환 전에 한 줄로 알린다.
 * 강조색은 조인 주황 #FF6B00(옮겨 갈 곳의 색). 골프 테마가 .bg-white/.text-black 을 바꿔 끼우므로 리터럴 hex 로 쓴다.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { MAX_SLOTS, conversionSlots, convertibleSeats, type CostMode, type SlotGender } from "@shared/golfJoin";
import { GenderToggle, SlotDots } from "../join/joinUi";
import { SeatDiagram } from "./SeatDiagram";
import { MY_LISTINGS_QUERY_KEY } from "../../lib/myListings";

const ACCENT = "#FF6B00";

interface Props {
    /** 전환할 부킹. null 이면 시트가 닫힌 상태다. */
    item: any | null;
    onClose: () => void;
    /** 전환이 끝났다 — 목록을 조인 탭으로 옮기는 건 부르는 쪽이 한다. */
    onConverted?: (converted: any) => void;
}

const chip = (on: boolean) => cn(
    "h-9 px-3.5 rounded-full text-[13px] font-medium border transition-colors",
    on ? "bg-[#FF6B00] border-[#FF6B00] text-white" : "bg-white/[0.04] border-white/10 text-white/70",
);

export function ToJoinSheet({ item, onClose, onConverted }: Props) {
    const { toast } = useToast();
    const qc = useQueryClient();
    /** 앱에서 이미 팔린 자리(승인된 신청의 **인원 합**). 서버가 joinApplied 로 준다 — 묻지 않는다. */
    const sold = Math.max(0, Math.min(MAX_SLOTS, Number(item?.joinApplied ?? 0)));
    /** 더 받을 수 있는 자리 수의 상한. 네 자리가 다 팔렸으면 0이고, 그때는 버튼 자체가 안 뜬다. */
    const room = convertibleSeats(sold);
    /**
     * 이제부터 **더 받을** 자리 1 ~ room. 기본값은 상한 — 매니저가 보통 원하는 것은 "남은 만큼 다"이고,
     * 줄이는 건 앱 밖에서 따로 판 자리가 있을 때뿐이다.
     */
    const [open, setOpen] = useState(0);
    /** 남은 자리마다 받고 싶은 성별. 기본은 무관 — 매니저는 보통 아무나 채우면 된다. */
    const [genders, setGenders] = useState<SlotGender[]>(["ANY", "ANY", "ANY", "ANY"]);
    const [costMode, setCostMode] = useState<CostMode>("FIXED");

    // 시트를 열 때마다 상한으로 되돌린다 — 다른 글을 이어서 열었는데 앞 글의 숫자가 남아 있으면 그게 곧 오입력이다.
    useEffect(() => { if (item) setOpen(Math.max(1, room)); }, [item?.id, room]);

    /**
     * 미리보기용 자리 넷 — **서버가 만드는 것과 같은 함수**로 만든다(shared/golfJoin.conversionSlots).
     * 앱 밖에서 판 자리만 GUEST 고, 앱에서 팔린 자리는 OPEN 에 앉은 사람이다(그 사람이 취소하면 자리가 돌아온다).
     * 보내는 건 이 배열이 아니라 숫자 하나(more)다 — 서버가 팔린 자리를 다시 세어 자리를 만든다.
     */
    const slots = useMemo(() => conversionSlots(sold, open, genders.slice(0, open)) ?? [], [sold, open, genders]);
    const slotsOk = slots.length > 0 && open >= 1 && open <= room;

    const fee = Number(item?.greenFee ?? 0);
    const name: string = item ? (item.isBlind ? item.blindName : item.courseName) : "";

    const convert = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/golf/bookings/${item.id}/to-join`, { method: "POST", body: { more: open, genders: genders.slice(0, open), costMode } }),
        onSuccess: (converted: any) => {
            // 부킹 목록에서 빠지고 조인 목록에 들어간다 — 키가 셋이라 하나라도 빠뜨리면 방금 전환한 글이 양쪽에 남거나 사라진다.
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            qc.invalidateQueries({ queryKey: MY_LISTINGS_QUERY_KEY });
            toast({ title: `조인으로 전환했어요 — ${open}자리 모집`, description: "이제 조인 탭에 있어요. 신청이 오면 알려 드릴게요." });
            onConverted?.(converted);
            onClose();
        },
        onError: (e: any) => toast({ variant: "destructive", title: "전환하지 못했어요", description: e?.message }),
    });

    const label = "text-[12px] font-medium text-white/50";

    return (
        <Sheet open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-white/10 rounded-t-2xl p-0 max-h-[88dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-2 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white">조인으로 전환</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-white/50">
                        {item ? `${name} · ${kstDateLabel(item.datetime)} ${kstTime(item.datetime)}` : ""}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6">
                    {/* ① 몇 자리를 더 받나 — 상한은 앱이 안다(4 - 앱에서 팔린 자리) */}
                    <section className="space-y-3">
                        <span className={label}>몇 자리를 더 받나요</span>
                        <div className="flex gap-1.5">
                            {Array.from({ length: Math.max(1, room) }, (_, i) => i + 1).map((n) => (
                                <button key={n} type="button" onClick={() => setOpen(n)} aria-pressed={open === n} className={cn(chip(open === n), "flex-1")}>{n}자리</button>
                            ))}
                        </div>
                        {/* 고른 수가 그림으로 바로 보인다 — 앱에서 확정된 자리와 따로 판 자리를 구분해 그린다 */}
                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 pt-3 pb-2">
                            <SeatDiagram open={open} sold={sold} accent={ACCENT} openLabel="받을 자리" />
                            <p className="mt-1.5 text-center text-[11.5px] text-white/55 break-keep">
                                {[
                                    sold > 0 ? `앱에서 ${sold}자리 확정` : null,
                                    MAX_SLOTS - sold - open > 0 ? `${MAX_SLOTS - sold - open}자리는 따로 팔림` : null,
                                    `${open}자리를 조인으로 받아요`,
                                ].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                    </section>

                    {/* ② 누구를 받나 */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className={label}>받을 사람</span>
                            {/* 찬 자리는 '호스트'가 아니다 — 매장은 그 팀에서 치지 않는다(자리 목록에 HOST 를 아예 안 만든다) */}
                            <SlotDots slots={slots} filled={sold} size={20} hostLabel={null} />
                        </div>
                        <ul className="rounded-xl bg-white/[0.04] border border-white/[0.08] divide-y divide-white/[0.06]">
                            {Array.from({ length: open }, (_, i) => (
                                <li key={i} className="flex items-center gap-3 px-3.5 h-12">
                                    <span className="flex-1 text-[14px] text-[#FF8A33]">받을 자리 {i + 1}</span>
                                    <GenderToggle
                                        value={genders[i]}
                                        onChange={(v) => setGenders((a) => a.map((x, k) => (k === i ? v : x)))}
                                        allowAny
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* ③ 비용 — 기본은 적어 둔 그린피 그대로 */}
                    <section className="space-y-3">
                        <span className={label}>1인 비용</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setCostMode("FIXED")} className={chip(costMode === "FIXED")}>
                                그린피 그대로{fee > 0 ? ` ${fee.toLocaleString()}원` : ""}
                            </button>
                            <button type="button" onClick={() => setCostMode("SPLIT")} className={chip(costMode === "SPLIT")}>현장에서 1/N</button>
                        </div>
                        <p className="text-[12px] text-white/45 break-keep">
                            {costMode === "FIXED"
                                ? "적어 두신 1인 그린피로 각자 내요. 카트비·캐디피는 현장에서 네 명이 N빵해요."
                                : "금액을 적지 않고 현장에서 나눠요. 목록에는 '1/N' 으로 보여요."}
                        </p>
                    </section>

                    <p className="text-[12.5px] text-white/55 leading-relaxed break-keep rounded-xl bg-white/[0.03] border border-white/[0.07] px-3.5 py-3">
                        전환하면 이 글은 <span className="text-[#FF8A33]">조인 탭</span>으로 옮겨 가요. 되돌릴 수는 없어요 —
                        신청한 사람이 생긴 뒤 부킹으로 되돌리면 그분들이 갈 곳이 없기 때문이에요.
                    </p>
                </div>

                <div className="p-5 pt-0 shrink-0">
                    <button
                        type="button" onClick={() => convert.mutate()} disabled={!slotsOk || convert.isPending}
                        className={cn("w-full h-12 rounded-xl text-[15px] font-semibold text-white transition-colors", !slotsOk && "bg-white/[0.06] text-white/40")}
                        style={slotsOk ? { backgroundColor: ACCENT } : undefined}
                    >
                        {convert.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : `${open}자리로 전환`}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
