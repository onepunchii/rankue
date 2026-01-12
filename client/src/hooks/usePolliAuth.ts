import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { createContext, useContext, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";

// 단일 인증 시스템 - Supabase 통합 버전
export interface PolliUser {
  id: string; // uuid
  email?: string;
  userType: 'guest' | 'verified' | 'admin';
  nickname?: string;
  fullName?: string;
  profileImageUrl?: string;
  level: number;
  experience: number;
  personalPoints: number;
  availableLotteryTickets: number;
  ageGroup?: string;
  gender?: string;
  region?: string;
  city?: string;
  badges: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface PolliAuthContextType {
  user: PolliUser | null;
  supabaseUser: SupabaseUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  refreshUser: () => void;
  signOut: () => Promise<void>;
}

const PolliAuthContext = createContext<PolliAuthContextType | undefined>(undefined);

// 사용자 상태 조회 함수 (서버 기반)
async function fetchUserState(): Promise<PolliUser | null> {
  const { data: { session } } = await supabase.auth.getSession();

  // 로그인 안된 경우 null 반환 (또는 게스트 프로필 필요시 생성)
  if (!session) return null;

  try {
    const response = await apiRequest('/api/auth/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });
    return response;
  } catch (error) {
    console.error('프로필 조회 오류:', error);
    return null;
  }
}

export function PolliAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    // 세션 초기화
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSupabaseUser(session?.user ?? null);
    });

    // 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null);
      queryClient.invalidateQueries({ queryKey: ['polli-profile'] });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['polli-profile', supabaseUser?.id],
    queryFn: fetchUserState,
    enabled: !!supabaseUser,
    staleTime: 30000,
  });

  const isLoggedIn = !!supabaseUser;
  const isVerified = user?.userType === 'verified' || user?.userType === 'admin';
  const isAdmin = user?.userType === 'admin';

  const refreshUser = () => {
    queryClient.invalidateQueries({ queryKey: ['polli-profile'] });
    refetch();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(['polli-profile', supabaseUser?.id], null);
    setSupabaseUser(null);
  };

  const contextValue: PolliAuthContextType = {
    user: user || null,
    supabaseUser,
    isLoading: isLoading && isLoggedIn, // 로그인 중일 때만 로딩 표시
    isLoggedIn,
    isVerified,
    isAdmin,
    refreshUser,
    signOut
  };

  return React.createElement(
    PolliAuthContext.Provider,
    { value: contextValue },
    children
  );
}

export function usePolliAuth(): PolliAuthContextType {
  const context = useContext(PolliAuthContext);
  if (context === undefined) {
    throw new Error('usePolliAuth는 PolliAuthProvider 내에서 사용해야 합니다.');
  }
  return context;
}