import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { ArrowRight, Vote, Users, Shield, Target, CheckCircle, Star, MessageSquare, BarChart3 } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <Helmet>
        <title>Polli - 정치인, 연예인, 사회 이슈까지 평가하고 의견을 나누는 여론 플랫폼</title>
        <meta name="description" content="내 지역 정치인 평가부터 연예인 팬심 투표, 사회 이슈 찬반 설문까지! Polli는 누구나 생각을 남기고 여론을 형성할 수 있는 소셜 설문 플랫폼입니다. 정치, 연예, 브랜드, 이슈 — 당신의 의견이 바로 영향력이 됩니다." />
        <meta name="keywords" content="정치인 평가 플랫폼, 국회의원 설문조사, 구청장 활동 평가, 연예인 호감도 투표, 아이돌 팬심 설문, 브랜드 만족도 조사, 사회 이슈 찬반 투표, 지역 기반 투표 플랫폼, 생각을 공유하는 설문 앱, 커뮤니티 여론조사 사이트" />
        <meta property="og:title" content="Polli - 정치인, 연예인, 사회 이슈 평가 플랫폼" />
        <meta property="og:description" content="내 지역 정치인부터 연예인까지, 모든 의견이 모이는 플랫폼" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="/about" />
      </Helmet>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <Badge className="mb-6 bg-white/20 text-white border-white/30 px-4 py-2">
              생각을 남기는 곳, Polli
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              정치인, 연예인, 사회 이슈까지<br />
              <span className="text-yellow-300">평가하고 의견을 나누는</span><br />
              여론 플랫폼
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-4xl mx-auto leading-relaxed">
              내 지역 정치인 평가부터 연예인 팬심 투표, 사회 이슈 찬반 설문까지!<br />
              <strong>당신의 한마디가 정책이 되고 여론이 됩니다</strong>
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold">
                  지금 시작하기
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/politics">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                  정치인 평가하기
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              정치, 연예, 사회 — 모든 의견이 모이는 플랫폼
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Polli는 정치인, 연예인, 브랜드, 사회 이슈에 대한 당신의 생각을 자유롭게 남기고 공유할 수 있는 설문 기반 여론 플랫폼입니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Vote className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-blue-900 dark:text-blue-100">정치인 평가</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-gray-700 dark:text-gray-300">
                  국회의원, 기초의원, 시장, 구청장 등 <strong>내 지역 정치인</strong>을 평가하고 바라는 점을 댓글로 남길 수 있습니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Star className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-pink-900 dark:text-pink-100">연예인 평가</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-gray-700 dark:text-gray-300">
                  <strong>아이돌, 배우, 인플루언서</strong> 등 연예인의 활동에 대한 팬들의 평가와 응원을 모읍니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-green-900 dark:text-green-100">브랜드 평가</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-gray-700 dark:text-gray-300">
                  <strong>소비자 입장에서 브랜드나 제품에 대한 한 줄 평가</strong>를 공유하고, 다른 사람들의 의견도 확인할 수 있습니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-purple-900 dark:text-purple-100">사회 이슈</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-gray-700 dark:text-gray-300">
                  뉴스, 사건, 공공 정책 등 뜨거운 이슈에 대해 찬반 투표와 자유 의견을 등록할 수 있습니다.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Polli Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              Polli는 단순한 투표 앱이 아닙니다
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              더 정확하고 의미 있는 데이터를 수집하여 실제 변화를 만들어 갑니다
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>신뢰할 수 있는 데이터</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  사용자 기반의 신뢰 점수, 중복 방지 설계, 지역 인증 기반 평가로 더 정확하고 의미 있는 데이터를 수집합니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>실제 전달 시스템</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  작성된 의견은 요약·정제되어 실제 정치인이나 브랜드 측에 전달될 수 있습니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>안전한 의견 표현</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  개인 유저는 자신의 의견을 익명으로 안전하게 표현할 수 있으며, 다른 유저의 생각과 비교하거나 공감할 수도 있습니다.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Key Features List */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              주요 기능
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">정치인 평가 플랫폼</h3>
                  <p className="text-gray-600 dark:text-gray-300">국회의원, 기초의원 실시간 평가 시스템</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">연예인 호감도 투표</h3>
                  <p className="text-gray-600 dark:text-gray-300">아이돌, 배우, 인플루언서 팬심 설문</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">브랜드 만족도 조사</h3>
                  <p className="text-gray-600 dark:text-gray-300">실시간 소비자 리뷰 및 평가 시스템</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">사회 이슈 찬반 투표</h3>
                  <p className="text-gray-600 dark:text-gray-300">뜨거운 사회 이슈에 대한 여론 조사</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">지역 기반 투표 플랫폼</h3>
                  <p className="text-gray-600 dark:text-gray-300">내 지역 정치인만 평가 가능한 검증 시스템</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">익명 투표 앱</h3>
                  <p className="text-gray-600 dark:text-gray-300">안전하고 익명성이 보장되는 의견 표현</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">커뮤니티 여론조사 사이트</h3>
                  <p className="text-gray-600 dark:text-gray-300">사용자 간 의견 공유 및 토론 기능</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">팬덤 설문 플랫폼</h3>
                  <p className="text-gray-600 dark:text-gray-300">연예인 팬덤을 위한 전용 투표 공간</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            당신의 의견이 바로 영향력이 됩니다
          </h2>
          <p className="text-xl mb-8 text-blue-100">
            지금 Polli에서 당신의 생각을 남기고, 더 나은 사회를 만들어 가세요
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold">
                지금 시작하기
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/celebrity-battle">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                연예인 배틀 참여하기
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;