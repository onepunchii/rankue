import { cn } from "@/lib/utils";

interface MembershipTabsProps {
    activeTab: 'COURSE' | 'BENEFIT' | 'MARKET' | 'CALC';
    onChange: (tab: 'COURSE' | 'BENEFIT' | 'MARKET' | 'CALC') => void;
    category?: 'Golf' | 'Condo' | 'Fitness';
}

export function MembershipTabs({ activeTab, onChange, category = 'Golf' }: MembershipTabsProps) {
    const courseLabel = category === 'Condo' ? '콘도 소개' : (category === 'Fitness' ? '시설 안내' : '코스 가이드');

    const tabs = [
        { id: 'COURSE', label: courseLabel },
        { id: 'BENEFIT', label: '회원권 혜택' },
        { id: 'MARKET', label: '실시간 시세' },
        { id: 'CALC', label: '비용 계산' }
    ] as const;

    return (
        <div className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-xl border-b border-white/10 px-0 flex justify-between">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        "flex-1 py-4 text-xs font-bold transition-all relative shrink-0 text-center tracking-tight",
                        activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/60"
                    )}
                >
                    {tab.label}
                    {activeTab === tab.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#64DD17] shadow-[0_0_8px_#64DD17] rounded-full" />}
                </button>
            ))}
        </div>
    );
}
