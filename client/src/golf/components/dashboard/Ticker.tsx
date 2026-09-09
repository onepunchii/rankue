import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { kstDateKey, kstDateLabel, kstTime } from "@/lib/kst";
import { DATE_STRIP_DAYS } from "../../constants/booking";

export function Ticker() {
    const [, setLocation] = useLocation();
    const { data: joins } = useQuery({
        queryKey: ["/api/hiq/golf/bookings", "ticker-joins"],
        queryFn: async () => {
            // 목록 화면의 날짜 띠와 같은 범위. 더 멀리 불러오면 눌렀을 때 갈 칩이 없다.
            const startStr = kstDateKey(Date.now());
            const endStr = kstDateKey(Date.now() + (DATE_STRIP_DAYS - 1) * 24 * 60 * 60 * 1000);

            return apiRequest(`/api/hiq/golf/bookings?listingType=JOIN&startDate=${startStr}&endDate=${endStr}`);
        },
        refetchInterval: 60000 // Refresh every minute
    });

    const displayItems = joins && joins.length > 0 ? joins : [
        { id: 'demo1', courseName: '기흥CC', datetime: new Date().toISOString(), joinHeadcount: 1, comment: '그린피 지원' },
        { id: 'demo2', courseName: '스카이72', datetime: new Date().toISOString(), joinHeadcount: 2, comment: '주말 조인 모집합니다' }
    ];

    return (
        <div className="mb-4 overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 py-2 relative z-10 text-white/60">
            <div className="flex gap-8 animate-marquee whitespace-nowrap px-4">
                {displayItems.map((item: any) => (
                    <span
                        key={item.id}
                        onClick={() => {
                            const date = kstDateKey(item.datetime);
                            setLocation(`/golf/booking-list?date=${date}&highlight=${item.id}&view=JOIN`);
                        }}
                        className="text-xs font-medium flex items-center gap-2 cursor-pointer hover:text-white transition-colors hover:bg-white/5 py-1 px-2 rounded-lg"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#64DD17] animate-pulse" />
                        <span className="text-[#64DD17] font-bold">[{item.courseName}]</span>
                        <span>
                            {kstDateLabel(item.datetime, { month: 'numeric', day: 'numeric' })}
                            {" "}
                            {kstTime(item.datetime)}
                        </span>
                        <span>{item.joinHeadcount ? `${item.joinHeadcount}명` : ''}</span>
                        <span className="opacity-80 ">{item.comment || "조인 모집"}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
