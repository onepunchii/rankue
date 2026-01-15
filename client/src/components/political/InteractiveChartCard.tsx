import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MapPin, User, Users } from "lucide-react";

// --- Types ---
type TabType = "TOTAL" | "GENDER" | "AGE" | "REGION";

export interface ChartDataPoint {
    label: string; // e.g., 'Positive', 'Democratic Party', etc.
    value: number; // Percentage (0-100)
    color: string; // Hex code or Tailwind color class usually handled by parent, but here we expect mapped colors or handled internally
    twColorClass?: string; // e.g. text-emerald-400
    icon?: React.ReactNode;
}

interface InteractiveChartCardProps {
    title: string;
    subTitle: string;
    icon: React.ReactNode;
    data: ChartDataPoint[]; // Total aggregated data
    type: "PRESIDENTIAL" | "PARTY" | "PRIORITY";
    // Real breakdown data from API
    genderBreakdown?: any;
    ageBreakdown?: any;
    regionBreakdown?: any;
}

// --- Mock Data Generators (Simulating Backend) ---
const REGIONS = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

const AGE_GROUPS = ["20대", "30대", "40대", "50대", "60대+"];

const generateBreakdown = (baseData: ChartDataPoint[], type: "GENDER" | "AGE" | "REGION") => {
    // Simple variance generator to create realistic-looking sub-data from the total
    const variance = (baseVal: number) => {
        const raw = baseVal + (Math.random() * 20 - 10);
        return Math.max(0, Math.min(100, Math.round(raw)));
    };

    if (type === "GENDER") {
        return {
            "남성": baseData.map(d => ({ ...d, value: variance(d.value) })),
            "여성": baseData.map(d => ({ ...d, value: variance(d.value) })),
        };
    }
    if (type === "AGE") {
        const result: any = {};
        AGE_GROUPS.forEach(age => {
            result[age] = baseData.map(d => ({ ...d, value: variance(d.value) }));
        });
        return result;
    }
    if (type === "REGION") {
        const result: any = {};
        REGIONS.forEach(region => {
            result[region] = baseData.map(d => ({ ...d, value: variance(d.value) }));
        });
        return result;
    }
    return {};
};

const NORMALIZE_REGION: Record<string, string> = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주", "제주도": "제주"
};

const normalizeRegionName = (name: string) => {
    if (!name) return name;
    if (NORMALIZE_REGION[name]) return NORMALIZE_REGION[name];
    // Fuzzy match: if it starts with any of the short names
    for (const short of REGIONS) {
        if (name.startsWith(short)) return short;
    }
    return name;
};

