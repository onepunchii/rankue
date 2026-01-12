import React, { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PlusCircle, Image, X, Users, Eye, Trophy, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { insertCelebrityBattleSchema } from '@shared/schema';
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";

// 배틀 생성 폼 스키마
const createBattleSchema = insertCelebrityBattleSchema.extend({
  participants: z.array(z.object({
    name: z.string().min(1, "참가자 이름을 입력해주세요"),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
  })).min(2, "최소 2명의 참가자가 필요합니다").max(8, "최대 8명까지 참가 가능합니다"),
});

type CreateBattleForm = z.infer<typeof createBattleSchema>;

// 카테고리 옵션 (Supabase DB 실제 데이터 기준)
const categoryOptions = [
  { value: 'male_solo', label: '남자 솔로', icon: '🎤' },
  { value: 'boy_group', label: '보이그룹', icon: '👯‍♂️' },
  { value: 'female_solo', label: '여자 솔로', icon: '🎤' },
  { value: 'girl_group', label: '걸그룹', icon: '👯‍♀️' },
  { value: 'trot_singer', label: '트로트 가수', icon: '🎵' },
  { value: 'global_idol', label: '글로벌 아이돌', icon: '🌍' },
  { value: 'actor_male', label: '남자 배우', icon: '🎬' },
  { value: 'actor_female', label: '여자 배우', icon: '🎬' },
  { value: 'sports_player', label: '스포츠', icon: '⚽' },
  { value: 'influencer', label: '인플루언서', icon: '📱' },
  { value: 'comedian', label: '개그맨', icon: '😂' },
];

// 더미 데이터 제거 - 실제 DB에서 가져옴

const CelebrityBattle = () => {
  const [activeCategory, setActiveCategory] = useState('male_solo');
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [participants, setParticipants] = useState([
    { name: '', description: '', imageUrl: '' },
    { name: '', description: '', imageUrl: '' }
  ]);

  // Mock Battles Data (User created battles added here immediately)
  const [activeBattles, setActiveBattles] = useState<any[]>([
    {
      id: '1',
      title: '2025년 최고의 K-POP 여성 아이돌',
      category: 'girl_group',
      participantsCount: 1247,
      status: 'LIVE',
      participants: [{ name: '카리나' }, { name: '장원영' }]
    },
    {
      id: '2',
      title: '프리미어리그 최고의 선수',
      category: 'sports_player',
      participantsCount: 856,
      status: 'LIVE',
      participants: [{ name: '손흥민' }, { name: '홀란드' }]
    }
  ]);

  const [selectedBattle, setSelectedBattle] = useState<any>(null);
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);

  const handleBattleClick = (battle: any) => {
    setSelectedBattle(battle);
    setIsVoteModalOpen(true);
  };

  const handleVote = (participantName: string) => {
    // Mock logic: Update vote count
    const updatedBattles = activeBattles.map(b => {
      if (b.id === selectedBattle.id) {
        return { ...b, participantsCount: b.participantsCount + 1 };
      }
      return b;
    });
    setActiveBattles(updatedBattles);

    toast({
      title: "투표 완료! 🎉",
      description: `${participantName}님에게 투표했습니다.`,
    });
    setIsVoteModalOpen(false);
  };

  // 선택된 카테고리 정보
  const selectedCategoryInfo = categoryOptions.find(cat => cat.value === activeCategory);

  // Supabase에서 셀럽 데이터 가져오기
  const { data: celebrities = [], isLoading } = useQuery({
    queryKey: ['/api/celebrities/by-category', activeCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      // DB에는 'actor_female' 같은 형태로 저장되어 있음
      if (activeCategory) params.append('category', activeCategory);

      const response = await fetch(`/api/celebrities/by-category?${params}`);
      if (!response.ok) throw new Error('Failed to fetch celebrities');
      return response.json();
    },
    enabled: !!activeCategory,
  });

  // 모든 셀럽 데이터 가져오기 (검색용)
  const { data: allCelebrities = [] } = useQuery({
    queryKey: ['/api/celebrities/all'],
    queryFn: async () => {
      const response = await fetch('/api/celebrities/by-category');
      if (!response.ok) throw new Error('Failed to fetch all celebrities');
      return response.json();
    },
  });

  // 검색 기능
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 검색 결과 필터링 (모든 카테고리에서 검색)
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return [];

    return allCelebrities
      .filter((celeb: any) =>
        celeb.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 10); // 최대 10개만 표시
  }, [searchQuery, allCelebrities]);

  // 검색어가 변경되면 결과 표시
  React.useEffect(() => {
    setShowSearchResults(searchQuery.trim().length > 0);
  }, [searchQuery]);

  // 검색창 외부 클릭 감지
  const searchRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const form = useForm<CreateBattleForm>({
    resolver: zodResolver(createBattleSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'male_solo',
      endDate: null,
      participants: participants,
    },
  });

  const createBattleMutation = useMutation({
    mutationFn: async (data: CreateBattleForm) => {
      console.log('Creating battle:', data);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      return true;
    },
    onSuccess: () => {

      // 승인 없이 바로 리스트에 추가 (사용자 요청 반영)
      // @ts-ignore
      const newBattle = {
        id: Date.now().toString(),
        // @ts-ignore
        title: form.getValues('title'),
        // @ts-ignore
        category: form.getValues('category'),
        participantsCount: 0,
        status: 'LIVE',
        // @ts-ignore
        participants: form.getValues('participants')
      };

      setActiveBattles(prev => [newBattle, ...prev]);

      toast({
        title: "배틀 생성 완료",
        description: "새로운 배틀이 목록에 즉시 추가되었습니다! 🔥",
      });
      setIsCreateModalOpen(false);
      form.reset();
      setParticipants([
        { name: '', description: '', imageUrl: '' },
        { name: '', description: '', imageUrl: '' }
      ]);
    },
    onError: (error) => {
      toast({
        title: "배틀 생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addParticipant = () => {
    if (participants.length < 8) {
      const newParticipants = [...participants, { name: '', description: '', imageUrl: '' }];
      setParticipants(newParticipants);
      form.setValue('participants', newParticipants);
    }
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 2) {
      const newParticipants = participants.filter((_, i) => i !== index);
      setParticipants(newParticipants);
      form.setValue('participants', newParticipants);
    }
  };

  const updateParticipant = (index: number, field: string, value: string) => {
    const newParticipants = [...participants];
    newParticipants[index] = { ...newParticipants[index], [field]: value };
    setParticipants(newParticipants);
    form.setValue('participants', newParticipants);
  };

  const onSubmit = (data: CreateBattleForm) => {
    createBattleMutation.mutate(data);
  };

  const selectedCategory = categoryOptions.find(cat => cat.value === activeCategory);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor="#A855F7"
          bottomColor="#EC4899"
          intensity={1.0}
          rotationSpeed={0.3}
        />
      </div>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-0 pointer-events-none"></div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <span className="text-lg font-black italic tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
            CELEBRITY BATTLE
          </span>

          {/* 배틀 생성 버튼 */}
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10 border border-white/10 backdrop-blur-md">
                <Plus className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <CreateBattleModal
              form={form}
              onSubmit={onSubmit}
              participants={participants}
              addParticipant={addParticipant}
              removeParticipant={removeParticipant}
              updateParticipant={updateParticipant}
              categoryOptions={categoryOptions}
              isLoading={createBattleMutation.isPending}
            />
          </Dialog>
        </div>
      </div>

      <main className="relative z-10 max-w-md mx-auto px-6 pt-20 pb-32">
        {/* Intro Text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <h1 className="text-2xl font-black text-white mb-2 leading-tight">
            당신의 <span className="text-purple-400">최애</span>를<br />
            선택하고 응원하세요!
          </h1>
          <p className="text-xs text-white/40">매일 업데이트되는 핫한 배틀에 참여하세요.</p>
        </motion.div>

        {/* 검색창 */}
        <div className="mb-6 relative" ref={searchRef}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowSearchResults(true)}
              placeholder="셀럽 검색..."
              className="w-full px-4 py-3 pl-12 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 검색 결과 */}
          {showSearchResults && searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full mt-2 w-full bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl"
            >
              {searchResults.map((celeb: any) => {
                const categoryInfo = categoryOptions.find(cat => cat.value === celeb.category);
                const displaySubtext = (celeb.category === 'male_solo' || celeb.category === 'female_solo')
                  ? celeb.gender
                  : celeb.type;

                return (
                  <button
                    key={celeb.id}
                    onClick={() => {
                      // 결과 클릭 시 처리 (향후 상세 페이지로 이동 등)
                      setShowSearchResults(false);
                      setSearchQuery('');
                    }}
                    className="w-full px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-white/10 flex-shrink-0">
                      <span className="text-lg">{categoryInfo?.icon}</span>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-bold text-white truncate">{celeb.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-white/40">
                        <span className="truncate">{categoryInfo?.label}</span>
                        {displaySubtext && (
                          <>
                            <span>·</span>
                            <span className="truncate">{displaySubtext}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}

          {/* 결과 없음 */}
          {showSearchResults && searchQuery && searchResults.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full mt-2 w-full bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 z-50 text-center"
            >
              <p className="text-sm text-white/40">검색 결과가 없습니다</p>
            </motion.div>
          )}
        </div>

        {/* 카테고리 탭 */}
        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {categoryOptions.map((category) => (
              <button
                key={category.value}
                onClick={() => setActiveCategory(category.value)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 whitespace-nowrap snap-center border
                  ${activeCategory === category.value
                    ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]'
                    : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/80'
                  }
                `}
              >
                <span className="text-base">{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 배틀 목록 */}
        <div className="space-y-4">
          {activeBattles.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-2 mb-4">
                <h3 className="text-sm font-black text-white/80 uppercase tracking-wider">
                  진행 중인 배틀
                </h3>
                <Badge variant="outline" className="text-[10px] font-bold text-purple-400 border-purple-500/30 bg-purple-500/10">
                  {activeBattles.length}개
                </Badge>
              </div>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {activeBattles.map((battle: any) => (
                    <motion.div
                      key={battle.id}
                      onClick={() => handleBattleClick(battle)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="glass-card p-5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                      <div className="relative z-10 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-white/10 hover:bg-white/20 text-[10px] h-5 px-2 text-white/60 border-0">
                              {categoryOptions.find((c: any) => c.value === battle.category)?.label || '기타'}
                            </Badge>
                            {battle.status === 'LIVE' && (
                              <span className="text-[10px] font-bold text-emerald-400 animate-pulse">LIVE</span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1 group-hover:text-purple-300 transition-colors">
                            {battle.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-white/40">
                            <span>{battle.participantsCount.toLocaleString()}명 참여</span>
                            <span>•</span>
                            <span>{battle.participants.length}명 후보</span>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-purple-500/20 group-hover:border-purple-500/50 transition-all">
                          <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-purple-300 rotate-180" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center glass-card-light rounded-[32px] border border-white/5"
            >
              <div className="text-6xl mb-6 opacity-30 grayscale blur-[1px]">🏆</div>
              <h3 className="text-lg font-black text-white mb-2">
                진행 중인 배틀이 없습니다
              </h3>
              <p className="text-sm text-white/40 mb-6 max-w-[200px] leading-relaxed">
                새로운 배틀을 직접 만들어보세요!
              </p>
            </motion.div>
          )}
        </div>

        {/* 투표 모달 */}
        <Dialog open={isVoteModalOpen} onOpenChange={setIsVoteModalOpen}>
          <DialogContent className="max-w-md bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 text-white rounded-[32px] p-0 gap-0">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                  {selectedBattle && categoryOptions.find((c: any) => c.value === selectedBattle.category)?.label || '배틀'}
                </Badge>
                <span className="text-[10px] text-white/40">
                  {selectedBattle?.participantsCount.toLocaleString()}명 참여 중
                </span>
              </div>
              <h2 className="text-xl font-black text-white leading-tight">
                {selectedBattle?.title}
              </h2>
            </div>

            <div className="p-6 grid gap-4 max-h-[60vh] overflow-y-auto">
              {selectedBattle?.participants.map((participant: any, index: number) => (
                <button
                  key={index}
                  onClick={() => handleVote(participant.name)}
                  className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all duration-300 group text-left flex items-center gap-4"
                >
                  <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center overflow-hidden border-2 border-white/10 group-hover:border-purple-500 transition-colors">
                    {participant.imageUrl ? (
                      <img src={participant.imageUrl} alt={participant.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl text-white/20 font-bold">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                      {participant.name}
                    </h3>
                    <p className="text-xs text-white/40 mt-1">
                      {participant.description || "투표하여 응원해주세요!"}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-all">
                    <i className="fas fa-check"></i>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

// 배틀 생성 모달 컴포넌트
const CreateBattleModal = ({
  form,
  onSubmit,
  participants,
  addParticipant,
  removeParticipant,
  updateParticipant,
  categoryOptions,
  isLoading
}: {
  form: any;
  onSubmit: (data: CreateBattleForm) => void;
  participants: any[];
  addParticipant: () => void;
  removeParticipant: (index: number) => void;
  updateParticipant: (index: number, field: string, value: string) => void;
  categoryOptions: any[];
  isLoading: boolean;
}) => {
  const selectedCategory = categoryOptions.find(cat => cat.value === form.watch('category'));

  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);

  const { data: allCelebrities = [] } = useQuery({
    queryKey: ['/api/celebrities/all'],
    queryFn: async () => {
      const response = await fetch('/api/celebrities/by-category');
      if (!response.ok) throw new Error('Failed to fetch all celebrities');
      return response.json();
    },
  });

  return (
    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 text-white rounded-[32px] p-0 gap-0">
      <div className="sticky top-0 z-20 bg-[#1a1a1a]/95 p-6 border-b border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black italic text-white flex items-center gap-2">
            <span className="text-purple-500">NEW</span> BATLLE
          </DialogTitle>
          <DialogDescription className="text-white/40 text-xs">
            새로운 배틀을 만들어보세요.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 기본 정보 */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-white/60 uppercase">배틀 제목</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="예: 2024 최고의 아이돌은?"
                        {...field}
                        className="bg-black/20 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-purple-500/50"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-white/60 uppercase">카테고리</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20 border-white/10 text-white rounded-xl">
                            <SelectValue placeholder="카테고리" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#222] border-white/10 text-white">
                          {categoryOptions.map((category) => (
                            <SelectItem key={category.value} value={category.value} className="focus:bg-white/10 focus:text-white">
                              {category.icon} {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subcategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-white/60 uppercase">세부 항목</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20 border-white/10 text-white rounded-xl">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#222] border-white/10 text-white">
                          {selectedCategory?.subcategories?.map((sub: string) => (
                            <SelectItem key={sub} value={sub} className="focus:bg-white/10 focus:text-white">
                              {sub}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-white/60 uppercase">설명 (선택)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="배틀에 대한 간단한 설명을 적어주세요."
                        className="min-h-[80px] bg-black/20 border-white/10 text-white placeholder:text-white/20 rounded-xl resize-none focus:border-purple-500/50"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* 참가자 관리 */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between pt-2">
                <h3 className="text-sm font-bold text-white">참가자 관리 <span className="text-white/40 text-xs font-normal">({participants.length}/8)</span></h3>
                <Button
                  type="button"
                  onClick={addParticipant}
                  disabled={participants.length >= 8}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1" />
                  추가
                </Button>
              </div>

              <div className="space-y-3">
                {participants.map((participant, index) => (
                  <div key={index} className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 text-xs text-white/30">
                        {index + 1}
                      </div>
                      <div className="relative flex-1">
                        <Input
                          placeholder="참가자 이름 (자동 검색)"
                          value={participant.name}
                          onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                          onFocus={() => setActiveSearchIndex(index)}
                          onBlur={() => setTimeout(() => setActiveSearchIndex(null), 200)}
                          className="h-9 bg-transparent border-0 border-b border-white/10 rounded-none px-0 text-sm text-white placeholder:text-white/20 focus:ring-0 focus:border-purple-500"
                        />
                        {/* Auto-complete Dropdown */}
                        {activeSearchIndex === index && participant.name.trim().length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-white/10 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                            {allCelebrities
                              .filter((c: any) => c.name.toLowerCase().includes(participant.name.toLowerCase()))
                              .slice(0, 50)
                              .map((c: any) => (
                                <div
                                  key={c.id}
                                  className="p-2 hover:bg-white/10 cursor-pointer flex items-center gap-2 transition-colors"
                                  onClick={() => {
                                    updateParticipant(index, 'name', c.name);
                                    if (c.imageUrl) updateParticipant(index, 'imageUrl', c.imageUrl);
                                    setActiveSearchIndex(null);
                                  }}
                                >
                                  {c.imageUrl ? (
                                    <img src={c.imageUrl} alt={c.name} className="w-6 h-6 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">{c.name[0]}</div>
                                  )}
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white leading-none">{c.name}</span>
                                    {c.groupName && <span className="text-[10px] text-white/40 mt-0.5">{c.groupName}</span>}
                                  </div>
                                </div>
                              ))
                            }
                            {allCelebrities.filter((c: any) => c.name.toLowerCase().includes(participant.name.toLowerCase())).length === 0 && (
                              <div className="p-2 text-xs text-white/30 text-center">검색 결과 없음</div>
                            )}
                          </div>
                        )}
                      </div>
                      {participants.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeParticipant(index)}
                          className="text-red-400 opacity-50 hover:opacity-100 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex justify-end gap-3 pt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => document.querySelector<HTMLElement>('[data-state="open"]')?.click()} // Close dialog hack via trigger toggle or just use state from parent if passed
                className="flex-1 h-12 rounded-xl text-white/40 hover:text-white hover:bg-white/10"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-[2] h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : '배틀 생성하기'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DialogContent>
  );
};

export default CelebrityBattle;