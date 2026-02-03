import { LucideFlagTriangleRight, LucideUsers } from "lucide-react";

export function MyCrewCard() {
    return (
        <div className="mb-4 relative z-10">
            <div className="bg-white/[0.03] border border-white/5 rounded-[1.5rem] p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <LucideFlagTriangleRight className="w-5 h-5 text-[#64DD17]" />
                        <span className="text-lg font-extrabold text-white">MY CREW</span>
                    </div>
                    <span className="text-[10px] font-semibold text-white/40">더보기</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center">
                        <LucideUsers className="w-6 h-6 text-white/60" />
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-semibold text-white">강남 3040 골프</div>
                        <div className="text-xs text-white/40 mt-0.5">멤버 24명 • 서울 강남구</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-semibold text-[#64DD17] uppercase tracking-widest">RANKING</div>
                        <div className="text-xl font-extrabold text-white">#4</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