export default function InteractiveChartCard({
    title, subTitle, icon, data, type,
    genderBreakdown, ageBreakdown, regionBreakdown
}: InteractiveChartCardProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>("TOTAL");

    // Memoize breakdown data
    const breakdownData = useMemo(() => {
        // Helper to convert DB format { party: score } to ChartDataPoint[]
        const convert = (source: any) => {
            if (!source) return null;
            const target = type === "PRESIDENTIAL" ? source.presidential : (type === "PRIORITY" ? source.priorities : source.parties);
            if (!target) return null;

            return data.map(base => ({
                ...base,
                value: target[base.label] || target[base.label.toLowerCase()] ||
                    (base.label === 'Positive' ? target.positive :
                        base.label === 'Negative' ? target.negative :
                            base.label === 'Neutral' ? target.neutral : 0) || 0
            }));
        };

        const result: any = {
            GENDER: {},
            AGE: {},
            REGION: {}
        };

        // Use real data if available
        if (genderBreakdown) {
            Object.entries(genderBreakdown).forEach(([k, v]) => {
                const converted = convert(v);
                if (converted) result.GENDER[k] = converted;
            });
        }
        if (ageBreakdown) {
            Object.entries(ageBreakdown).forEach(([k, v]) => {
                const converted = convert(v);
                if (converted) result.AGE[k] = converted;
            });
        }
        if (regionBreakdown) {
            Object.entries(regionBreakdown).forEach(([k, v]) => {
                const normalized = normalizeRegionName(k);
                const converted = convert(v);
                if (converted) result.REGION[normalized] = converted;
            });
        }

        // Fallback to mock for any empty dimension
        if (Object.keys(result.GENDER).length === 0) result.GENDER = generateBreakdown(data, "GENDER");
        if (Object.keys(result.AGE).length === 0) result.AGE = generateBreakdown(data, "AGE");
        if (Object.keys(result.REGION).length === 0) result.REGION = generateBreakdown(data, "REGION");

        return result;
    }, [data, genderBreakdown, ageBreakdown, regionBreakdown, type]);

    // --- "My Tribe" Logic ---
    const myRegion = user?.city ? user.city.split(" ")[0] : "서울"; // Fallback to Seoul
    const myGender = user?.gender === "male" ? "남성" : (user?.gender === "female" ? "여성" : null);

    // Parse age group (e.g., "1990" -> "30대")
    const myAgeGroup = useMemo(() => {
        if (!user?.ageGroup) return "20대"; // Default
        return user.ageGroup;
    }, [user]);

    // Determine current "My Tribe" key based on tab
    const myTribeKey = useMemo(() => {
        if (activeTab === "GENDER") return myGender;
        if (activeTab === "AGE") return myAgeGroup;
        if (activeTab === "REGION") return normalizeRegionName(user?.region || "서울");
        return null;
    }, [activeTab, user, myGender, myAgeGroup]);

    // --- Insight Generation ---
    const insightMessage = useMemo(() => {
        if (activeTab === "TOTAL" || !myTribeKey) return null;

        const myData = (breakdownData as any)[activeTab][myTribeKey] as ChartDataPoint[];
        if (!myData) return null;

        // Find primary metric (Highest value or specifically "Positive" for presidential)
        const primaryMetricName = type === "PRESIDENTIAL" ? "Positive" : data[0]?.label;

        // Match labels - messy due to potential "Positive" vs "더불어민주당" naming differences
        // Assuming data[0] is always the 'main' positive/leading metric for simplicity
        const totalPrimary = data.find(d => d.label === primaryMetricName) || data[0];
        const myPrimary = myData.find(d => d.label === primaryMetricName) || myData[0];

        if (!totalPrimary || !myPrimary) return null;

        const diff = myPrimary.value - totalPrimary.value;
        const isHigher = diff > 0;

        // Formatting text
        const targetName = type === "PRESIDENTIAL" ? "긍정 평가" : `${myPrimary.label} 지지`;

        return (
            <span>
                회원님과 같은 <span className="text-white font-bold">{myTribeKey}</span> 그룹은 전체 평균보다<br />
                <span className={cn("font-black", isHigher ? "text-orange-400" : "text-rose-400")}>
                    {targetName}가 {Math.abs(diff)}%p {isHigher ? "더 높아요! 🚀" : "더 낮아요 📉"}
                </span>
            </span>
        );

    }, [activeTab, myTribeKey, breakdownData, data, type]);


    // --- Renderers ---

    const renderTabs = () => (
        <div className="flex space-x-2 mb-6 bg-black/20 p-1.5 rounded-2xl w-fit border border-white/5">
            {([
                { id: "TOTAL", label: "전체" },
                { id: "GENDER", label: "성별" },
                { id: "AGE", label: "연령" },
                { id: "REGION", label: "지역" }
            ] as const).map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                        "relative px-4 py-1.5 rounded-xl text-[11px] font-black transition-all duration-300 z-10",
                        activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/70"
                    )}
                >
                    {activeTab === tab.id && (
                        <motion.div
                            layoutId={`tab-bubble-${title}`} // Unique layout ID per card instance
                            className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl -z-10 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                    {tab.label}
                </button>
            ))}
        </div>
    );

    const renderSingleBar = (item: ChartDataPoint, index: number, isHighlight: boolean = false) => {
        // Check color - map Tailwind class to hex for shadow if needed, or rely on classes
        const isPositive = item.label === "Positive" || item.label.includes("잘하고");
        const isNegative = item.label === "Negative" || item.label.includes("잘못하고");

        let colorClass = item.twColorClass || "";
        if (!colorClass) {
            // Fallback or explicit mapping
            if (isPositive) colorClass = "text-emerald-400";
            else if (isNegative) colorClass = "text-rose-400";
            else if (item.color.startsWith('#')) colorClass = ""; // It's a hex, handle via style
            else colorClass = "text-gray-400";
        }

        const barBgClass = isPositive ? "bg-emerald-500" : (isNegative ? "bg-rose-500" : (item.color.startsWith('#') ? "" : "bg-amber-500"));
        const barShadowColor = isPositive ? "rgba(16, 185, 129, 0.5)" : (isNegative ? "rgba(243, 68, 68, 0.5)" : "rgba(251, 191, 36, 0.5)");

        return (
            <div key={index} className={cn("space-y-2 opacity-100 transition-opacity duration-500", !isHighlight && activeTab !== "TOTAL" && "opacity-40 grayscale-[0.5]")}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {item.icon && <div className="shrink-0 scale-75 origin-left">{item.icon}</div>}
                        <span className={cn("font-bold text-xs", colorClass, !colorClass && "text-white/70")}>
                            {item.label === 'Positive' ? '긍정' : item.label === 'Negative' ? '부정' : item.label === 'Neutral' ? '중립' : item.label}
                        </span>
                    </div>
                    <span className="text-white font-black text-sm">{item.value}%</span>
                </div>
                <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 1.2, delay: index * 0.1, ease: "easeOut" }}
                        className={cn("absolute inset-y-0 left-0 rounded-full", barBgClass)}
                        style={{
                            backgroundColor: item.color.startsWith('#') ? item.color : undefined,
                            boxShadow: `0 0 15px ${item.color.startsWith('#') ? item.color : barShadowColor}`
                        }}
                    />
                </div>
            </div>
        );
    };

    const renderGroupContent = () => {
        if (activeTab === "TOTAL") {
            return <div className="space-y-5 mb-8">{data.map((item, i) => renderSingleBar(item, i, true))}</div>;
        }

        // Prepare data for rendering
        let groups: { key: string; items: ChartDataPoint[] }[] = [];

        if (activeTab === "GENDER") {
            groups = [
                { key: "남성", items: (breakdownData.GENDER as any)["남성"] },
                { key: "여성", items: (breakdownData.GENDER as any)["여성"] }
            ].filter(g => g.items && Array.isArray(g.items));
        } else if (activeTab === "AGE") {
            groups = AGE_GROUPS.map(age => ({ key: age, items: (breakdownData.AGE as any)[age] }))
                .filter(g => g.items && Array.isArray(g.items));
        } else if (activeTab === "REGION") {
            // Sorting Logic for Region:
            // 1. My Region (Slot 1)
            // 2. Others (Alphabetical or Default)
            const others = REGIONS.filter(r => r !== myTribeKey);
            const sortedKeys = myTribeKey && REGIONS.includes(myTribeKey)
                ? [myTribeKey, ...others]
                : REGIONS;

            groups = sortedKeys.map(r => ({
                key: r,
                items: (breakdownData.REGION as any)[r] || data.map(d => ({ ...d, value: 0 }))
            }));
        }

        // Check if we need Horizontal Scroll (Region)
        if (activeTab === "REGION") {
            return (
                <ScrollArea className="w-full whitespace-nowrap pb-4">
                    <div className="flex space-x-4">
                        {groups.map((group, groupIdx) => {
                            const isMyTribe = group.key === myTribeKey;
                            return (
                                <motion.div
                                    key={group.key}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: groupIdx * 0.05 }}
                                    className={cn(
                                        "w-[160px] shrink-0 p-4 rounded-2xl border transition-all duration-300",
                                        isMyTribe
                                            ? "bg-white/10 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                                            : "bg-white/5 border-white/5 opacity-60"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm font-black text-white">{group.key}</span>
                                        {isMyTribe && <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">ME</span>}
                                    </div>
                                    {/* Mini Bars */}
                                    <div className="space-y-2">
                                        {group.items?.slice(0, 3).map((item, i) => ( // Show top 3 max to avoid clutter
                                            <div key={i} className="flex flex-col gap-1">
                                                <div className="flex justify-between text-[10px] text-white/50 w-full overflow-hidden">
                                                    <div className="flex items-center gap-1 truncate">
                                                        {/* Only show icon if space permits or if very compact - maybe hide for region mini bars to avoid clutter, or show scale-50 */}
                                                        <span className="truncate">{item.label}</span>
                                                    </div>
                                                    <span>{item.value}%</span>
                                                </div>
                                                <div className="h-1.5 bg-white/10 rounded-full w-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${item.value}%`, backgroundColor: item.color.startsWith('#') ? item.color : (item.label === 'Positive' ? '#10b981' : '#ef4444') }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-2" />
                </ScrollArea>
            );
        }

        // Vertical Stack for Age/Gender
        return (
            <div className="space-y-6">
                {groups.map((group, idx) => {
                    const isMyTribe = group.key === myTribeKey;
                    // Only show main metric for compactness in list view? Or full? 
                    // Let's show full but compact.
                    return (
                        <motion.div
                            key={group.key}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={cn("space-y-3 p-3 rounded-2xl transition-all", isMyTribe && "bg-white/5 border border-orange-500/30")}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className={cn("text-sm font-black", isMyTribe ? "text-white" : "text-white/60")}>{group.key}</span>
                                {isMyTribe && <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">ME</span>}
                            </div>
                            {group.items?.map((item, i) => renderSingleBar(item, i, isMyTribe))}
                        </motion.div>
                    );
                })}
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card-strong p-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-3xl overflow-hidden relative"
        >
            {/* Dynamic Insight (Toast-like) */}
            <AnimatePresence>
                {insightMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-6 bg-gradient-to-r from-orange-900/40 to-black/40 border border-orange-500/30 rounded-2xl p-4 flex items-start gap-3"
                    >
                        <div className="p-2 bg-orange-500/10 rounded-full shrink-0">
                            <User className="w-4 h-4 text-orange-400" />
                        </div>
                        <p className="text-xs text-white/80 leading-relaxed">
                            {insightMessage}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1 italic">{subTitle}</h3>
                    <h2 className="text-xl font-black italic uppercase text-white">{title}</h2>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center">
                    {icon}
                </div>
            </div>

            {renderTabs()}

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {renderGroupContent()}
                </motion.div>
            </AnimatePresence>

        </motion.div>
    );
}
