import { useMemo } from 'react';
import {
    CRAWLED_MEMBERSHIPS,
    calculateTrend,
    formatPrice,
    extractClubName,
    getClubVariants,
    extractVariantType
} from '../data/membershipData';

export function useMembershipData(membershipId: string) {
    const membership = useMemo(() =>
        CRAWLED_MEMBERSHIPS.find(m => m.id === membershipId) || CRAWLED_MEMBERSHIPS[0],
        [membershipId]);

    const clubName = useMemo(() => extractClubName(membership.name), [membership.name]);
    const variants = useMemo(() => getClubVariants(clubName, CRAWLED_MEMBERSHIPS), [clubName]);
    const currentVariantType = useMemo(() => extractVariantType(membership.name), [membership.name]);

    const hybridData = useMemo(() => {
        const trend = calculateTrend(membership.id);
        const currentPrice = membership.priceValue;
        const changeRate = typeof trend.changeRate === 'string' ? parseFloat(trend.changeRate) : trend.changeRate;
        const changeAmount = Math.floor(currentPrice * (changeRate / 100));

        const region = membership.clubInfo.address !== '-'
            ? membership.clubInfo.address.split(' ').slice(0, 2).join(' ')
            : '정보 확인중';

        return {
            id: membership.id,
            name: membership.name,
            type: membership.type,
            category: membership.category,
            courseType: membership.category,
            region: region,
            originalRegion: region.split(' ')[0],
            holes: membership.clubInfo.holes || "-",
            grass: "-",
            imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=2070",
            phone: membership.clubInfo.website || "-",
            tags: membership.tags.length > 0 ? membership.tags.map(t => `#${t}`) : ["#프리미엄"],
            difficulty: "-",
            difficultyDesc: "코스 상세 분석은 회원 가입 후 확인하실 수 있습니다.",
            specs: { speed: 0, fee: 0 },
            currentPrice: currentPrice,
            changeAmount: changeAmount,
            changeRate: changeRate.toFixed(2),
            status: trend.status,
            trendData: [160, 162, 158, 165, 170, 172, 168, 175, 180, 182, 185],
            buyPrice: formatPrice(currentPrice - 5000000),
            sellPrice: formatPrice(currentPrice + 5000000),
            conditions: ["상세 조건은 문의 바랍니다."],
            greenFee: membership.greenFee || {
                member: 0,
                nonMember: 0,
                weekendMember: 0,
                weekendNonMember: 0
            },
            fees: {
                transfer: membership.fees.transfer,
                commissionRate: membership.fees.commission,
                taxRate: membership.fees.taxRate,
                caddy: membership.fees.caddy,
                cart: membership.fees.cart
            },
            clubInfo: membership.clubInfo,
            openDate: membership.clubInfo.openDate,
            address: membership.clubInfo.address
        };
    }, [membership]);

    return {
        membership,
        variants,
        currentVariantType,
        hybridData
    };
}
