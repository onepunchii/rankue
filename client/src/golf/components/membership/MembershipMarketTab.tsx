import { cn } from "@/lib/utils";
import { formatPrice } from "../../data/membershipData";

interface MembershipMarketTabProps {
    data: any;
}

/**
 * 시세 탭 — 자료에 실제로 있는 값만 그린다: 현재 시세 · 연간 최고 · 연간 최저(useMembershipData 가 주는 것).
 *
 * 2026-10-06 에 뺀 것: 고정 그림 추이 그래프와 그 위의 평, 현재가에서 일정액을 더하고 빼 만든 양쪽 가격 카드와 대기 인원,
 * 난수로 만든 거래 내역. 전부 자료에 없는 값이었다.
 * 값이 없는 칸은 그리지 않는다 — 0 이나 '-' 로 채우지 않는다. 날짜도 자료 날짜를 알 때만 적는다.
 */
export function MembershipMarketTab({ data }: MembershipMarketTabProps) {
    const current: number | null = typeof data.currentPrice === "number" && data.currentPrice > 0 ? data.currentPrice : null;
    const yearRange = [
        { key: "high", label: "연간 최고", text: data.highPrice as string | null },
        { key: "low", label: "연간 최저", text: data.lowPrice as string | null },
    ].filter((cell) => !!cell.text);

    if (current == null && yearRange.length === 0) {
        return <p className="py-10 text-center text-[14px] text-[#FFFFFF66]">시세 자료가 없습니다.</p>;
    }

    return (
        <div className="space-y-3">
            {current != null && (
                <div className="bg-[#1A1A1A] rounded-2xl p-5 border border-[#FFFFFF0D]">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-bold text-[#FFFFFF66]">현재 시세</span>
                        {data.priceAsOfLabel && (
                            <span className="text-[12px] text-[#FFFFFF66]">{data.priceAsOfLabel}</span>
                        )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-[28px] leading-none font-bold tracking-tight text-[#FFFFFF] tabular-nums">{formatPrice(current)}</span>
                        <span className="text-[14px] font-bold text-[#FFFFFF66]">원</span>
                    </div>
                </div>
            )}

            {yearRange.length > 0 && (
                <div className={cn("grid gap-3", yearRange.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                    {yearRange.map((cell) => (
                        <div key={cell.key} className="bg-[#1A1A1A] rounded-2xl p-5 border border-[#FFFFFF0D]">
                            <div className="text-[12px] font-bold text-[#FFFFFF66]">{cell.label}</div>
                            <div className="mt-1.5 flex items-baseline gap-1">
                                <span className="text-[20px] leading-none font-bold tracking-tight text-[#FFFFFF] tabular-nums">{cell.text}</span>
                                <span className="text-[12px] font-bold text-[#FFFFFF66]">원</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
