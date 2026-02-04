import { LucidePhone } from "lucide-react";

interface MembershipActionFooterProps {
    onBuySell: () => void;
    phone: string;
}

export function MembershipActionFooter({ onBuySell, phone }: MembershipActionFooterProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-[#050505]/80 backdrop-blur-xl border-t border-white/10 flex gap-4 z-50 pb-8">
            <a
                href={`tel:${phone}`}
                className="flex-[0.8] h-14 rounded-2xl bg-[#1A1A1A] text-white font-bold text-sm border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors active:scale-95"
            >
                <LucidePhone className="w-4 h-4" />
                문의
            </a>
            <button
                onClick={onBuySell}
                className="flex-[1.2] h-14 rounded-2xl bg-[#64DD17] text-[#050505] font-black text-lg flex items-center justify-center shadow-[0_0_20px_rgba(100,221,23,0.2)] hover:bg-[#52c41a] transition-all active:scale-95"
            >
                매수/매도 신청
            </button>
        </div>
    );
}
