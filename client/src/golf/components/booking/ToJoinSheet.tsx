/**
 * 조인으로 전환(2026-09-23 오너: "내가 올린 부킹 내역에서 조인 돌리기로 버튼이 있고
 * 그때 해당 옵션을 넣고 바로 조인으로 전환시키게" · 같은 날 "'조인으로 돌리기'가 아니라 그냥 '조인으로 전환'").
 *
 * 여기서 묻는 것은 하나다 — **네 자리 중 몇 자리가 남았나**, 그리고 그 자리에 누구를 받나.
 * 올릴 때 묻지 않고 지금 묻는 이유: 부킹은 앱 밖에서 팔린다. 몇 자리가 팔렸는지는 판 사람만 알고,
 * 그건 올리는 순간이 아니라 **팔린 뒤**에 아는 숫자다(BookingCreateSheet 머리말 참고).
 *
 * 그림·문법은 이미 있는 것을 그대로 쓴다 — 자리 그림은 SeatDiagram(부킹 올리기에서 쓰던 그 그림),
 * 성별 토글과 자리 점은 조인 만들기(joinUi)의 것. 같은 개념이 화면마다 다르게 생기면 그게 새 학습이다.
 *
 * 되돌리기는 **없다.** 신청자가 붙은 뒤 부킹으로 되돌리면 그 사람들이 갈 곳이 없다 — 대신 전환 전에 한 줄로 알린다.
 * 강조색은 조인 주황 #FF6B00(옮겨 갈 곳의 색). 골프 테마가 .bg-white/.text-black 을 바꿔 끼우므로 리터럴 hex 로 쓴다.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { MAX_SLOTS, normalizeSlots, openSlotCount, type CostMode, type JoinSlot, type SlotGender } from "@shared/golfJoin";
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
    /**
     * 남은 자리(= 앱이 채울 자리) 1~4. **4도 있다**(2026-09-23 오너: 확정이 취소돼 한 자리도 안 팔린 티타임).
     * 예전엔 1~3 뿐이었다 — 자리 규칙이 첫 칸을 HOST 로 못 박아 OPEN 이 최대 3이었기 때문이고,
     * 그래서 아무도 안 판 티타임에도 "1자리는 이미 팔렸다"고 적혔다. 규칙을 넓혔다(shared/golfJoin.normalizeSlots).
     */
    const [open, setOpen] = useState(2);
    /** 남은 자리마다 받고 싶은 성별. 기본은 무관 — 매니저는 보통 아무나 채우면 된다. */
    const [genders, setGenders] = useState<SlotGender[]>(["ANY", "ANY", "ANY", "ANY"]);
    const [costMode, setCostMode] = useState<CostMode>("FIXED");

    /**
     * 자리 넷: 이미 팔린 자리만큼 GUEST + 남은 자리만큼 OPEN. **HOST 는 없다** —
     * 매장 매니저는 자기가 파는 팀에서 치지 않으니 여기 '호스트'를 앉히면 아무도 안 앉는 유령 자리다.
     * (예전엔 자리 규칙이 첫 칸을 HOST 로 요구해서 넣을 수밖에 없었고, 화면에서만 '이미 찬 자리'로 가려 그렸다.)
     * 그래서 팔린 자리가 0이면 자리 넷이 전부 OPEN 이 된다. 전환 글이라는 표시는 서버가 sellerType 을 남겨 준다.
     */
    const slots = useMemo<JoinSlot[]>(() => {
        const taken = MAX_SLOTS - open;   // 이미 팔린 자리
        return [
            ...Array.from({ length: taken }, (): JoinSlot => ({ role: "GUEST", gender: "ANY" })),
            ...genders.slice(0, open).map((g): JoinSlot => ({ role: "OPEN", gender: g })),
        ];
    }, [open, genders]);
    const slotsOk = normalizeSlots(slots) !== null;

    const fee = Number(item?.greenFee ?? 0);
    const name: string = item ? (item.isBlind ? item.blindName : item.courseName) : "";

    const convert = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/golf/bookings/${item.id}/to-join`, { method: "POST", body: { slots, costMode } }),
        onSuccess: (converted: any) => {
            // 부킹 목록에서 빠지고 조인 목록에 들어간다 — 키가 셋이라 하나라도 빠뜨리면 방금 전환한 글이 양쪽에 남거나 사라진다.
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            qc.invalidateQueries({ queryKey: MY_LISTINGS_QUERY_KEY });
            toast({ title: `조인으로 전환했어요 — ${openSlotCount(slots)}자리 모집`, description: "이제 조인 탭에 있어요. 신청이 오면 알려 드릴게요." });
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
                    {/* ① 몇 자리 남았나 */}
                    <section className="space-y-3">
                        <span className={label}>몇 자리 남았나요</span>
                        <div className="flex gap-1.5">
                            {[1, 2, 3, 4].map((n) => (
                                <button key={n} type="button" onClick={() => setOpen(n)} aria-pressed={open === n} className={cn(chip(open === n), "flex-1")}>{n}자리</button>
                            ))}
                        </div>
                        {/* 고른 수가 그림으로 바로 보인다 — "2자리 남았다"를 매니저가 눈으로 확인하는 자리다 */}
                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 pt-3 pb-2">
                            <SeatDiagram open={open} accent={ACCENT} openLabel="받을 자리" />
                            {/* 팔린 자리가 0이면 그 말을 하지 않는다 — "0자리는 이미 팔렸고" 는 거짓말에 가깝다 */}
                            <p className="mt-1.5 text-center text-[11.5px] text-white/55 break-keep">
                                {open === MAX_SLOTS
                                    ? "네 자리 모두 조인으로 받아요"
                                    : `${MAX_SLOTS - open}자리는 이미 팔렸고, ${open}자리를 조인으로 받아요`}
                            </p>
                        </div>
                    </section>

                    {/* ② 누구를 받나 */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className={label}>받을 사람</span>
                            {/* 찬 자리는 '호스트'가 아니다 — 매장은 그 팀에서 치지 않는다(자리 목록에 HOST 를 아예 안 만든다) */}
                            <SlotDots slots={slots} size={20} hostLabel={null} />
                        </div>
                        <ul className="rounded-xl bg-white/[0.04] border border-white/[0.08] divide-y divide-white/[0.06]">
                            {Array.from({ length: open }, (_, i) => (
                                <li key={i} className="flex items-center gap-3 px-3.5 h-12">
                                    <span className="flex-1 text-[14px] text-[#FF8A33]">남은 자리 {i + 1}</span>
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
