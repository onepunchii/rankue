import { useState } from 'react';
import { LucideSettings2, LucideCamera, LucideImagePlus, LucideLoader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/lib/imageUtils';
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
            const url = await uploadImage(file, type === 'coverImage' ? 'crew-cover' : 'crew-logo', { maxSize: type === 'coverImage' ? 1200 : 400 });
            setFormData(prev => ({ ...prev, [type]: url }));
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
                    <div className="relative group/cover h-[140px] rounded-tile bg-surface-2 border border-surface-line overflow-hidden">
                        {formData.coverImage ? (
                            <img src={formData.coverImage} className="w-full h-full object-cover opacity-80" alt="Cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-surface-3 text-white/55">
                                <LucideImagePlus className="w-8 h-8 mb-2" />
                                <span className="text-xs font-semibold">크루 커버 이미지</span>
                            </div>
                        )}
                        {isLeader && (
                            <div
                                onClick={() => document.getElementById('settings-cover-upload')?.click()}
                                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity cursor-pointer"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <LucideImagePlus className="w-6 h-6 text-white" />
                                    <span className="text-xs font-bold text-white">커버 변경</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 -mt-10 px-4 relative z-10">
                        <div className="relative group/logo flex-shrink-0">
                            <div className={cn(
                                "w-20 h-20 rounded-tile bg-surface-3 border-2 overflow-hidden relative",
                                crew?.sportCategory === "GOLF" ? "border-brand/30 group-hover/logo:border-brand" : "border-brand/30 group-hover/logo:border-brand"
                            )}>
                                {formData.emblem ? (
                                    <img src={formData.emblem} className="w-full h-full object-cover" alt="Emblem" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-surface-2">
                                        <LucideCamera className="w-6 h-6 text-white/45" />
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
                            <h3 className="text-sm font-bold text-white">크루 엠블럼</h3>
                            <p className="text-xs text-white/55 font-medium mt-0.5">로고 수정</p>
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
                    <Label className="text-xs font-semibold text-white/55 ml-1">크루 명칭</Label>
                    <Input
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        disabled={!isLeader}
                        placeholder="동호회 이름"
                        className={cn(
                            "bg-surface-2 border-surface-line h-10 text-sm font-bold rounded-tile focus:ring-0 focus-visible:ring-0 placeholder:text-white/45",
                            crew?.sportCategory === "GOLF" ? "focus:border-brand/30" : "focus:border-brand/30"
                        )}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-white/55 ml-1">슬로건</Label>
                    <Input
                        value={formData.shortIntro}
                        onChange={e => setFormData(prev => ({ ...prev, shortIntro: e.target.value }))}
                        disabled={!isLeader}
                        placeholder={crew?.sportCategory === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                        className={cn(
                            "bg-surface-2 border-surface-line h-10 text-sm font-medium rounded-tile focus:ring-0 focus-visible:ring-0 placeholder:text-white/45",
                            crew?.sportCategory === "GOLF" ? "focus:border-brand/30" : "focus:border-brand/30"
                        )}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-white/55 ml-1">크루 정원</Label>
                    <div className="grid grid-cols-5 gap-2 p-1 bg-surface-2 border border-surface-line rounded-tile">
                        {[10, 20, 30, 50, 100].map(num => (
                            <button
                                key={num}
                                disabled={!isLeader}
                                onClick={() => setFormData(prev => ({ ...prev, maxMembers: num }))}
                                className={cn(
                                    "h-10 rounded-tile text-xs font-semibold tabular-nums transition-colors",
                                    formData.maxMembers === num
                                        ? "bg-brand text-brand-fg"
                                        : "text-white/55 hover:text-white/80 hover:bg-white/5"
                                )}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-white/55 ml-1">소개글</Label>
                    <Textarea
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        disabled={!isLeader}
                        placeholder="크루에 대해 소개해 주세요..."
                        className={cn(
                            "bg-surface-2 border-surface-line resize-none min-h-[100px] text-sm leading-relaxed rounded-tile focus:ring-0 focus-visible:ring-0 placeholder:text-white/45 custom-scrollbar",
                            crew?.sportCategory === "GOLF" ? "focus:border-brand/30" : "focus:border-brand/30"
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                        <Label className="text-xs font-semibold text-white/55 ml-1">정모 요일</Label>
                        <Input
                            value={formData.meetingDay}
                            onChange={e => setFormData(prev => ({ ...prev, meetingDay: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 토요일"
                            className="bg-surface-2 border-surface-line h-10 text-sm font-medium rounded-tile"
                        />
                    </div>
                    <div className="space-y-1.5 text-left">
                        <Label className="text-xs font-semibold text-white/55 ml-1">시간</Label>
                        <Input
                            value={formData.meetingTime}
                            onChange={e => setFormData(prev => ({ ...prev, meetingTime: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 2시"
                            className="bg-surface-2 border-surface-line h-10 text-sm font-medium rounded-tile"
                        />
                    </div>
                </div>

                <div className="pt-4 pb-4">
                    {isLeader ? (
                        <Button
                            onClick={handleSave}
                            disabled={!isDirty || isUpdating || isUploading}
                            className={cn(
                                "w-full h-12 text-brand-fg rounded-tile font-bold text-sm transition-colors active:scale-[0.98] disabled:opacity-30",
                                crew?.sportCategory === "GOLF"
                                    ? "bg-brand hover:bg-brand/90"
                                    : "bg-brand hover:bg-brand/90"
                            )}
                        >
                            {isUpdating || isUploading ? (
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                            ) : "변경사항 저장"}
                        </Button>
                    ) : (
                        <div className="p-4 bg-surface-2 border border-surface-line rounded-tile text-center text-xs font-medium text-white/55 leading-relaxed">
                            기본 정보 수정 권한은 크루장에게만 있습니다
                        </div>
                    )}
                </div>

                {isLeader && (
                    <div className="pt-4 border-t border-surface-line">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    disabled={isDeleting}
                                    className="w-full h-12 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-tile text-xs font-bold transition-colors"
                                >
                                    {isDeleting ? "삭제 중..." : "크루 폐쇄"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#141416] border-white/10 text-white rounded-card">
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
