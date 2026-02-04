import { LucideChevronLeft, LucideStar, LucideCamera, LucideCrown } from "lucide-react";

interface MembershipHeroProps {
    data: any;
    onBack: () => void;
}

export function MembershipHero({ data, onBack }: MembershipHeroProps) {
    return (
        <header className="relative h-[40vh] overflow-hidden">
            <div className="w-full h-full relative">
                <img
                    src={data.imageUrl}
                    className="w-full h-full object-cover"
                    alt={data.name}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#050505]" />
            </div>

            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-30">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-90">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex gap-2">
                    <button className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white active:scale-90"><LucideStar className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white active:scale-90"><LucideCamera className="w-5 h-5" /></button>
                </div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 px-6 z-30 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2 opacity-90">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-amber-600 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                        <LucideCrown className="w-2.5 h-2.5 text-amber-950 fill-amber-950" />
                        <span className="text-[8px] font-black text-amber-950 uppercase tracking-widest">RANKUE 60</span>
                    </div>
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em] border border-white/10 px-2 py-0.5 rounded backdrop-blur-md">{data.region}</span>
                </div>
                <h1 className="text-4xl font-black tracking-tighter drop-shadow-2xl text-white">
                    {data.name}
                </h1>
            </div>
        </header>
    );
}
