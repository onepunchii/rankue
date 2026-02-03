import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    LucideSettings2, LucideUsers2, LucideCrown, LucideShield,
    LucideUserX, LucideCheck, LucideTrash2, LucideCamera,
    LucideImagePlus, LucideLoader2, LucideX
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogClose
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Helper for image compression
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

interface ClubSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crew: any;
    members?: any[];
    me: any;
}

export function ClubSettingsDialog({ open, onOpenChange, crew, members: initialMembers, me }: ClubSettingsDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State for general info
    const [name, setName] = useState(crew?.name || '');
    const [shortIntro, setShortIntro] = useState(crew?.shortIntro || '');
    const [description, setDescription] = useState(crew?.description || '');
    const [maxMembers, setMaxMembers] = useState(crew?.maxMembers || 50);
    const [emblem, setEmblem] = useState(crew?.emblem);
    const [coverImage, setCoverImage] = useState(crew?.coverImage);
    const [meetingDay, setMeetingDay] = useState(crew?.meetingDay || '');
    const [meetingTime, setMeetingTime] = useState(crew?.meetingTime || '');
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (open && crew) {
            setName(crew.name || '');
            setShortIntro(crew.shortIntro || '');
            setDescription(crew.description || '');
            setMaxMembers(crew.maxMembers || 50);
            setEmblem(crew.emblem);
            setCoverImage(crew.coverImage);
            setMeetingDay(crew.meetingDay || '');
            setMeetingTime(crew.meetingTime || '');
        }
    }, [open, crew]);

    const { data: members = (initialMembers || []) as any[] } = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${crew?.id}/members`],
        enabled: open && !!crew?.id
    });

    const myMemberInfo = members.find((m: any) => m.member.id === me?.id);
    const isLeader = myMemberInfo?.role === 'leader';
    const isDirty = name !== (crew?.name || '') ||
        shortIntro !== (crew?.shortIntro || '') ||
        description !== (crew?.description || '') ||
        maxMembers !== (crew?.maxMembers || 50) ||
        emblem !== crew?.emblem ||
        coverImage !== crew?.coverImage ||
        meetingDay !== (crew?.meetingDay || '') ||
        meetingTime !== (crew?.meetingTime || '');

    const updateCrewMutation = useMutation({
        mutationFn: async (data: any) => {
            const res = await fetch(`/api/hiq/crews/${crew.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}`] });
            toast({ title: "크루 정보가 수정되었습니다" });
        },
        onError: (err: any) => {
            toast({ title: "수정 실패", description: err.message, variant: "destructive" });
        }
    });

    const updateRoleMutation = useMutation({
        mutationFn: async ({ memberId, role }: { memberId: number, role: string }) => {
            const res = await fetch(`/api/hiq/crews/${crew.id}/members/${memberId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}/members`] });
            toast({ title: "권한이 변경되었습니다" });
        }
    });

    const approveMutation = useMutation({
        mutationFn: async (memberId: number) => {
            const res = await fetch(`/api/hiq/crews/${crew.id}/members/${memberId}/approve`, { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}/members`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}`] });
            toast({ title: "가입이 승인되었습니다" });
        }
    });

    const kickMutation = useMutation({
        mutationFn: async (memberId: number) => {
            const res = await fetch(`/api/hiq/crews/${crew.id}/members/${memberId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}/members`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crew.id}`] });
            toast({ title: "처리되었습니다" });
        }
    });

    const deleteCrewMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/hiq/crews/${crew.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            window.location.href = '/hiq/menu';
        }
    });

    const handleSaveInfo = () => {
        updateCrewMutation.mutate({
            name, shortIntro, description, maxMembers, emblem, coverImage, meetingDay, meetingTime
        });
    };

    const handleDeleteCrew = () => {
        if (confirm("정말로 크루를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            deleteCrewMutation.mutate();
        }
    };

    const pendingMembers = members.filter((m: any) => m.role === 'pending');
    const activeMembers = members.filter((m: any) => m.role !== 'pending');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#121212] border-white/5 text-white max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 custom-scrollbar shadow-2xl">
                <div className="p-5 pb-0">
                    <DialogHeader className="mb-4">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm transition-colors",
                                crew?.sportCategory === "GOLF" ? "bg-[#84cc16]/10 border-[#84cc16]/20" : "bg-[#10b981]/10 border-[#10b981]/20"
                            )}>
                                <LucideSettings2 className={cn("w-5 h-5", crew?.sportCategory === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]")} />
                            </div>
                            <div className="flex flex-col">
                                <DialogTitle className="text-lg font-bold text-white tracking-tight leading-none">크루 관리</DialogTitle>
                                <DialogDescription className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1 leading-none">
                                    Crew Center
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-white/[0.03] border border-white/5 p-1 mb-5 rounded-xl h-10 relative overflow-hidden">
                            <TabsTrigger
                                value="general"
                                className={cn(
                                    "rounded-lg h-full text-[11px] font-bold uppercase tracking-wider transition-all duration-300 z-10",
                                    "data-[state=active]:text-black",
                                    crew?.sportCategory === "GOLF" ? "data-[state=active]:bg-[#84cc16]" : "data-[state=active]:bg-[#10b981]"
                                )}
                            >
                                <LucideSettings2 className="w-3.5 h-3.5 mr-1.5" />
                                기본 정보
                            </TabsTrigger>
                            <TabsTrigger
                                value="members"
                                className={cn(
                                    "rounded-lg h-full text-[11px] font-bold uppercase tracking-wider transition-all duration-300 z-10 relative",
                                    "data-[state=active]:text-black",
                                    crew?.sportCategory === "GOLF" ? "data-[state=active]:bg-[#84cc16]" : "data-[state=active]:bg-[#10b981]"
                                )}
                            >
                                <LucideUsers2 className="w-3.5 h-3.5 mr-1.5" />
                                멤버 관리
                                {pendingMembers.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold border-2 border-[#121212]">
                                        {pendingMembers.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="space-y-6 pb-6 focus-visible:outline-none outline-none border-none">
                            <div className="space-y-4">
                                {/* Emblem & Cover Upload Section */}
                                <div className="space-y-4">
                                    {/* 1. Cover Image Upload */}
                                    <div className="relative group/cover h-[140px] rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden transition-all duration-500 hover:border-white/10">
                                        {coverImage ? (
                                            <img src={coverImage} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt="Cover" />
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

                                    {/* 2. Emblem Upload (Floating Over Cover) */}
                                    <div className="flex items-center gap-4 -mt-10 px-4 relative z-10">
                                        <div className="relative group/logo flex-shrink-0">
                                            <div className={cn(
                                                "w-20 h-20 rounded-[1.8rem] bg-[#121212] border-2 overflow-hidden relative shadow-2xl transition-all duration-500",
                                                crew?.sportCategory === "GOLF" ? "border-[#84cc16]/30 group-hover/logo:border-[#84cc16]" : "border-[#10b981]/30 group-hover/logo:border-[#10b981]"
                                            )}>
                                                {emblem ? (
                                                    <img src={emblem} className="w-full h-full object-cover" alt="Emblem" />
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

                            <input type="file" id="settings-logo-upload" className="hidden" accept="image/*" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (file) {
                                    try { setIsUploading(true); const b64 = await compressImage(file); setEmblem(b64); }
                                    catch (err) { toast({ title: "이미지 처리 실패", variant: "destructive" }); }
                                    finally { setIsUploading(false); }
                                }
                            }} />
                            <input type="file" id="settings-cover-upload" className="hidden" accept="image/*" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (file) {
                                    try { setIsUploading(true); const b64 = await compressImage(file); setCoverImage(b64); }
                                    catch (err) { toast({ title: "이미지 처리 실패", variant: "destructive" }); }
                                    finally { setIsUploading(false); }
                                }
                            }} />


                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">크루 명칭</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        disabled={!isLeader}
                                        className={cn(
                                            "bg-white/[0.02] border-white/5 h-10 text-sm font-bold tracking-tight rounded-xl transition-all focus:ring-0 focus-visible:ring-0",
                                            crew?.sportCategory === "GOLF" ? "focus:border-[#84cc16]/30" : "focus:border-[#10b981]/30"
                                        )}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">슬로건</Label>
                                    <Input
                                        value={shortIntro}
                                        onChange={e => setShortIntro(e.target.value)}
                                        disabled={!isLeader}
                                        placeholder={crew?.sportCategory === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                                        className={cn(
                                            "bg-white/[0.02] border-white/5 h-10 text-sm font-medium rounded-xl transition-all focus:ring-0 focus-visible:ring-0 placeholder:text-white/10",
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
                                                onClick={() => setMaxMembers(num)}
                                                className={cn(
                                                    "h-10 rounded-xl text-[11px] font-black uppercase transition-all duration-300",
                                                    maxMembers === num
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
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        disabled={!isLeader}
                                        placeholder="크루에 대해 소개해 주세요..."
                                        className={cn(
                                            "bg-white/[0.02] border-white/5 resize-none min-h-[100px] text-sm leading-relaxed rounded-xl transition-all focus:ring-0 focus-visible:ring-0 placeholder:text-white/10 custom-scrollbar",
                                            crew?.sportCategory === "GOLF" ? "focus:border-[#84cc16]/30" : "focus:border-[#10b981]/30"
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">정모 요일</Label>
                                        <Input
                                            value={meetingDay}
                                            onChange={e => setMeetingDay(e.target.value)}
                                            disabled={!isLeader}
                                            placeholder="예: 토요일"
                                            className="bg-white/[0.02] border-white/5 h-10 text-xs font-bold rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-wider ml-1">시간</Label>
                                        <Input
                                            value={meetingTime}
                                            onChange={e => setMeetingTime(e.target.value)}
                                            disabled={!isLeader}
                                            placeholder="예: 2시"
                                            className="bg-white/[0.02] border-white/5 h-10 text-xs font-bold rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 pb-4">
                                    {isLeader ? (
                                        <Button
                                            onClick={handleSaveInfo}
                                            disabled={!isDirty || updateCrewMutation.isPending || isUploading}
                                            className={cn(
                                                "w-full h-12 text-black rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-300 active:scale-[0.98] disabled:opacity-20 disabled:shadow-none",
                                                crew?.sportCategory === "GOLF"
                                                    ? "bg-[#84cc16] hover:bg-[#a3e635] shadow-lg shadow-[#84cc16]/10"
                                                    : "bg-[#10b981] hover:bg-[#10b981]/90 shadow-lg shadow-[#10b981]/10"
                                            )}
                                        >
                                            {updateCrewMutation.isPending || isUploading ? (
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
                                        <Button
                                            variant="ghost"
                                            onClick={handleDeleteCrew}
                                            disabled={deleteCrewMutation.isPending}
                                            className="w-full h-12 text-red-500/40 hover:text-red-500 hover:bg-red-500/5 border border-red-500/10 rounded-xl text-[10px] font-bold uppercase tracking-[0.1em] transition-all"
                                        >
                                            {deleteCrewMutation.isPending ? "삭제 중..." : "크루 폐쇄 (Danger Zone)"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="members" className="space-y-8 pb-10 focus-visible:outline-none outline-none border-none pt-2">
                            <AnimatePresence>
                                {pendingMembers.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4"
                                    >
                                        <div className="flex items-center justify-between px-1">
                                            <h3 className={cn(
                                                "text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2",
                                                crew?.sportCategory === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]"
                                            )}>
                                                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", crew?.sportCategory === "GOLF" ? "bg-[#84cc16]" : "bg-[#10b981]")} />
                                                Pending Requests ({pendingMembers.length})
                                            </h3>
                                        </div>
                                        <div className="space-y-2">
                                            {pendingMembers.map((m: any) => (
                                                <motion.div
                                                    layout
                                                    key={m.member.id}
                                                    className={cn(
                                                        "flex items-center justify-between p-4 rounded-3xl border group transition-all duration-300",
                                                        crew?.sportCategory === "GOLF" ? "bg-[#84cc16]/5 border-[#84cc16]/10 hover:bg-[#84cc16]/10" : "bg-[#10b981]/5 border-[#10b981]/10 hover:bg-[#10b981]/10"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn(
                                                            "w-12 h-12 rounded-2xl bg-white/5 border flex items-center justify-center text-sm font-black shadow-xl relative overflow-hidden",
                                                            crew?.sportCategory === "GOLF" ? "text-[#84cc16] border-[#84cc16]/20" : "text-[#10b981] border-[#10b981]/20"
                                                        )}>
                                                            {m.member.profileImageUrl ? (
                                                                <img src={m.member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                                                            ) : (
                                                                m.member.nickname?.[0]
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm text-white/90">{m.member.nickname}</div>
                                                            <div className={cn("text-[10px] font-black tracking-tighter uppercase mt-0.5", crew?.sportCategory === "GOLF" ? "text-[#84cc16]/60" : "text-[#10b981]/60")}>가입 신청</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-10 w-10 p-0 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                                            onClick={() => kickMutation.mutate(m.member.id)}
                                                        >
                                                            <LucideUserX className="w-5 h-5" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className={cn(
                                                                "h-10 w-10 p-0 text-black rounded-xl shadow-lg transition-all",
                                                                crew?.sportCategory === "GOLF" ? "bg-[#84cc16] hover:bg-[#a3e635] shadow-[#84cc16]/20" : "bg-[#10b981] hover:bg-[#10b981]/90 shadow-[#10b981]/20"
                                                            )}
                                                            onClick={() => approveMutation.mutate(m.member.id)}
                                                        >
                                                            <LucideCheck className="w-5 h-5" />
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="space-y-5">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                                        Active Members ({activeMembers.length})
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {activeMembers.sort((a: any, b: any) => {
                                        const order = { leader: 0, manage: 1, member: 2, pending: 3 } as any;
                                        return order[a.role] - order[b.role];
                                    }).map((m: any) => {
                                        const isTargetMe = m.member.id === me?.id;
                                        const canKick = !isTargetMe && (
                                            (isLeader && m.role !== 'leader') ||
                                            (myMemberInfo?.role === 'manage' && m.role === 'member')
                                        );

                                        return (
                                            <motion.div
                                                layout
                                                key={m.member.id}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all duration-500 group",
                                                    crew?.sportCategory === "GOLF" ? "hover:border-[#84cc16]/20" : "hover:border-[#10b981]/20"
                                                )}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-black text-white/30 group-hover:text-white/60 transition-all duration-300 overflow-hidden shadow-sm shadow-black/40">
                                                        {m.member.profileImageUrl ? (
                                                            <img src={m.member.profileImageUrl} className="w-full h-full object-cover" alt="Profile" />
                                                        ) : m.member.nickname?.[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm flex items-center gap-2">
                                                            <span className={cn(isTargetMe ? (crew?.sportCategory === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]") : "text-white/90", "tracking-tight")}>
                                                                {m.member.nickname}
                                                            </span>
                                                            {m.role === 'leader' && (
                                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                                                    <LucideCrown className="w-2.5 h-2.5 text-yellow-500 fill-current" />
                                                                    <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">크루장</span>
                                                                </div>
                                                            )}
                                                            {m.role === 'manage' && (
                                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                                                    <LucideShield className="w-2.5 h-2.5 text-blue-400 fill-current" />
                                                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">부크루장</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="px-2 py-0.5 rounded-lg bg-white/5 text-[9px] font-black text-white/30 uppercase tracking-[0.1em]">
                                                                {crew?.sportCategory === "GOLF" ? `H ${m.member.golfHandicap || 0}` : `AVG ${(m.member.avg4c || 0).toFixed(1)}`}
                                                            </div>
                                                            {isTargetMe && (
                                                                <span className={cn("text-[9px] font-black uppercase tracking-widest", crew?.sportCategory === "GOLF" ? "text-[#84cc16]/50" : "text-[#10b981]/50")}>YOU</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                                    {isLeader && !isTargetMe && (
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            className={cn(
                                                                "h-9 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-white/5",
                                                                m.role === 'manage' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                                                            )}
                                                            onClick={() => {
                                                                const newRole = m.role === 'manage' ? 'member' : 'manage';
                                                                updateRoleMutation.mutate({ memberId: m.member.id, role: newRole });
                                                            }}
                                                        >
                                                            {m.role === 'manage' ? "권한 해제" : "운영진 임명"}
                                                        </Button>
                                                    )}
                                                    {canKick && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-10 w-10 p-0 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                                                            onClick={() => {
                                                                if (confirm(`${m.member.nickname}님을 내보내시겠습니까?`)) {
                                                                    kickMutation.mutate(m.member.id);
                                                                }
                                                            }}
                                                        >
                                                            <LucideUserX className="w-5 h-5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog >
    );
}
