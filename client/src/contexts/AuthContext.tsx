import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

export interface AuthUser {
    id: string;
    email?: string;
    isGuest: boolean;
    isAuthenticated: boolean;

    // Profile data
    fullName?: string;
    nickname?: string;
    phone?: string;
    ageGroup?: string;
    gender?: string;
    region?: string;
    city?: string;
    cityProvince?: string;
    district?: string;
    jobCategory?: string;
    educationLevel?: string;
    incomeLevel?: string;
    maritalStatus?: string;
    isPetOwner?: boolean;
    profileImageUrl?: string;

    // Gamification
    level: number;
    experience: number;
    personalPoints: number;
    availableLotteryTickets: number;
    totalVotes: number;
    consecutiveDays: number;
    badges: string[];
    title: string;

    // Computed
    isVerified: boolean;
}

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    login: (provider: 'google' | 'kakao') => Promise<void>;
    logout: () => Promise<void>;
    updateProfile: (data: Partial<AuthUser>) => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_USER: AuthUser = {
    id: 'guest',
    isGuest: true,
    isAuthenticated: false,
    level: 1,
    experience: 0,
    personalPoints: 0,
    availableLotteryTickets: 0,
    totalVotes: 0,
    consecutiveDays: 0,
    badges: [],
    title: '',
    isVerified: false,
};

