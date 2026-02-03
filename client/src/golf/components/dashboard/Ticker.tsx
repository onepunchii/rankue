export function Ticker() {
    return (
        <div className="mb-4 overflow-hidden rounded-xl bg-white/[0.02] border border-white/5 py-2 relative z-10">
            <div className="flex gap-8 animate-marquee whitespace-nowrap px-4">
                <span className="text-xs font-medium text-white/60 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#64DD17] animate-pulse" />
                    [기흥CC] 내일 08:00 1명 급구 (그린피 지원)
                </span>
                <span className="text-xs font-medium text-white/60 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#64DD17] animate-pulse" />
                    [스카이72] 주말 조인 모집합니다
                </span>
            </div>
        </div>
    );
}
