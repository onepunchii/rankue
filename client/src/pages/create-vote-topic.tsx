import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Upload, Plus, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import LightPillar from "@/components/ui/light-pillar";

export default function CreateVoteTopic() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            toast({
                title: "제목을 입력해주세요",
                variant: "destructive",
            });
            return;
        }

        // Simulate submission
        toast({
            title: "✨ 투표 주제 생성 완료!",
            description: "관리자 승인 후 공개됩니다.",
        });
        setTimeout(() => setLocation('/celebrity-ranking'), 1500);
    };

    return (
        <div className="min-h-screen bg-black text-white relative flex flex-col overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[100px]" />
                <LightPillar topColor="#9333ea" bottomColor="#4f46e5" intensity={0.5} />
            </div>

            {/* Header */}
            <div className="sticky top-0 z-50 p-4 flex items-center bg-black/60 backdrop-blur-xl border-b border-white/5">
                <Button variant="ghost" onClick={() => window.history.back()} className="rounded-full w-10 h-10 p-0 text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                </Button>
                <h1 className="flex-1 text-center text-lg font-black tracking-tight italic">나만의 투표 만들기</h1>
                <div className="w-10" />
            </div>

            {/* Content */}
            <div className="flex-1 p-6 relative z-10 max-w-md mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-8 text-center space-y-2">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4 animate-bounce">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-white">
                        새로운 투표 주제를<br />제안해보세요!
                    </h2>
                    <p className="text-sm text-white/50">
                        여러분이 만든 주제로 많은 사람들이<br />즐겁게 투표할 수 있습니다.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2 group">
                        <label className="text-sm font-bold text-purple-300 ml-1 group-focus-within:text-purple-400 transition-colors">투표 제목</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="예: 2024년 최고의 예능 유망주는?"
                            className="bg-white/5 border-white/10 text-white placeholder-white/20 h-14 rounded-2xl focus:border-purple-500/50 focus:bg-white/10 transition-all text-lg font-medium"
                        />
                    </div>

                    <div className="space-y-2 group">
                        <label className="text-sm font-bold text-purple-300 ml-1 group-focus-within:text-purple-400 transition-colors">설명 (선택)</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="투표에 대한 간단한 설명을 적어주세요."
                            className="bg-white/5 border-white/10 text-white placeholder-white/20 min-h-[120px] rounded-2xl focus:border-purple-500/50 focus:bg-white/10 resize-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-purple-300 ml-1">대표 이미지 (선택)</label>
                        <div className="border-2 border-dashed border-white/10 rounded-2xl h-40 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 hover:border-purple-500/30 transition-all cursor-pointer group active:scale-[0.99]">
                            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all">
                                <Upload className="w-6 h-6 text-white/40 group-hover:text-purple-300" />
                            </div>
                            <span className="text-sm font-medium text-white/40 group-hover:text-white/80 transition-colors">이미지 업로드</span>
                            <span className="text-[10px] text-white/20 mt-1">JPG, PNG, GIF (Max 5MB)</span>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-6 pb-12">
                        <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white h-14 rounded-2xl font-bold shadow-lg shadow-purple-900/30 text-lg hover:translate-y-[-2px] hover:shadow-purple-900/50 transition-all active:scale-[0.98]">
                            만들기 완료 <ChevronLeft className="w-5 h-5 ml-2 rotate-180" />
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
