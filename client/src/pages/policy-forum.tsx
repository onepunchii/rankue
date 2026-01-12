import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, ThumbsUp, Search, Plus, Send, BarChart3, User, FileText, ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import MobileHeader from "@/components/mobile-header";
import GuestRestrictionModal from "@/components/GuestRestrictionModal";

interface Discussion {
  id: number;
  userId: string;
  surveyId: number | null;
  content: string;
  likeCount: number;
  createdAt: string;
  userNickname?: string;
  surveyTitle?: string;
  isLiked?: boolean;
  poll?: QuickPoll | null;
  attachedCard?: {
    type: 'survey' | 'assembly' | 'local';
    id: number | string;
    title: string;
    subtitle?: string;
    link?: string;
  } | null;
}

interface QuickPoll {
  id: number;
  question: string;
  options: string[];
  voteCount: number;
  voteCounts?: { index: number; count: number }[];
  userVote?: number | null;
}

interface SearchResult {
  surveys: any[];
  assemblyMembers: any[];
  localCouncilMembers: any[];
  messages: any[];
}

export default function PolicyForum() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions] = useState(["좋아요 👍", "싫어요 👎"]);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: discussions = [], isLoading } = useQuery<Discussion[]>({
    queryKey: ["/api/policy-forum/all-discussions"],
    refetchInterval: 10000,
  });

  const { data: searchResults } = useQuery<SearchResult>({
    queryKey: ["/api/search", searchQuery],
    enabled: searchQuery.length >= 2,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [discussions]);

  const postMessageMutation = useMutation({
    mutationFn: async (data: { surveyId: number | null; content: string; attachedCard?: any }) => {
      return await apiRequest("/api/policy-forum/discussions", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/policy-forum/all-discussions"] });
    },
    onError: (error: any) => {
      if (error.status === 403 || error.message?.includes("인증")) {
        setIsGuestModalOpen(true);
      } else {
        toast({
          title: "오류가 발생했습니다",
          description: error.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (discussionId: number) => {
      return await apiRequest(`/api/policy-forum/discussions/${discussionId}/like`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-forum/all-discussions"] });
    },
    onError: (error: any) => {
      if (error.status === 403) setIsGuestModalOpen(true);
    }
  });

  const createPollMutation = useMutation({
    mutationFn: async (data: { question: string; options: string[] }) => {
      return await apiRequest("/api/quick-polls", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setShowPollModal(false);
      setPollQuestion("");
      queryClient.invalidateQueries({ queryKey: ["/api/policy-forum/all-discussions"] });
      toast({ title: "✅ 투표가 생성되었습니다" });
    },
    onError: (error: any) => {
      if (error.status === 403) setIsGuestModalOpen(true);
    }
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) return;

    if (messageText.length < 5) {
      toast({
        title: "메시지가 너무 짧습니다",
        description: "최소 5자 이상 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!user || user.isGuest) {
      setIsGuestModalOpen(true);
      return;
    }

    postMessageMutation.mutate({ surveyId: null, content: messageText });
  };

  const handleCreatePoll = () => {
    if (!pollQuestion.trim()) return;
    if (!user || user.isGuest) {
      setIsGuestModalOpen(true);
      return;
    }
    createPollMutation.mutate({ question: pollQuestion, options: pollOptions });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <MobileHeader showBack={true} />

      <main className="max-w-md mx-auto pb-40">
        <section className="px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-purple-500/60 uppercase tracking-[0.2em]">Live Discussion</span>
              </div>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter">정책 토론장</h1>
            </div>

            <Dialog open={showPollModal} onOpenChange={setShowPollModal}>
              <DialogTrigger asChild>
                <Button className="w-12 h-12 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 p-0 flex items-center justify-center transition-all">
                  <Plus className="h-6 w-6" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100%-2rem)] mx-auto glass-card-strong border-white/10 bg-black/90 backdrop-blur-3xl p-8 rounded-3xl">
                <DialogHeader className="text-left mb-6">
                  <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center mb-4">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <DialogTitle className="text-2xl font-black text-white italic uppercase tracking-tighter">간단 투표 만들기</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">질문 내용</label>
                    <Input
                      placeholder="이 정책에 찬성하시나요?"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      className="bg-white/5 border-white/5 text-white h-14 rounded-2xl px-4 focus:ring-purple-500/50"
                    />
                  </div>
                  <div className="flex gap-3">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5 text-center text-sm font-bold text-white/60 italic">
                        {opt}
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={handleCreatePoll}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-purple-500/20 transition-all"
                  >
                    투표 생성하기
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20" />
            <Input
              placeholder="설문, 국회의원, 기초의원 검색..."
              className="w-full bg-white/5 border-white/5 text-white h-14 pl-12 pr-4 rounded-2xl focus:ring-purple-500/50 text-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <AnimatePresence>
              {searchQuery.length >= 2 && searchResults && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-16 left-0 right-0 z-50 glass-card-strong border-white/10 bg-black/90 backdrop-blur-3xl rounded-3xl p-4 overflow-hidden max-h-80 overflow-y-auto scrollbar-hide shadow-2xl"
                >
                  <div className="space-y-6">
                    {[
                      { title: '설문조사', data: searchResults.surveys, icon: FileText, type: 'survey' },
                      { title: '국회의원', data: searchResults.assemblyMembers, icon: User, type: 'assembly' },
                      { title: '기초의원', data: searchResults.localCouncilMembers, icon: User, type: 'local' }
                    ].map((section, idx) => section.data.length > 0 && (
                      <div key={idx}>
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <section.icon className="h-3 w-3" />
                          {section.title}
                        </h3>
                        <div className="space-y-2">
                          {section.data.map((item: any) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                postMessageMutation.mutate({
                                  surveyId: null,
                                  content: `📊 ${section.title} 정보를 공유했습니다`,
                                  attachedCard: {
                                    type: section.type as any,
                                    id: item.id,
                                    title: item.name || item.title,
                                    subtitle: item.party ? `${item.party} · ${item.constituency || item.electionName}` : `참여자 ${item.participantCount}명`,
                                    link: section.type === 'survey' ? `/surveys/${item.id}` : section.type === 'assembly' ? `/assembly/${item.id}` : `/local-council/${item.id}`
                                  }
                                });
                                setSearchQuery("");
                              }}
                              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left group"
                            >
                              <div>
                                <p className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">{item.name || item.title}</p>
                                <p className="text-[10px] font-medium text-white/30 italic mt-0.5">
                                  {item.party ? `${item.party} · ${item.constituency || item.electionName}` : `Participants ${item.participantCount}`}
                                </p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/10 group-hover:text-purple-400 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {searchResults.messages.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <MessageCircle className="h-3 w-3" />
                          최근 토론
                        </h3>
                        <div className="space-y-3">
                          {searchResults.messages.map((msg: any) => (
                            <button
                              key={msg.id}
                              onClick={() => {
                                const el = document.getElementById(`msg-${msg.id}`);
                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setSearchQuery("");
                              }}
                              className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-black">
                                  {msg.userNickname?.charAt(0) || "?"}
                                </div>
                                <span className="text-[10px] font-black text-white/40 italic">{msg.userNickname || "익명"}</span>
                              </div>
                              <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">{msg.content}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </section>

        <section className="px-6 space-y-6">
          <AnimatePresence mode="popLayout">
            {discussions.map((discussion) => {
              const isMyMessage = user?.id === discussion.userId;
              return (
                <motion.div
                  key={discussion.id}
                  id={`msg-${discussion.id}`}
                  initial={{ opacity: 0, x: isMyMessage ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex gap-3 ${isMyMessage ? 'flex-row-reverse' : 'items-start'}`}
                >
                  {!isMyMessage && (
                    <div className="w-10 h-10 rounded-2xl bg-purple-600/20 flex items-center justify-center text-purple-400 font-black text-sm border border-purple-500/20 shadow-[0_0_15px_rgba(147,51,234,0.1)] flex-shrink-0">
                      {discussion.userNickname?.charAt(0) || "?"}
                    </div>
                  )}

                  <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className={`flex items-center gap-2 mb-2 ${isMyMessage ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-widest italic leading-none">
                        {discussion.userNickname || "익명"}
                      </span>
                      <span className="text-[9px] font-bold text-white/20 italic leading-none">
                        {formatDistanceToNow(new Date(discussion.createdAt), { addSuffix: true, locale: ko })}
                      </span>
                    </div>

                    <div className={`${isMyMessage ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/10' : 'glass-card-light border-white/5 bg-white/[0.03] text-white/90'} px-5 py-3.5 rounded-3xl break-words leading-relaxed text-sm font-medium`}>
                      {discussion.content}
                      {discussion.attachedCard && (
                        <motion.a
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          href={discussion.attachedCard.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block mt-4 p-4 rounded-2xl border ${isMyMessage ? 'bg-black/20 border-white/10' : 'bg-white/5 border-white/5'} transition-all group`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl ${isMyMessage ? 'bg-white/10' : 'bg-purple-600/10'} flex items-center justify-center shrink-0`}>
                              {discussion.attachedCard.type === 'survey' ? (
                                <BarChart3 className={`h-5 w-5 ${isMyMessage ? 'text-white' : 'text-purple-400'}`} />
                              ) : (
                                <User className={`h-5 w-5 ${isMyMessage ? 'text-white' : 'text-purple-400'}`} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-black uppercase tracking-tight truncate ${isMyMessage ? 'text-white' : 'text-white/90'} group-hover:text-purple-400 transition-colors`}>
                                {discussion.attachedCard.title}
                              </p>
                              <p className={`text-[9px] font-bold italic mt-1 uppercase ${isMyMessage ? 'text-white/50' : 'text-white/30'}`}>
                                {discussion.attachedCard.subtitle}
                              </p>
                            </div>
                          </div>
                        </motion.a>
                      )}
                    </div>

                    <button
                      onClick={() => likeMutation.mutate(discussion.id)}
                      className={`flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${discussion.isLiked ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
                    >
                      <ThumbsUp className={`h-3 w-3 ${discussion.isLiked ? 'fill-current' : ''}`} />
                      <span>{discussion.likeCount}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </section>
      </main>

      <section className="fixed bottom-0 left-0 right-0 z-40">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/95 to-transparent h-40 -top-20 pointer-events-none"></div>
        <div className="max-w-md mx-auto px-6 pb-12 pt-6 relative">
          <div className="flex items-end gap-3 glass-card-strong border-white/10 bg-white/[0.05] backdrop-blur-3xl p-3 rounded-[32px] shadow-2xl">
            <Textarea
              placeholder="메시지를 입력하세요..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 min-h-[56px] max-h-[160px] bg-transparent border-none text-white placeholder:text-white/20 px-4 py-4 resize-none text-sm font-bold focus-visible:ring-0 focus-visible:ring-offset-0 scrollbar-hide"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSendMessage}
              disabled={postMessageMutation.isPending || !messageText.trim()}
              className="w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/30 disabled:opacity-20 disabled:grayscale transition-all"
            >
              <Send className="h-6 w-6" />
            </motion.button>
          </div>
        </div>
      </section>

      <GuestRestrictionModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        feature="토론 참여"
        description="정책 토론에 참여하려면 회원가입이 필요합니다. 회원가입하고 더 많은 기능을 이용해보세요!"
      />
    </div>
  );
}
