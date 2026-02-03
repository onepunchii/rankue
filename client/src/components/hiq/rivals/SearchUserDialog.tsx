
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideSearch } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchResult, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";

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
            <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 text-white max-w-lg w-[95%] rounded-[3rem] p-0 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                <div className="p-10 bg-gradient-to-br from-white/[0.02] to-transparent">
                    <DialogHeader className="mb-8">
                        <div className="flex flex-col">
                            <DialogTitle className="text-4xl font-black tracking-tighter text-white">
                                {config.label} 검색
                            </DialogTitle>
                            <DialogDescription className={cn(
                                "text-[10px] font-black uppercase tracking-[0.2em] mt-1",
                                config.themeColor, "opacity-60"
                            )}>Smart matching system</DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="relative group mb-6">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                            <LucideSearch className={cn(
                                "w-6 h-6 text-white/10 transition-colors",
                                "group-focus-within:opacity-100",
                                currentSport === "GOLF" ? "group-focus-within:text-[#84cc16]" : "group-focus-within:text-[#10b981]"
                            )} />
                        </div>
                        <Input
                            placeholder={config.searchPlaceholder}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                if (hasSearched) setHasSearched(false);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className={cn(
                                "h-20 pl-16 pr-8 bg-white/[0.03] border border-white/5 text-white placeholder:text-white/10 rounded-[2rem] text-xl font-bold transition-all shadow-inner outline-none ring-0 focus-visible:ring-0",
                                currentSport === "GOLF" ? "focus:border-[#84cc16]/50" : "focus:border-[#10b981]/50"
                            )}
                        />
                    </div>

                    <Button
                        onClick={handleSearch}
                        disabled={!keyword.trim() || isSearching}
                        className={cn(
                            "w-full h-16 text-black font-black rounded-2xl text-lg shadow-2xl transition-all active:scale-[0.98] outline-none ring-0",
                            config.bgColor, "hover:opacity-90",
                            isSearching ? 'opacity-50' : ''
                        )}
                    >
                        {isSearching ? (
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    className="w-6 h-6 border-2 border-black border-t-transparent rounded-full"
                                />
                                <span>검색 중...</span>
                            </div>
                        ) : (currentSport === "GOLF" ? "Find Friend" : "Match Me")}
                    </Button>
                </div>

                <div className="px-10 pb-10 max-h-[45vh] overflow-y-auto scrollbar-hide space-y-4">
                    {!isSearching && hasSearched && searchResults.length === 0 && (
                        <div className="py-16 text-center">
                            <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">해당하는 멤버가 없습니다</p>
                        </div>
                    )}

                    <AnimatePresence>
                        {searchResults.map((result, idx) => {
                            const handi = currentSport === "GOLF" ? result.golfHandicap : result.handi4c;
                            const tier = getTier(handi || 0, false, currentSport);
                            return (
                                <motion.div
                                    key={result.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-center text-3xl">
                                                {tier.icon}
                                            </div>
                                            <div>
                                                <p className="font-black text-xl text-white tracking-tighter mb-0.5">{result.name}</p>
                                                <p className={cn("text-[9px] font-black uppercase tracking-widest", tier.class)}>{tier.label} Tier</p>
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
                                                "px-6 py-3 rounded-xl font-black text-xs transition-all shadow-xl",
                                                result.isFriend
                                                    ? 'bg-white/5 text-white/20'
                                                    : 'bg-white text-black active:scale-95'
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
