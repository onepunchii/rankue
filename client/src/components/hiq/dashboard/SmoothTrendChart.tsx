import { useState, useMemo } from "react";
import { LucideTrendingUp, LucideTrendingDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface ChartDataPoint {
    value: number;
    date: string;
    gameId?: string | number;
}

interface TrendChartProps {
    title: string;
    subTitle: string;
    data: ChartDataPoint[]; // Updated to accept object array
    color: 'green' | 'blue';
}

// --- ✨ 고급 스무딩 알고리즘 (Catmull-Rom Spline to Bezier) ---
// 이 함수가 토스 같은 부드러운 곡선을 만들어줍니다.
const svgPath = (points: number[][], command: (point: number[], i: number, a: number[][]) => string) => {
    return points.reduce((acc, point, i, a) => i === 0 ? `M ${point[0]},${point[1]}` : `${acc} ${command(point, i, a)}`, '');
};
const lineCommand = (point: number[]) => `L ${point[0]},${point[1]}`;
const controlPoint = (current: number[], previous: number[], next: number[] | undefined, reverse?: boolean) => {
    const p = previous || current;
    const n = next || current;
    const smoothing = 0.2; // 곡선의 부드러움 정도 (0~1)
    const o = lineCommand(n);
    const angle = Math.atan2(n[1] - p[1], n[0] - p[0]); // Correct angle calculation
    const length = Math.sqrt(Math.pow(n[0] - p[0], 2) + Math.pow(n[1] - p[1], 2)) * smoothing;
    const x = current[0] + Math.cos(angle) * length * (reverse ? -1 : 1);
    const y = current[1] + Math.sin(angle) * length * (reverse ? -1 : 1);
    return [x, y];
};
const bezierCommand = (point: number[], i: number, a: number[][]) => {
    const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point);
    const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true);
    return `C ${cpsX},${cpsY} ${cpeX},${cpeY} ${point[0]},${point[1]}`;
};
const smoothLine = (points: number[][]) => svgPath(points, bezierCommand);

