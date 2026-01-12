# Polli Survey Platform

## Overview
Polli is a blockchain-based, mobile-first survey platform focused on engaging content, anonymity, and trust. Its core vision is to provide a platform where participation is easy, and trust is robust, serving as a comprehensive survey and polling system with market potential in secure, engaging public opinion collection.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Query (TanStack Query) for server state
- **Design**: Mobile-first responsive design with bottom navigation, card-based layouts, and category-specific theming. Employs glassmorphism effects and enhanced visual hierarchy.
- **UI Components**: Redesigned tab buttons with 3D gradient effects and interactive icons.
- **Survey UI**: Card-based UI for survey forms with expanded click areas and visual feedback.

### Backend Architecture
- **Server**: Express.js with TypeScript
- **API**: RESTful architecture
- **Authentication**: JWT-based 2-tier authentication system with mandatory complete registration for members. Guests have read-only access.
- **Database**: PostgreSQL with Drizzle ORM (using Neon Database).
- **SEO Optimization**:
    - **Prerender.io Integration**: Server-side rendering for search engine crawlers to index React SPA content properly.
    - **Dynamic Sitemap**: Auto-generated sitemap.xml with all surveys, results, categories (updated hourly cache).
    - **Robots.txt**: Optimized crawl directives allowing public pages while blocking private/admin routes.
    - **OG Image Generation**: Dynamic Open Graph images for social media sharing.
- **Automated Systems**:
    - **Admin System**: Comprehensive admin dashboard with real-time statistics, survey management, member management, and AI-based abuse detection.
    - **Weekly Polling Automation**: Automated generation of weekly political surveys.
    - **Policy Briefing Automation**: Automatic collection of policy news via RSS, generation of surveys using OpenAI (GPT-4o), and scheduled execution.
    - **Lottery System**: Manual ticket system with daily automated draws.
    - **Political Orientation Analysis**: 5-axis analysis system with radar chart visualization and 0-100 scoring.
    - **Politician Evaluation System**: Location-based politician rating system with 4 categories (communication, policy, integrity, local development) and community comment features with OpenAI-powered moderation.

### Database Schema
Key entities include `user_auth` (unified authentication with demographic fields), `surveys`, `surveyQuestions` (6 optimized types), `surveyResponses`, `userSurveyParticipation`, `lottery_tickets`, `lottery_draws`, `politician_ratings`, `politician_comments`, and `comment_likes`.

### Survey System
- **Categories**: Fun Poll (yellow), Life Poll (green), Deep Poll (red/anonymous).
- **Question Types**: Single choice, multiple choice, text responses. Dropdown question type removed.
- **Rewards**: Points system for participation.
- **Anonymity**: Support for anonymous surveys.

## External Dependencies

### Database & ORM
- **@neondatabase/serverless**: Neon Database connection
- **drizzle-orm**: Type-safe ORM for PostgreSQL
- **connect-pg-simple**: PostgreSQL session store

### Authentication
- **openid-client**: OpenID Connect client for Replit Auth
- **passport**: Authentication middleware

### AI/ML
- **OpenAI API**: For automated survey generation from policy news.

### UI Framework
- **@radix-ui/**: UI component primitives
- **@tanstack/react-query**: Server state management
- **tailwindcss**: Utility-first CSS framework
- **Recharts**: For data visualization (e.g., radar charts).

### Development Tools
- **Vite**: Build tool
- **TypeScript**: Language
- **tsx**: TypeScript execution

### Third-Party APIs
- **korea.kr RSS feed**: For automatic policy news collection.
- **National Assembly Bill API**: For political surveys related to legislative bills.
- **Prerender.io**: Pre-rendering service for search engine crawlers (250 pages/month free tier).

## Recent Additions

### SEO Optimization (October 2025)
- **Prerender.io Integration**: Pre-rendering middleware for search engine crawlers to properly index React SPA content
- **Dynamic Sitemap.xml**: Auto-generated sitemap with all surveys (both ID and slug URLs), results pages, categories, and static pages
- **Enhanced Robots.txt**: Optimized for Googlebot, Yeti (Naver), and Bingbot with proper Allow/Disallow directives
- **Crawler-friendly URLs**: Support for both `/surveys/:id` and `/poll/:slug` patterns in sitemap

### Politician Rating & Comment System
- Individual detail pages for all 298 national assembly members and 2,987 local council members
- 4-category star rating system (communication, policy execution, integrity, local development)
- Location-based validation ensuring users can only rate their local representatives
- Community comment system with support/suggestion categories
- OpenAI-powered content moderation to filter inappropriate comments
- Like/dislike and reporting functionality for comments
- Click-to-navigate cards in the My District page linking to politician detail pages