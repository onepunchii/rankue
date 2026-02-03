import { LucideTimer, LucideMapPin, LucideChevronRight } from 'lucide-react';

export const PresaleListItem = ({ item }: { item: any }) => (
    <div className="group relative rounded-[2rem] overflow-hidden bg-[#18181b] border border-white/10 active:scale-[0.98] transition-transform cursor-pointer">
        {/* Hero Image */}
        <div className="h-52 w-full relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-transparent to-transparent z-10" />
            <img src={item.image} alt="" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute top-4 right-4 z-20">
                <span className="px-3 py-1.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase shadow-lg flex items-center gap-1.5 animate-pulse">
                    <LucideTimer className="w-3 h-3" /> {item.dDay}
                </span>
            </div>
        </div>

        {/* Info Body */}
        <div className="p-6 pt-0 relative z-20 -mt-8">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[#64DD17] text-[10px] font-black uppercase tracking-widest border border-[#64DD17]/30 px-2 py-1 rounded bg-[#64DD17]/10 backdrop-blur-md">{item.tag}</span>
                <span className="text-white/60 text-[10px] flex items-center gap-1 bg-black/40 px-2 py-1 rounded backdrop-blur-md"><LucideMapPin className="w-3 h-3" /> {item.region}</span>
            </div>
            <h3 className="text-2xl font-black mb-1 leading-tight text-white">{item.name}</h3>
            <p className="text-sm text-white/60 mb-6 font-medium">{item.title}</p>

            <div className="flex items-center justify-between pt-5 border-t border-white/10">
                <div>
                    <div className="text-[10px] text-white/40 uppercase font-bold mb-0.5">분양가 (VAT 별도)</div>
                    <div className="text-xl font-black text-amber-400">{item.price}</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#64DD17] text-[#09090b] flex items-center justify-center shadow-[0_0_20px_rgba(100,221,23,0.4)] group-hover:scale-110 transition-transform">
                    <LucideChevronRight className="w-6 h-6" />
                </div>
            </div>
        </div>
    </div>
);
