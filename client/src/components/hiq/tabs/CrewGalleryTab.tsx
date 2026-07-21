import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { uploadImage } from "@/lib/imageUtils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LucideImage, LucideLoader2 } from "@/lib/icons";
import { PhotoDetailDialog } from "@/components/hiq/PhotoDetailDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface PhotoAuthor {
    name: string;
    profileImageUrl?: string;
}

interface Photo {
    id: string;
    crewId: string;
    uploaderId: string;
    url: string;
    createdAt: string;
    author?: PhotoAuthor;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
}

interface CrewGalleryTabProps {
    crewId: string;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
}

export function CrewGalleryTab({ crewId, isMember, isAdmin, currentMemberId }: CrewGalleryTabProps) {
    const { toast } = useToast();
    const { t } = useT();
    // Track only the id, then re-derive the photo from the live list cache so the detail
    // dialog reflects fresh like/comment counts after invalidation (a snapshot would go stale).
    const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
    const [isPhotoDetailOpen, setIsPhotoDetailOpen] = useState(false);
    // Tracks the compression + blob-upload phase (before the metadata POST mutation runs).
    const [isProcessing, setIsProcessing] = useState(false);

    // 1. Fetch Photo Gallery
    const { data: photos, isLoading } = useQuery<Photo[]>({
        queryKey: [`/api/hiq/crews/${crewId}/photos`],
        enabled: !!crewId,
    });

    // 2. Photo Upload Mutation with Optimistic Update
    const uploadPhotoMutation = useMutation({
        mutationFn: async (url: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/photos`, {
                method: "POST",
                body: JSON.stringify({ url })
            });
        },
        onMutate: async (newPhotoUrl) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: [`/api/hiq/crews/${crewId}/photos`] });

            // Snapshot the previous value
            const previousPhotos = queryClient.getQueryData<Photo[]>([`/api/hiq/crews/${crewId}/photos`]);

            // Optimistically update to the new value
            if (previousPhotos) {
                const optimisticPhoto: Photo = {
                    id: `temp-${Date.now()}`,
                    crewId,
                    uploaderId: currentMemberId || "",
                    url: newPhotoUrl, // Show the compressed base64 immediately
                    createdAt: new Date().toISOString(),
                    likeCount: 0,
                    commentCount: 0,
                    isLiked: false,
                    author: { name: t("crewGallery.uploading") }
                };
                queryClient.setQueryData<Photo[]>([`/api/hiq/crews/${crewId}/photos`], [optimisticPhoto, ...previousPhotos]);
            }

            return { previousPhotos };
        },
        onError: (err, _, context) => {
            // Rollback
            if (context?.previousPhotos) {
                queryClient.setQueryData([`/api/hiq/crews/${crewId}/photos`], context.previousPhotos);
            }
            toast({
                title: t("crewGallery.uploadFailedTitle"),
                description: t("crewGallery.uploadFailedDesc"),
                variant: "destructive"
            });
        },
        onSettled: () => {
            // Sync with server
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/photos`] });
        }
    });

    // 3. Handle File Selection and Compression
    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Simple validation
        if (!file.type.startsWith('image/')) {
            toast({ title: t("crewGallery.invalidTypeTitle"), description: t("crewGallery.invalidTypeDesc"), variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        try {
            const url = await uploadImage(file, 'crew-photo');
            uploadPhotoMutation.mutate(url);
        } catch (error) {
            console.error("[CrewGalleryTab] Image compression failed:", error);
            toast({ title: t("crewGallery.processFailedTitle"), description: t("crewGallery.processFailedDesc"), variant: "destructive" });
        } finally {
            setIsProcessing(false);
            e.target.value = "";
        }
    };

    const handlePhotoClick = (photo: Photo) => {
        if (!isMember) {
            toast({
                title: t("crewGallery.accessDeniedTitle"),
                description: t("crewGallery.accessDeniedDesc"),
                variant: "destructive"
            });
            return;
        }
        setSelectedPhotoId(photo.id);
        setIsPhotoDetailOpen(true);
    };

    if (isLoading) {
        return (
            <div className="pt-6">
                <div className="flex items-center justify-between mb-6 px-6">
                    <Skeleton className="h-5 w-16 bg-black/[0.04]" />
                    <Skeleton className="h-9 w-24 rounded-xl bg-black/[0.04]" />
                </div>
                <div className="grid grid-cols-3 gap-[1px]">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square bg-black/[0.04]" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="pt-6">
            <header className="flex items-center justify-between mb-6 px-6">
                <h2 className="text-[15px] font-semibold text-black/55">{t("crewGallery.title")}</h2>
                {isMember && (
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            id="gallery-upload"
                            title={t("crewGallery.uploadInputTitle")}
                            className="hidden"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            disabled={isProcessing || uploadPhotoMutation.isPending}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-black/10 text-[rgba(0,0,0,0.87)] font-semibold text-xs rounded-xl h-9 px-4 flex items-center gap-2 bg-transparent hover:bg-black/[0.04]"
                            onClick={() => document.getElementById('gallery-upload')?.click()}
                            disabled={isProcessing || uploadPhotoMutation.isPending}
                        >
                            {(isProcessing || uploadPhotoMutation.isPending) ? (
                                <LucideLoader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <LucideImage className="w-3.5 h-3.5" />
                            )}
                            {(isProcessing || uploadPhotoMutation.isPending) ? t("crewGallery.uploading") : t("crewGallery.upload")}
                        </Button>
                    </div>
                )}
            </header>

            {photos && photos.length > 0 ? (
                <div
                    className="grid grid-cols-3 gap-[1px]"
                    aria-label={t("crewGallery.gridAria")}
                >
                    {photos.map((photo) => {
                        const isOptimistic = photo.id.startsWith('temp-');
                        return (
                            <div
                                key={photo.id}
                                className={cn(
                                    "aspect-square bg-black/[0.04] overflow-hidden relative group cursor-pointer outline-none focus:ring-2 focus:ring-brand z-0",
                                    isOptimistic && "opacity-50 grayscale-[0.5]"
                                )}
                                role="button"
                                tabIndex={0}
                                aria-label={t("crewGallery.photoDetailAria") + " - " + (photo.author?.name || t("crewGallery.anonymous"))}
                                onClick={() => !isOptimistic && handlePhotoClick(photo)}
                                onKeyDown={(e) => {
                                    if (!isOptimistic && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        handlePhotoClick(photo);
                                    }
                                }}
                            >
                                <img
                                    src={photo.url}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    alt={photo.author ? photo.author.name + t("crewGallery.photoBySuffix") : t("crewGallery.crewPhotoAlt")}
                                    loading="lazy"
                                />
                                {isOptimistic && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <LucideLoader2 className="w-6 h-6 text-black/40 animate-spin" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-32 text-center px-6">
                    <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mx-auto mb-4">
                        <LucideImage className="w-7 h-7 text-black/40" />
                    </div>
                    <p className="text-[15px] font-medium text-ink-2 mb-1">{t("crewGallery.emptyTitle")}</p>
                    <p className="text-[13px] text-ink-4">{t("crewGallery.emptyDesc")}</p>
                </div>
            )}

            {/* Photo Detail Popup */}
            <PhotoDetailDialog
                open={isPhotoDetailOpen}
                onOpenChange={setIsPhotoDetailOpen}
                photo={photos?.find(p => p.id === selectedPhotoId) ?? null}
                isAdmin={isAdmin}
                currentMemberId={currentMemberId}
            />
        </div>
    );
}

