import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideCamera,
    LucideUpload,
    LucideChevronRight,
    LucideCheckCircle2,
    LucideAlertCircle,
    LucideX,
    LucideDatabase,
    LucideRotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RawScannerProps {
    courseId?: string;
    courseName?: string;
    onComplete?: (data: any) => void;
    onClose: () => void;
}

export const ScorecardScanner: React.FC<RawScannerProps> = ({
    courseId,
    courseName,
    onComplete,
    onClose
}) => {
    const { toast } = useToast();
    const [step, setStep] = useState<'upload' | 'scanning' | 'result'>('upload');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [scannedData, setScannedData] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
                startScanning();
            };
            reader.readAsDataURL(file);
        }
    };

    const startScanning = async () => {
        setStep('scanning');

        // Mock OCR Data for demonstration (In production, this comes from Google Vision API)
        const mockOcrResponse = {
            textAnnotations: [
                { description: "Full Text" },
                { description: "HOLE", boundingPoly: { vertices: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 30 }, { x: 10, y: 30 }] } },
                { description: "1", boundingPoly: { vertices: [{ x: 60, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 30 }, { x: 60, y: 30 }] } },
                { description: "PAR", boundingPoly: { vertices: [{ x: 10, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 60 }, { x: 10, y: 60 }] } },
                { description: "4", boundingPoly: { vertices: [{ x: 60, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 60 }, { x: 60, y: 60 }] } },
                { description: "HONG", boundingPoly: { vertices: [{ x: 10, y: 70 }, { x: 50, y: 70 }, { x: 50, y: 90 }, { x: 10, y: 90 }] } },
                { description: "5", boundingPoly: { vertices: [{ x: 60, y: 70 }, { x: 80, y: 70 }, { x: 80, y: 90 }, { x: 60, y: 90 }] } },
            ]
        };

        try {
            // Simulated delay for AI feel
            await new Promise(resolve => setTimeout(resolve, 3000));

            const res = await apiRequest("/api/hiq/golf/scorecard/ocr", {
                method: "POST",
                body: { ocrData: mockOcrResponse, courseId, courseName }
            });

            setScannedData(res);
            setStep('result');
            toast({
                title: "스캔 완료",
                description: "스코어카드 정보를 성공적으로 분석했습니다.",
            });
        } catch (error) {
            setStep('upload');
            toast({
                title: "스캔 실패",
                description: "이미지 분석 중 오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-lg bg-[#111] border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#64DD17]/10 flex items-center justify-center">
                            <LucideCamera className="w-5 h-5 text-[#64DD17]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Rankue AI 스캔</h3>
                            <p className="text-[10px] text-[#64DD17] uppercase tracking-widest font-black">스코어카드 AI 분석 엔진</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                        title="닫기"
                    >
                        <LucideX className="w-5 h-5 text-white/40" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <AnimatePresence mode="wait">
                        {step === 'upload' && (
                            <motion.div
                                key="upload"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="flex flex-col items-center justify-center py-12"
                            >
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full aspect-video rounded-[2rem] border-2 border-dashed border-white/10 hover:border-[#64DD17]/30 hover:bg-[#64DD17]/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group"
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <LucideUpload className="w-8 h-8 text-white/20 group-hover:text-[#64DD17]" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white/60 font-medium">스코어카드 사진 업로드</p>
                                        <p className="text-[11px] text-white/30 mt-1">스마트스코어 화면을 찍어서 올려주세요</p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        title="사진 선택"
                                    />
                                </div>

                                <div className="mt-8 w-full space-y-3">
                                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                                        <LucideCheckCircle2 className="w-4 h-4 text-[#64DD17] mt-0.5" />
                                        <p className="text-xs text-white/50 leading-relaxed">디지털 타블렛 화면을 정면에서 밝게 찍을수록 정확도가 높습니다.</p>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                                        <LucideDatabase className="w-4 h-4 text-[#64DD17] mt-0.5" />
                                        <p className="text-xs text-white/50 leading-relaxed">수집된 PAR 정보는 랭큐 코스 마스터 데이터베이스 구축에 활용됩니다.</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 'scanning' && (
                            <motion.div
                                key="scanning"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-20 relative"
                            >
                                <div className="relative w-48 h-48 mb-8">
                                    <div className="absolute inset-0 rounded-full border-2 border-white/5 animate-pulse" />
                                    <motion.div
                                        animate={{
                                            rotate: 360,
                                            scale: [1, 1.1, 1]
                                        }}
                                        transition={{
                                            rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                                            scale: { duration: 2, repeat: Infinity }
                                        }}
                                        className="absolute inset-0 rounded-full border-2 border-[#64DD17]/20 border-t-[#64DD17]"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <LucideCamera className="w-12 h-12 text-[#64DD17] animate-bounce" />
                                    </div>

                                    {/* Scanning Beam */}
                                    <motion.div
                                        animate={{ y: [0, 192, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        className="absolute left-0 right-0 h-0.5 bg-[#64DD17] shadow-[0_0_15px_#64DD17] z-10"
                                    />
                                </div>
                                <h4 className="text-lg font-bold text-white mb-2">데이터 분석 중...</h4>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-[#64DD17] font-black uppercase tracking-widest animate-pulse">Vision AI 구동 중</span>
                                    <div className="w-1 h-1 rounded-full bg-white/20" />
                                    <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">데이터 그리드 복원 중</span>
                                </div>
                            </motion.div>
                        )}

                        {step === 'result' && (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                {/* Rankue Design Scorecard */}
                                <div className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4">
                                        <div className="px-2 py-1 rounded-md bg-[#64DD17]/20 border border-[#64DD17]/30 flex items-center gap-1.5">
                                            <div className="w-1 h-1 rounded-full bg-[#64DD17] animate-pulse" />
                                            <span className="text-[8px] font-black text-[#64DD17] uppercase tracking-tighter">AI 검증됨</span>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <h5 className="text-xl font-black text-white italic tracking-tighter underline decoration-[#64DD17]/30 decoration-4 underline-offset-4">{scannedData.courses[0]?.course_name || "분석된 구장"}</h5>
                                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-2 px-1">Rankue Design Scorecard System</p>
                                    </div>

                                    <div className="overflow-x-auto pb-2">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="text-left py-2 px-3 text-[9px] font-black text-white/20 uppercase tracking-widest border-b border-white/5">HOLE</th>
                                                    {Array.from({ length: 9 }).map((_, i) => (
                                                        <th key={i} className="py-2 px-2 text-[10px] font-black text-white/60 border-b border-white/5">{i + 1}</th>
                                                    ))}
                                                    <th className="py-2 px-3 text-[10px] font-black text-white/60 border-b border-white/5">계</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="bg-white/[0.02]">
                                                    <td className="py-3 px-3 text-[10px] font-black text-[#64DD17] italic">PAR</td>
                                                    {scannedData.courses[0]?.pars.map((p: number, i: number) => (
                                                        <td key={i} className="py-3 px-2 text-xs font-black text-white/80 text-center">{p}</td>
                                                    )) || Array.from({ length: 9 }).map((_, i) => <td key={i} className="py-3 px-2 text-xs font-black text-white/20 text-center">-</td>)}
                                                    <td className="py-3 px-3 text-xs font-black text-[#64DD17] text-center">36</td>
                                                </tr>
                                                {scannedData.courses[0]?.players.map((p: any, idx: number) => (
                                                    <tr key={idx} className="border-t border-white/5">
                                                        <td className="py-4 px-3 text-sm font-black text-white tracking-tighter">{p.name}</td>
                                                        {p.scores.map((s: number, i: number) => (
                                                            <td key={i} className="py-4 px-2 text-center">
                                                                <span className={cn(
                                                                    "text-sm font-bold",
                                                                    s < (scannedData.courses[0]?.pars[i] || 4) ? "text-[#64DD17]" : "text-white/80"
                                                                )}>{s}</span>
                                                            </td>
                                                        ))}
                                                        <td className="py-4 px-3 text-center">
                                                            <span className="text-sm font-black text-[#64DD17] underline decoration-2 underline-offset-4">{p.total}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => setStep('upload')}
                                        className="rounded-2xl border-white/10 hover:bg-white/5 text-white/60"
                                    >
                                        <LucideRotateCcw className="w-4 h-4 mr-2" />
                                        재촬영 하기
                                    </Button>
                                    <Button
                                        onClick={() => onComplete?.(scannedData)}
                                        className="rounded-2xl bg-[#64DD17] hover:bg-[#58c114] text-black font-black"
                                    >
                                        <LucideCheckCircle2 className="w-4 h-4 mr-2" />
                                        기록 완료
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
