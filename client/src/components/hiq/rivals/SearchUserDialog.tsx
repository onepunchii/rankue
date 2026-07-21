
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideSearch } from "@/lib/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchResult, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";
import { flagEmoji } from "@/lib/flag";

interface SearchUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: SportConfig;
    currentSport: string;
    onSearch: (keyword: string) => void;
    searchResults: SearchResult[];
    isSearching: boolean;
    onAddFriend: (id: string) => void;
}

export const SearchUserDialog = ({
    open,
    onOpenChange,
    config,
    currentSport,
    onSearch,
    searchResults,
    isSearching,
    onAddFriend
}: SearchUserDialogProps) => {
    const [keyword, setKeyword] = useState("");
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = () => {
        if (keyword.trim()) {
            onSearch(keyword);
            setHasSearched(true);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            onOpenChange(val);
            if (!val) {
                setHasSearched(false);
                setKeyword("");
            }
        }}>
            <DialogContent className="bg-white text-ink-1 max-w-lg w-[95%] rounded-card p-0 overflow-hidden">
                <div className="p-6">
                    <DialogHeader className="mb-6">
                        <div className="flex flex-col">
                            <DialogTitle className="text-[26px] font-bold tracking-tight text-ink-1">
                                {config.label} 검색
                            </DialogTitle>
                            <DialogDescription className="text-[13px] font-medium text-black/55 mt-1">
                                닉네임이나 전화번호로 상대를 찾아보세요
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="relative group mb-4">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <LucideSearch className="w-5 h-5 text-black/40 transition-colors group-focus-within:text-brand" />
                        </div>
                        <Input
                            placeholder={config.searchPlaceholder}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                if (hasSearched) setHasSearched(false);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="h-14 pl-12 pr-5 bg-black/[0.04] text-ink-1 placeholder:text-black/40 rounded-tile text-[15px] font-medium transition-all outline-none ring-0 focus-visible:ring-0 focus:border-brand/50"
                        />
                    </div>

                    <Button
                        onClick={handleSearch}
                        disabled={!keyword.trim() || isSearching}
                        className={cn(
                            "w-full h-14 rk-btn-primary rounded-tile text-[15px] active:scale-[0.98] outline-none ring-0",
                            isSearching ? 'opacity-50' : ''
                        )}
                    >
                        {isSearching ? (
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                                />
                                <span>검색 중...</span>
                            </div>
                        ) : (currentSport === "GOLF" ? "친구 찾기" : "상대 찾기")}
                    </Button>
                </div>

                <div className="px-6 pb-6 max-h-[45vh] overflow-y-auto scrollbar-hide space-y-3">
                    {!isSearching && hasSearched && searchResults.length === 0 && (
                        <div className="py-16 text-center">
                            <p className="text-[13px] font-medium text-black/55">검색 결과가 없습니다</p>
                        </div>
                    )}

                    <AnimatePresence>
                        {searchResults.map((result, idx) => {
                            const golfScore = Number((result.golfAvgScore || 0) > 0 ? result.golfAvgScore : (result.golfHandicap || 0) + 72);
                            const handi = currentSport === "GOLF" ? golfScore : result.handi4c;
                            const tier = getTier(Number(handi || 0), false, currentSport);
                            return (
                                <motion.div
                                    key={result.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <div className="rk-card p-4 flex items-center justify-between transition-colors hover:bg-black/[0.03]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-tile bg-black/[0.04] flex items-center justify-center text-2xl overflow-hidden">
                                                {(result as any).profileImageUrl ? (
                                                    <img
                                                        src={(result as any).profileImageUrl}
                                                        className="w-full h-full object-cover"
                                                        alt={result.name}
                                                    />
                                                ) : (
                                                    tier.icon
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-[17px] text-ink-1 tracking-tight mb-0.5">
                                                    {/* 국기 — 국가 단위 랭킹·글로벌 매칭의 시각 축 */}
                                                    {flagEmoji((result as any).countryCode) && <span className="mr-1">{flagEmoji((result as any).countryCode)}</span>}
                                                    {result.name}
                                                    {/* @핸들 — 동명이인 구분 (글로벌 유저 대비) */}
                                                    {(result as any).handle && <span className="ml-1.5 text-[13px] font-medium text-black/40">@{(result as any).handle}</span>}
                                                </p>
                                                <p className={cn("text-[12px] font-semibold", tier.class)}>{tier.label}</p>
                                            </div>
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                onAddFriend(result.id);
                                                onOpenChange(false);
                                                setKeyword("");
                                            }}
                                            disabled={result.isFriend}
                                            className={cn(
                                                "px-5 py-2.5 rounded-tile font-semibold text-[13px] transition-all",
                                                result.isFriend
                                                    ? 'bg-black/[0.06] text-black/40'
                                                    : 'rk-btn-primary active:scale-95'
                                            )}
                                        >
                                            {result.isFriend ? (currentSport === "GOLF" ? "친구" : "라이벌") : "추가하기"}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
};
