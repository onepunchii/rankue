import { Link } from 'wouter';
import { LucideMapPin, LucideTag, LucideChevronRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
    MembershipItem,
    GolfMembership,
    CondoMembership,
    FitnessMembership,
    formatPrice,
    calculateTrend,
    extractClubName,
    getClubVariants,
    getPriceRange,
    CRAWLED_MEMBERSHIPS
} from '../../data/membershipData';

export const ResaleListItem = ({ item, useGrouping = true }: { item: MembershipItem, useGrouping?: boolean }) => {
    const trend = calculateTrend(item.id);
    const priceFormatted = formatPrice(item.price.current);

    // Extract region from address (first part before space)
    const address = item.info.Address || '-';
    const region = address !== '-'
        ? address.split(' ').slice(0, 2).join(' ')
        : '정보 확인중';

    // Helper to get type/roomType
    const itemType = item.category === 'Golf' ? (item as GolfMembership).golfSpec?.type :
        item.category === 'Condo' ? (item as CondoMembership).condoSpec?.roomType :
            item.category;

    // 그룹화 정보
    const clubName = extractClubName(item.name);
    const variants = getClubVariants(clubName, CRAWLED_MEMBERSHIPS);
    const hasMultipleVariants = variants.length > 1;
    const priceRange = getPriceRange(variants);

    return (
        <Link href={`/golf/membership/${item.id}`} className="block">
            <div className="p-5 rounded-3xl bg-[#18181b] border border-white/5 flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer hover:border-white/10 group">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center text-sm font-black border backdrop-blur-sm transition-colors shrink-0",
                        trend.status === 'UP' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                            trend.status === 'DOWN' ? "bg-blue-500/10 border-blue-500/20 text-blue-500" :
                                "bg-white/5 border-white/10 text-white/30"
                    )}>
                        {trend.status === 'UP' ? '▲' : trend.status === 'DOWN' ? '▼' : '-'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg leading-none text-white group-hover:text-[#64DD17] transition-colors mb-1.5 truncate">
                            {useGrouping ? clubName : item.name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 text-xs text-white/40">
                                <LucideMapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{region}</span>
                            </div>
                            {useGrouping && hasMultipleVariants && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#64DD17]/10 text-[#64DD17] border border-[#64DD17]/20 shrink-0 font-bold">
                                    {variants.length}종
                                </span>
                            )}
                            {!useGrouping && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5 shrink-0">
                                    {itemType}
                                </span>
                            )}
                            {item.category !== 'Golf' && (
                                <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-bold",
                                    item.category === 'Condo' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                        item.category === 'Fitness' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                            "bg-white/5 text-white/40 border-white/5"
                                )}>
                                    {item.category}
                                </span>
                            )}
                            {item.tags.includes('법인') && (
                                <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                                    <LucideTag className="w-2.5 h-2.5" />
                                    법인
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="text-right shrink-0 ml-3 flex items-center gap-2">
                    <div>
                        <div className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap">
                            {useGrouping && hasMultipleVariants ? priceRange : priceFormatted}
                        </div>
                        <div className={cn(
                            "text-xs font-bold mt-1",
                            trend.status === 'UP' ? "text-red-500" :
                                trend.status === 'DOWN' ? "text-blue-500" :
                                    "text-white/30"
                        )}>
                            {trend.change}
                        </div>
                    </div>
                    {useGrouping && hasMultipleVariants && (
                        <LucideChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
                    )}
                </div>
            </div>
        </Link>
    );
};