export const SmoothTrendChart = ({ title, subTitle, data, color }: TrendChartProps) => {
    const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

    // 테마 설정
    const theme = color === 'green' ? {
        hex: '#006241',
        bg: 'bg-brand/10',
        text: 'text-brand',
        shadow: ''
    } : {
        hex: '#006241',
        bg: 'bg-brand/10',
        text: 'text-brand',
        shadow: ''
    };

    const currentAvg = data[data.length - 1]?.value || 0;
    const prevAvg = data[data.length - 2]?.value || currentAvg;
    const isUp = currentAvg >= prevAvg;
    const diff = Math.abs(currentAvg - prevAvg);

    // --- 차트 좌표 계산 (Memoization) ---
    const { pathD, areaD, htmlPoints, width, height } = useMemo(() => {
        const width = 1000; // 내부 해상도를 높여서 부드럽게
        const height = 300;
        const values = data.map(d => d.value);
        const min = Math.min(...values) * 0.95;
        const max = Math.max(...values) * 1.25;
        const range = (max - min) || 1;

        // 데이터를 SVG 좌표로 변환
        const points = values.map((val, i) => {
            const x = (i / (values.length - 1)) * width;
            const y = height - ((val - min) / range) * height;
            return [x, y];
        });

        // 스무딩 경로 생성
        const pathD = smoothLine(points);
        const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

        // HTML 점 좌표 계산 (퍼센트)
        const htmlPoints = data.map((d, i) => ({
            left: `${(i / (data.length - 1)) * 100}%`,
            top: `${100 - ((d.value - min) / range) * 100}%`,
            val: d.value,
            date: d.date,
            index: i
        }));

        return { pathD, areaD, htmlPoints, width, height };
    }, [data]);

    return (
        <div className="bg-white rounded-3xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] relative overflow-hidden animate-in fade-in select-none">
            {/* Header Info */}
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                    <h3 className="text-ink-1 font-bold text-lg">{title}</h3>
                    <p className="text-black/55 text-xs mt-1">{subTitle}</p>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-semibold text-ink-1 tracking-tight animate-in slide-in-from-bottom-2">
                        {currentAvg.toFixed(2)}
                    </div>
                    <div className={cn("flex items-center justify-end gap-1 text-xs font-bold mt-1", isUp ? theme.text : "text-black/40")}>
                        {isUp ? <LucideTrendingUp className="w-3.5 h-3.5" /> : <LucideTrendingDown className="w-3.5 h-3.5" />}
                        <span>직전 대비 {isUp ? '+' : '-'}{diff.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* ✨ The Real Smooth Chart Container */}
            <div className="h-48 w-full relative mt-8 select-none"
                onClick={() => setSelectedPointIndex(null)} // Background click clears selection
            >

                {/* 1. SVG Line & Area layer */}
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full absolute inset-0 overflow-visible pointer-events-none" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={theme.hex} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={theme.hex} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {/* Area Fill */}
                    <path d={areaD} fill={`url(#grad-${color})`} stroke="none" className="transition-all duration-500" />
                    {/* Smooth Line */}
                    <path d={pathD} fill="none" stroke={theme.hex} strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="transition-all duration-500" />
                </svg>

                {/* 2. HTML Dots Layer (Clickable) */}
                <div className="absolute inset-0">
                    {htmlPoints.map((p, i) => {
                        const isLast = i === htmlPoints.length - 1;
                        const isSelected = selectedPointIndex === i;
                        // Show tooltip if selected OR if it's the last point AND nothing is selected
                        const showTooltip = isSelected || (isLast && selectedPointIndex === null);

                        return (
                            <div
                                key={i}
                                className="absolute flex items-center justify-center transition-all duration-500 cursor-pointer group"
                                style={{ left: p.left, top: p.top, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 20 : 10 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPointIndex(i);
                                }}
                                title={isSelected ? `Selected: ${p.val}` : `Point ${i}`}
                            >
                                {/* Invisible larger hit area for easier clicking */}
                                <div className="absolute w-8 h-8 rounded-full bg-transparent" />

                                {/* Dot Visuals */}
                                <div className={cn(
                                    "w-2 h-2 rounded-full bg-white transition-all duration-300",
                                    (isSelected || isLast) ? "w-3 h-3 border-2" : "opacity-70 group-hover:opacity-100 group-hover:scale-125"
                                )}
                                    style={{
                                        backgroundColor: (isSelected || isLast) ? '#ffffff' : theme.hex,
                                        borderColor: (isSelected || isLast) ? theme.hex : 'transparent'
                                    }}
                                />

                                {/* ✨ Tooltip Popup */}
                                <AnimatePresence>
                                    {showTooltip && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 5, scale: 0.9 }}
                                            className={cn(
                                                "absolute bottom-full mb-3 flex flex-col pointer-events-none min-w-[max-content]",
                                                i === 0 ? "items-start left-[-8px]" :
                                                    (i === htmlPoints.length - 1 ? "items-end right-[-8px]" : "items-center left-1/2 -translate-x-1/2")
                                            )}
                                        >
                                            <div className={cn("px-3 py-1.5 rounded-xl text-xs font-bold text-ink-1 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col items-center gap-0.5", theme.bg)}>
                                                <span className="text-[12px] text-black/55 uppercase tracking-wider">{p.date}</span>
                                                <span className="text-sm font-semibold tracking-tight">AVG {p.val.toFixed(2)}</span>
                                            </div>
                                            {/* Triail */}
                                            <div className={cn("w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] -mt-1",
                                                theme.text.replace('text-', 'border-t-').replace('/10', '/10') // Hacky way to match color
                                            )} style={{ borderTopColor: theme.hex, opacity: 0.1 }} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Ping effect for last point if nothing selected */}
                                {isLast && selectedPointIndex === null && (
                                    <div className={cn("absolute w-6 h-6 rounded-full animate-ping opacity-30 -z-10", theme.bg)} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* X-Axis */}
                <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-[12px] text-black/55 font-medium px-1 pointer-events-none">
                    <span>10게임 전</span>
                    <span>오늘</span>
                </div>
            </div>
        </div>
    );
};
