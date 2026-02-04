import { useState } from "react";
import {
    LucideMessageSquare,
    LucideStar,
    LucideZap,
    LucideTrophy,
    LucideLeaf,
    LucideFlag,
    LucideHeart
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ReviewFormSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
}

export function ReviewFormSheet({ open, onOpenChange, onSubmit }: ReviewFormSheetProps) {
    const [formData, setFormData] = useState({
        score: 82,
        revisit: true,
        ratings: { course: 5, green: 4, service: 5 },
        specs: { speed: 2.8, fee: 250000, difficulty: "상" },
        tags: [] as string[]
    });

    const TAG_OPTIONS = [
        "#그린스피드빠름", "#페어웨이양탄자", "#그늘집맛집", "#캐디친절",
        "#경치좋음", "#가성비갑", "#전장김", "#벙커지옥"
    ];

    const handleSubmit = () => {
        if (formData.ratings.course === 0 || formData.ratings.green === 0 || formData.ratings.service === 0) {
            alert("별점을 모두 입력해주세요!");
            return;
        }
        onSubmit(formData);
        onOpenChange(false);
    };

    const updateRatings = (key: string, value: number) => {
        setFormData(prev => ({
            ...prev,
            ratings: { ...prev.ratings, [key]: value }
        }));
    };

    const updateSpecs = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            specs: { ...prev.specs, [key]: value }
        }));
    };

    const toggleTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.includes(tag)
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag]
        }));
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-[#1E1E1E] border-t border-white/10 rounded-t-[2rem] p-8 h-[85vh]">
                <SheetHeader className="mb-8">
                    <SheetTitle className="text-xl font-black text-white flex items-center gap-2">
                        <LucideMessageSquare className="w-5 h-5 text-[#64DD17]" />
                        리뷰 & 스코어 기록
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-8 h-full overflow-y-auto pb-20 no-scrollbar">
                    {/* 1. Score & Revisit */}
                    <div className="flex flex-col gap-6">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-white/60">재방문 의사</label>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, revisit: !prev.revisit }))}
                                className={cn(
                                    "px-4 py-2 rounded-full font-black text-xs transition-all",
                                    formData.revisit ? "bg-yellow-400 text-black" : "bg-white/10 text-white/40"
                                )}
                            >
                                {formData.revisit ? "😊 있음 (96%)" : "😐 없음"}
                            </button>
                        </div>

                        <div className="bg-black/20 rounded-3xl p-6 text-center border border-white/5">
                            <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">베스트 스코어</label>
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, score: prev.score - 1 }))}
                                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white text-xl"
                                >
                                    -
                                </button>
                                <span className="text-5xl font-black text-[#64DD17] tracking-tighter w-24">{formData.score}</span>
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, score: prev.score + 1 }))}
                                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white text-xl"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 2. Ratings & Specs Grid */}
                    <div className="grid grid-cols-2 gap-8 relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />

                        {/* Ratings Input */}
                        <div className="space-y-6">
                            {[
                                { id: 'course', label: '코스 상태', icon: LucideLeaf },
                                { id: 'green', label: '그린 상태', icon: LucideFlag },
                                { id: 'service', label: '서비스', icon: LucideHeart }
                            ].map((item) => (
                                <div key={item.id} className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-white/40">
                                        <item.icon className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                onClick={() => updateRatings(item.id, star)}
                                            >
                                                <LucideStar
                                                    className={cn(
                                                        "w-4 h-4 transition-all",
                                                        star <= formData.ratings[item.id as keyof typeof formData.ratings]
                                                            ? "text-amber-400 fill-amber-400"
                                                            : "text-white/10 fill-white/10"
                                                    )}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Specs Input */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-white/40">
                                    <LucideZap className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">그린 스피드</span>
                                </div>
                                <input
                                    type="number"
                                    value={formData.specs.speed}
                                    onChange={(e) => updateSpecs('speed', parseFloat(e.target.value))}
                                    step="0.1"
                                    className="w-full bg-transparent text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-white/40">
                                    <span className="text-[10px]">💰</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">그린피</span>
                                </div>
                                <input
                                    type="number"
                                    value={formData.specs.fee}
                                    onChange={(e) => updateSpecs('fee', parseInt(e.target.value))}
                                    step="10000"
                                    className="w-full bg-transparent text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-white/40">
                                    <LucideTrophy className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">난이도</span>
                                </div>
                                <select
                                    value={formData.specs.difficulty}
                                    onChange={(e) => updateSpecs('difficulty', e.target.value)}
                                    className="w-full bg-[#1A1A1A] text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1 appearance-none"
                                >
                                    <option value="상">상</option>
                                    <option value="중">중</option>
                                    <option value="하">하</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* 3. Hashtags */}
                    <div className="space-y-4">
                        <label className="text-sm font-bold text-white/60">자주 쓰는 태그</label>
                        <div className="flex flex-wrap gap-2">
                            {TAG_OPTIONS.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                                        formData.tags.includes(tag)
                                            ? "bg-[#64DD17] text-[#051907] border-[#64DD17]"
                                            : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                    )}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        className="w-full bg-[#64DD17] text-[#051907] py-4 rounded-xl font-black uppercase tracking-widest hover:bg-[#7ff531] transition-all shadow-[0_0_30px_rgba(100,221,23,0.3)]"
                    >
                        기록 저장하기
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
