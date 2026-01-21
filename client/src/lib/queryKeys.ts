
export const queryKeys = {
    // Auth
    AUTH_USER: "/api/auth/me",
    AUTH_USER_PARTICIPATIONS: "/api/auth/user/participations",
    AUTH_USER_STATS: "/api/user/stats",
    AUTH_PROFILE: "/api/auth/profile",
    USER_AVATAR: "/api/auth/avatar",

    // Surveys
    SURVEYS: "/api/surveys",
    SURVEYS_PAGINATED: "/api/surveys/paginated",
    SURVEYS_CATEGORY_COUNTS: "/api/surveys/category-counts",
    SURVEY_DETAIL: (id: number | string) => `/api/surveys/${id}`,
    SURVEY_ANALYTICS: (id: number | string) => `/api/surveys/${id}/analytics`,
    SURVEY_STATS: (id: number | string) => `/api/surveys/${id}/stats`,
    SURVEY_DEMOGRAPHICS: (id: number | string) => `/api/surveys/${id}/demographics`,
    AUTH_USER_CREATED_SURVEYS: "/api/auth/user/created-surveys",

    // Balance Games
    BALANCE_GAMES: "/api/balance-games",
    BALANCE_GAMES_MY_VOTES: "/api/balance-games/votes/me",

    // Brain
    BRAIN_LEADERBOARD: "/api/brain/leaderboard",

    // Lottery
    LOTTERY_TICKETS: "/api/lottery/tickets",
    LOTTERY_TODAY_DRAW: "/api/lottery/today-draw",
    LOTTERY_CREATE_TICKET: "/api/lottery/create-ticket",
    LOTTERY_MANUAL_TICKET: "/api/lottery/manual-ticket",

    // Rewards
    REWARD_ITEMS: "/api/rewards/products",
    REWARDS_PURCHASE: "/api/rewards/orders",
    AUTH_USER_POINTS_TRANSACTIONS: "/api/rewards/ledger",
    POINTS_TRANSFER: "/api/points/transfer",

    // Admin
    ADMIN_DB_STATUS: "/api/admin/db-status",
    ADMIN_REWARDS_PRODUCTS: "/api/admin/rewards/products",
    ADMIN_REWARDS_ORDERS: "/api/admin/rewards/orders",
    ADMIN_REWARDS_STATS: "/api/admin/rewards/stats",
    ADMIN_REWARDS_LOGS: "/api/admin/rewards/logs",
    ADMIN_REWARDS_TEST: "/api/admin/rewards/test-integration",

    // Politics
    POLITICAL_SURVEYS: "/api/auth/politics-surveys",
    PRESIDENTIAL_APPROVAL: "/api/political/presidential-approval",
    PARTY_SUPPORT: "/api/political/party-support",
    CANDIDATE_SUPPORT: "/api/political/candidate-support",
    POLITICAL_CURRENT_STATS: "/api/political/current-stats",
    WEEKLY_TRENDS: "/api/political/weekly-trends",
    ASSEMBLY_BILLS: "/api/assembly-bills",
    POLITICAL_SURVEY_RESULTS: (id: number | string) => `/api/auth/politics-survey-results/${id}`,

    // Personality Analysis
    PERSONALITY_ELIGIBILITY: "/api/personality/eligibility",
    PERSONALITY_ANALYSIS: "/api/personality/analysis",

    // Lottery
    LOTTERY_HISTORY: "/api/lottery/history",

    // Celebrities
    CELEBRITIES_BY_CATEGORY: "/api/celebrities/by-category",
} as const;
