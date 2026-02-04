import { useState } from 'react';
import { LucideSettings2, LucideCamera, LucideImagePlus, LucideLoader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/image-utils';
import { CrewData } from '@/types/crew';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ClubGeneralTabProps {
    crew: CrewData;
    isLeader: boolean;
    onUpdate: (data: any) => void;
    onDelete: () => void;
    isUpdating: boolean;
    isDeleting: boolean;
}

export function ClubGeneralTab({ crew, isLeader, onUpdate, onDelete, isUpdating, isDeleting }: ClubGeneralTabProps) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        name: crew?.name || '',
        shortIntro: crew?.shortIntro || '',
        description: crew?.description || '',
        maxMembers: crew?.maxMembers || 50,
        emblem: crew?.emblem,
        coverImage: crew?.coverImage,
        meetingDay: crew?.meetingDay || '',
        meetingTime: crew?.meetingTime || '',
    });
    const [isUploading, setIsUploading] = useState(false);

    const isDirty = Object.keys(formData).some(key => (formData as any)[key] !== (crew as any)[key]);

    const handleFileChange = async (type: 'emblem' | 'coverImage', file: File) => {
        try {
            setIsUploading(true);
            const b64 = await compressImage(file, type === 'coverImage' ? 1200 : 400);
            setFormData(prev => ({ ...prev, [type]: b64 }));
        } catch (err) {
            toast({ title: "이미지 처리 실패", variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = () => {
        onUpdate(formData);
    };

    return (
        <div className="space-y-6 pb-6">
            <div className="space-y-4">
                {/* Emblem & Cover Upload */}
                <div className="space-y-4">
                    <div className="relative group/cover h-[140px] rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden transition-all duration-500 hover:border-white/10">
                        {formData.coverImage ? (
                            <img src={formData.coverImage} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt="Cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-white/[0.03] text-white/10">
                                <LucideImagePlus className="w-8 h-8 mb-2" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">크루 커버 이미지</span>
                            </div>
                        )}
                        {isLeader && (
                            <div
                                onClick={() => document.getElementById('settings-cover-upload')?.click()}
                                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity cursor-pointer"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <LucideImagePlus className="w-6 h-6 text-white" />
                                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">커버 변경</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 -mt-10 px-4 relative z-10">
                        <div className="relative group/logo flex-shrink-0">
                            <div className={cn(
                                "w-20 h-20 rounded-[1.8rem] bg-[#121212] border-2 overflow-hidden relative shadow-2xl transition-all duration-500",
                                crew?.sportCategory === "GOLF" ? "border-[#84cc16]/30 group-hover/logo:border-[#84cc16]" : "border-[#10b981]/30 group-hover/logo:border-[#10b981]"
                            )}>
                                {formData.emblem ? (
                                    <img src={formData.emblem} className="w-full h-full object-cover" alt="Emblem" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-white/[0.05]">
                                        <LucideCamera className="w-6 h-6 text-white/10" />
                                    </div>
                                )}
                                {isLeader && (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); document.getElementById('settings-logo-upload')?.click(); }}
                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity cursor-pointer"
                                    >
                                        <LucideCamera className="w-5 h-5 text-white" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="pb-1">
                            <h3 className="text-sm font-bold text-white drop-shadow-md">크루 엠블럼</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Edit Identity</p>
                        </div>
                    </div>
                </div>
            </div>

            <input
                type="file"
                id="settings-logo-upload"
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileChange('emblem', e.target.files[0])}
            />
            <input
                type="file"
                id="settings-cover-upload"
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileChange('coverImage', e.target.files[0])}
            />

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">크루 명칭</Label>
                    <Input
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        disabled={!isLeader}
                        className={cn(
                            "bg-white/[0.02] border-white/5 h-10 text-sm font-bold tracking-tight rounded-xl focus:ring-0 focus-visible:ring-0",
                            crew?.sportCategory === "GOLF" ? "focus:border-[#84cc16]/30" : "focus:border-[#10b981]/30"
                        )}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">슬로건</Label>
                    <Input
                        value={formData.shortIntro}
                        onChange={e => setFormData(prev => ({ ...prev, shortIntro: e.target.value }))}
                        disabled={!isLeader}
                        placeholder={crew?.sportCategory === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                        className={cn(
                            "bg-white/[0.02] border-white/5 h-10 text-sm font-medium rounded-xl focus:ring-0 focus-visible:ring-0 placeholder:text-white/10",
                            crew?.sportCategory === "GOLF" ? "focus:border-[#84cc16]/30" : "focus:border-[#10b981]/30"
                        )}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">크루 정원</Label>
                    <div className="grid grid-cols-5 gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl">
                        {[10, 20, 30, 50, 100].map(num => (
                            <button
                                key={num}
                                disabled={!isLeader}
                                onClick={() => setFormData(prev => ({ ...prev, maxMembers: num }))}
                                className={cn(
                                    "h-10 rounded-xl text-[11px] font-black uppercase transition-all duration-300",
                                    formData.maxMembers === num
                                        ? (crew?.sportCategory === "GOLF"
                                            ? "bg-[#84cc16] text-black shadow-lg shadow-[#84cc16]/20"
                                            : "bg-[#10b981] text-black shadow-lg shadow-[#10b981]/20")
                                        : "text-white/20 hover:text-white/40 hover:bg-white/5"
                                )}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">소개글</Label>
                    <Textarea
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        disabled={!isLeader}
                        placeholder="크루에 대해 소개해 주세요..."
                        className={cn(
                            "bg-white/[0.02] border-white/5 resize-none min-h-[100px] text-sm leading-relaxed rounded-xl focus:ring-0 focus-visible:ring-0 placeholder:text-white/10 custom-scrollbar",
                            crew?.sportCategory === "GOLF" ? "focus:border-[#84cc16]/30" : "focus:border-[#10b981]/30"
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">정모 요일</Label>
                        <Input
                            value={formData.meetingDay}
                            onChange={e => setFormData(prev => ({ ...prev, meetingDay: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 토요일"
                            className="bg-white/[0.02] border-white/5 h-10 text-xs font-bold rounded-xl"
                        />
                    </div>
                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">시간</Label>
                        <Input
                            value={formData.meetingTime}
                            onChange={e => setFormData(prev => ({ ...prev, meetingTime: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 2시"
                            className="bg-white/[0.02] border-white/5 h-10 text-xs font-bold rounded-xl"
                        />
                    </div>
                </div>

                <div className="pt-4 pb-4">
                    {isLeader ? (
                        <Button
                            onClick={handleSave}
                            disabled={!isDirty || isUpdating || isUploading}
                            className={cn(
                                "w-full h-12 text-black rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-300 active:scale-[0.98] disabled:opacity-20 disabled:shadow-none",
                                crew?.sportCategory === "GOLF"
                                    ? "bg-[#84cc16] hover:bg-[#a3e635] shadow-lg shadow-[#84cc16]/10"
                                    : "bg-[#10b981] hover:bg-[#10b981]/90 shadow-lg shadow-[#10b981]/10"
                            )}
                        >
                            {isUpdating || isUploading ? (
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                            ) : "변경사항 저장"}
                        </Button>
                    ) : (
                        <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-center text-[10px] font-black text-white/20 uppercase tracking-widest leading-relaxed">
                            기본 정보 수정 권한은 크루장에게만 있습니다
                        </div>
                    )}
                </div>

                {isLeader && (
                    <div className="pt-4 border-t border-white/5">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    disabled={isDeleting}
                                    className="w-full h-12 text-red-500/40 hover:text-red-500 hover:bg-red-500/5 border border-red-500/10 rounded-xl text-[10px] font-bold uppercase tracking-[0.1em] transition-all"
                                >
                                    {isDeleting ? "삭제 중..." : "크루 폐쇄 (Danger Zone)"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#121212] border-white/10 text-white">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>정말로 크루를 삭제하시겠습니까?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-white/60">
                                        이 작업은 되돌릴 수 없으며, 모든 크루 데이터와 멤버 정보가 영구적으로 삭제됩니다.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">취소</AlertDialogCancel>
                                    <AlertDialogAction onClick={onDelete} className="bg-red-500 text-white hover:bg-red-600">삭제</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
        </div>
    );
}
