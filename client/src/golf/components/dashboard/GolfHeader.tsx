import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LucideArrowLeftRight } from "lucide-react";
import { useSport } from "@/contexts/SportContext";

interface GolfHeaderProps {
    member: any; // 추후 HiqMember 타입으로 교체 권장
}

export function GolfHeader({ member }: GolfHeaderProps) {
    const { setSport } = useSport();

    return (
        <div className="flex items-center justify-between mb-8 relative z-10">
            <Button
                variant="ghost"
                className="p-0 hover:bg-transparent group"
                onClick={() => setSport('BILLIARDS')}
            >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md transition-all group-hover:border-[#64DD17]/50">
                    <div className="w-2 h-2 rounded-full bg-[#64DD17] shadow-[0_0_8px_#64DD17]" />
                    <span className="text-xs font-semibold text-white/80 group-hover:text-white">GOLF MODE</span>
                    <LucideArrowLeftRight className="w-3 h-3 text-white/40 group-hover:text-[#64DD17]" />
                </div>
            </Button>

            <div className="flex items-center gap-3">
                <div className="text-right">
                    <div className="text-[10px] font-extrabold text-[#64DD17] uppercase tracking-widest">
                        {member?.golfHandicap > 0 ? `+${member.golfHandicap}` : 'SCRATCH'}
                    </div>
                    <div className="text-sm font-semibold text-white">
                        {member?.nickname || member?.name}
                    </div>
                </div>
                <Avatar className="w-10 h-10 border-2 border-[#64DD17]/20">
                    <AvatarImage src={member?.profileImageUrl} />
                    <AvatarFallback className="bg-[#1a1a1a] text-[#64DD17] font-bold">
                        {member?.name?.[0]}
                    </AvatarFallback>
                </Avatar>
            </div>
        </div>
    );
}
