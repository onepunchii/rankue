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
                    <div
                        onClick={() => isLeader && document.getElementById('settings-cover-upload')?.click()}
                        className={cn(
                            "relative group/cover h-[140px] rounded-tile bg-surface-3 overflow-hidden",
                            isLeader && "cursor-pointer"
                        )}
                    >
                        {formData.coverImage ? (
                            <img src={formData.coverImage} className="w-full h-full object-cover opacity-80" alt="Cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-surface-3 text-black/55">
                                <LucideImagePlus className="w-8 h-8 mb-2" />
                                <span className="text-xs font-semibold">크루 커버 이미지</span>
                            </div>
                        )}
                        {isLeader && (
                            <>
                                {/* Desktop: hover-reveal overlay */}
                                <div className="absolute inset-0 bg-black/40 hidden md:flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity pointer-events-none">
                                    <div className="flex flex-col items-center gap-2">
                                        <LucideImagePlus className="w-6 h-6 text-white" />
                                        <span className="text-xs font-bold text-white">커버 변경</span>
                                    </div>
                                </div>
                                {/* Touch: persistent affordance */}
                                <div className="md:hidden absolute bottom-2 right-2 flex items-center gap-1.5 h-9 px-3 rounded-pill bg-black/60 pointer-events-none">
                                    <LucideImagePlus className="w-4 h-4 text-white" />
                                    <span className="text-xs font-bold text-white">커버 변경</span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-4 -mt-10 px-4 relative z-10">
                        <div
                            onClick={(e) => { e.stopPropagation(); if (isLeader) document.getElementById('settings-logo-upload')?.click(); }}
                            className={cn("relative group/logo flex-shrink-0", isLeader && "cursor-pointer")}
                        >
                            <div className="w-20 h-20 rounded-tile bg-surface-3 border-2 overflow-hidden relative border-brand/30 group-hover/logo:border-brand transition-colors">
                                {formData.emblem ? (
                                    <img src={formData.emblem} className="w-full h-full object-cover" alt="Emblem" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-surface-2">
                                        <LucideCamera className="w-6 h-6 text-black/40" />
                                    </div>
                                )}
                                {isLeader && (
                                    <div className="absolute inset-0 bg-black/40 hidden md:flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity pointer-events-none">
                                        <LucideCamera className="w-5 h-5 text-white" />
                                    </div>
                                )}
                            </div>
                            {isLeader && (
                                <div className="md:hidden absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand border-2 border-white flex items-center justify-center pointer-events-none">
                                    <LucideCamera className="w-3.5 h-3.5 text-brand-fg" />
                                </div>
                            )}
                        </div>
                        <div className="pb-1">
                            <h3 className="text-sm font-bold text-[rgba(0,0,0,0.87)]">크루 엠블럼</h3>
                            <p className="text-xs text-black/55 font-medium mt-0.5">로고 수정</p>
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
                    <Label className="text-xs font-semibold text-black/55 ml-1">크루 명칭</Label>
                    <Input
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        disabled={!isLeader}
                        placeholder="동호회 이름"
                        className="bg-surface-3 border-surface-line h-10 text-sm font-bold rounded-tile focus:ring-0 focus-visible:ring-0 focus:border-brand/30 placeholder:text-black/40"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-black/55 ml-1">슬로건</Label>
                    <Input
                        value={formData.shortIntro}
                        onChange={e => setFormData(prev => ({ ...prev, shortIntro: e.target.value }))}
                        disabled={!isLeader}
                        placeholder={crew?.sportCategory === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                        className="bg-surface-3 border-surface-line h-10 text-sm font-medium rounded-tile focus:ring-0 focus-visible:ring-0 focus:border-brand/30 placeholder:text-black/40"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-black/55 ml-1">크루 정원</Label>
                    <div className="grid grid-cols-5 gap-2 p-1 bg-surface-3 rounded-tile">
                        {[10, 20, 30, 50, 100].map(num => (
                            <button
                                key={num}
                                disabled={!isLeader}
                                onClick={() => setFormData(prev => ({ ...prev, maxMembers: num }))}
                                className={cn(
                                    "h-10 rounded-tile text-xs font-semibold tabular-nums transition-colors",
                                    formData.maxMembers === num
                                        ? "bg-brand text-brand-fg"
                                        : "text-black/55 hover:text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06]"
                                )}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-black/55 ml-1">소개글</Label>
                    <Textarea
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        disabled={!isLeader}
                        placeholder="크루에 대해 소개해 주세요..."
                        className="bg-surface-3 border-surface-line resize-none min-h-[100px] text-sm leading-relaxed rounded-tile focus:ring-0 focus-visible:ring-0 focus:border-brand/30 placeholder:text-black/40 custom-scrollbar"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                        <Label className="text-xs font-semibold text-black/55 ml-1">정모 요일</Label>
                        <Input
                            value={formData.meetingDay}
                            onChange={e => setFormData(prev => ({ ...prev, meetingDay: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 토요일"
                            className="bg-surface-3 border-surface-line h-10 text-sm font-medium rounded-tile placeholder:text-black/40"
                        />
                    </div>
                    <div className="space-y-1.5 text-left">
                        <Label className="text-xs font-semibold text-black/55 ml-1">시간</Label>
                        <Input
                            value={formData.meetingTime}
                            onChange={e => setFormData(prev => ({ ...prev, meetingTime: e.target.value }))}
                            disabled={!isLeader}
                            placeholder="예: 2시"
                            className="bg-surface-3 border-surface-line h-10 text-sm font-medium rounded-tile placeholder:text-black/40"
                        />
                    </div>
                </div>

                <div className="pt-4 pb-4">
                    {isLeader ? (
                        <Button
                            onClick={handleSave}
                            disabled={!isDirty || isUpdating || isUploading}
                            className="w-full h-12 text-brand-fg rounded-tile font-bold text-sm transition-colors active:scale-[0.98] disabled:opacity-30 bg-brand hover:bg-brand-strong"
                        >
                            {isUpdating || isUploading ? (
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                            ) : "변경사항 저장"}
                        </Button>
                    ) : (
                        <div className="p-4 bg-surface-3 rounded-tile text-center text-xs font-medium text-black/55 leading-relaxed">
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
                                    className="w-full h-12 text-red-600/80 hover:text-red-600 hover:bg-red-500/10 border border-red-500/20 rounded-tile text-xs font-bold transition-colors"
                                >
                                    {isDeleting ? "삭제 중..." : "크루 폐쇄"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] rounded-card">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>정말로 크루를 삭제하시겠습니까?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-black/60">
                                        이 작업은 되돌릴 수 없으며, 모든 크루 데이터와 멤버 정보가 영구적으로 삭제됩니다.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06]">취소</AlertDialogCancel>
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