async function applyPendingProfileData(userId: string, token: string) {
    if (typeof window === 'undefined') return;

    const pendingDataStr = localStorage.getItem('pending_profile_data');
    if (!pendingDataStr) return;

    try {
        const pendingData = JSON.parse(pendingDataStr);
        console.log('📝 [AuthContext] Applying pending profile data via Server API:', pendingData);

        const response = await fetch('/api/user/profile', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(pendingData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ [AuthContext] Failed to update profiles via API:', errorData);
        } else {
            console.log('✅ [AuthContext] Profile data applied successfully');
            localStorage.removeItem('pending_profile_data');
            localStorage.removeItem('is_simple_auth');
        }
    } catch (e) {
        console.error('❌ [AuthContext] Error applying profile data:', e);
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchProfile = async (supabaseUser: SupabaseUser) => {
        try {
            console.log(`🔍 [AuthContext] fetchProfile START for user: ${supabaseUser.id}`);

            // Get current session token for API authorization
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                console.warn('⚠️ [AuthContext] No access token found');
                throw new Error('No authentication token');
            }

            // Fetch from our server API (bypasses Supabase RLS issue) with Timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout

            try {
                const response = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.error(`❌ [AuthContext] Server response not OK: ${response.status}`);
                    throw new Error('Failed to fetch user profile from server');
                }

                const result = await response.json();
                const profileData = result.success ? result.data : result;
                console.log('📊 [AuthContext] Profile data received:', profileData);

                // Apply pending profile changes if any (Fixes race condition: ensure profile exists first)
                if (typeof window !== 'undefined' && localStorage.getItem('pending_profile_data')) {
                    console.log('📦 [AuthContext] Found pending data, applying to secured profile...');
                    await applyPendingProfileData(supabaseUser.id, token);

                    // Refetch to get updated data
                    const freshRes = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (freshRes.ok) {
                        const freshResult = await freshRes.json();
                        const freshData = freshResult.success ? freshResult.data : freshResult;
                        Object.assign(profileData, freshData);
                    }
                }

                if (profileData && !profileData.isGuest) {
                    console.log('✅ [AuthContext] Setting user state with profile');
                    setUser({
                        ...profileData,
                        // Ensure essential fields from Supabase auth are present if missing
                        id: supabaseUser.id,
                        email: profileData.email || supabaseUser.email,
                        isAuthenticated: true,
                    });
                } else {
                    console.warn('⚠️ [AuthContext] Server returned guest or empty profile');
                    setUser({
                        ...GUEST_USER,
                        id: supabaseUser.id,
                        email: supabaseUser.email,
                        isAuthenticated: true,
                        isGuest: false, // It's an authenticated user with no profile yet
                    });
                }
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.error('⏱️ [AuthContext] Profile fetch timed out - falling back to guest UI');
                } else {
                    console.error('❌ [AuthContext] API fetch error:', fetchError);
                }
                throw fetchError; // Re-throw to be caught by outer catch for guest fallback
            }
        } catch (error) {
            console.error('❌ [AuthContext] Error fetching profile:', error);
            // Don't downgrade to guest immediately if it's just a network error, 
            // but for safety we keep the session compliant structure
            setUser({
                ...GUEST_USER,
                id: supabaseUser.id,
                email: supabaseUser.email,
                isAuthenticated: true,
                isGuest: false,
            });
        }
    };



    useEffect(() => {
        let isMounted = true;

        const initializeAuth = async () => {
            console.log('🚀 [AuthContext] Initializing auth...');

            try {
                // CANONICAL PATTERN: Check localStorage for Supabase session
                // Supabase stores session in localStorage with key format: sb-{project-ref}-auth-token
                let sessionData: string | null = null;
                let accessToken = null;

                // Try to find Supabase session in localStorage
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('sb-') && key.includes('auth-token')) {
                        console.log('🔑 [AuthContext] Found Supabase auth key:', key);
                        sessionData = localStorage.getItem(key);
                        break;
                    }
                }

                if (!sessionData) {
                    console.log('📱 [AuthContext] No session found in localStorage');
                    setUser(GUEST_USER);
                    setLoading(false);
                    return;
                }

                try {
                    const session = JSON.parse(sessionData);
                    accessToken = session?.access_token;
                } catch (e) {
                    console.error('❌ [AuthContext] Failed to parse session data:', e);
                }

                if (!accessToken) {
                    console.log('⚠️ [AuthContext] No access token in session');
                    setUser(GUEST_USER);
                    setLoading(false);
                    return;
                }

                if (!isMounted) return;

                console.log('✅ [AuthContext] Session token found, validating with server...');

                // Call server API to validate token and get profile
                const response = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });

                if (!isMounted) return;

                if (!response.ok) {
                    console.warn('⚠️ [AuthContext] Server validation failed');
                    setUser(GUEST_USER);
                    setLoading(false);
                    return;
                }

                const result = await response.json();
                const profileData = result.success ? result.data : result;
                console.log('📊 [AuthContext] Profile data received:', profileData);

                if (profileData && profileData.id && profileData.id !== 'guest') {
                    console.log('✅ [AuthContext] User authenticated successfully');
                    setUser({
                        ...profileData,
                        isAuthenticated: true,
                        isGuest: false,
                    });
                } else {
                    console.log('⚠️ [AuthContext] Server returned guest profile');
                    setUser(GUEST_USER);
                }

            } catch (error) {
                console.error('❌ [AuthContext] Auth initialization error:', error);
                if (isMounted) {
                    setUser(GUEST_USER);
                }
            } finally {
                if (isMounted) {
                    console.log('🏁 [AuthContext] Initialization complete');
                    setLoading(false);
                }
            }
        };

        initializeAuth();

        // Listen for auth changes via Supabase
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            console.log('🔄 [AuthContext] Auth state changed:', _event);

            if (!isMounted) return;

            if (session?.user) {
                await fetchProfile(session.user);
            } else {
                setUser(GUEST_USER);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const login = async (provider: 'google' | 'kakao') => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/`,
                },
            });

            if (error) throw error;
        } catch (error: any) {
            console.error('Login error:', error);
            toast({
                variant: 'destructive',
                title: '로그인 실패',
                description: error.message || '일시적인 오류가 발생했습니다.',
            });
        }
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            setUser(GUEST_USER);
            toast({
                title: '로그아웃 완료',
                description: '안전하게 로그아웃되었습니다.',
            });
        } catch (error: any) {
            console.error('Logout error:', error);
            toast({
                variant: 'destructive',
                title: '로그아웃 실패',
                description: error.message,
            });
        }
    };

    const updateProfile = async (data: Partial<AuthUser>) => {
        if (!user || user.isGuest) return;

        try {
            // Get current session token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) throw new Error('No authentication token');

            // Use server API to update profile (bypasses RLS)
            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update profile');
            }

            // Refresh user data from server API
            await fetchProfile(user as any); // Type assertion since we know it's fine for fetchProfile

            // Refresh user data from Supabase
            const { data: { user: supabaseUser } } = await supabase.auth.getUser();
            if (supabaseUser) {
                await fetchProfile(supabaseUser);
            }

            toast({
                title: '프로필 업데이트 완료',
                description: '프로필이 성공적으로 업데이트되었습니다.',
            });
        } catch (error) {
            console.error('❌ [AuthContext] Error updating profile:', error);
            toast({
                title: '프로필 업데이트 실패',
                description: '프로필 업데이트 중 오류가 발생했습니다.',
                variant: 'destructive',
            });
        }
    };

    const refreshUser = async () => {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        if (supabaseUser) {
            await fetchProfile(supabaseUser);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                logout,
                updateProfile,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
