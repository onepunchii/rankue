import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { Star, Heart, Music, Film, Gamepad2, Mic, ArrowRight, Trophy, Users } from 'lucide-react';

const Entertainment = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <Helmet>
        <title>연예인 호감도 투표 - 아이돌, 배우, 인플루언서 팬심 설문 | Polli</title>
        <meta name="description" content="좋아하는 아이돌, 배우, 인플루언서를 응원하고 평가하세요! K-POP 아이돌부터 드라마 배우, 유튜버까지 연예인 호감도 투표와 팬덤 설문 플랫폼 Polli입니다." />
        <meta name="keywords" content="연예인 호감도 투표, 아이돌 팬심 설문, K-POP 투표, 배우 평가, 인플루언서 순위, 유튜버 투표, 팬덤 설문 플랫폼, 연예인 배틀, 최애 투표, 스타 랭킹" />
        <meta property="og:title" content="연예인 호감도 투표 - 최애를 응원하세요!" />
        <meta property="og:description" content="K-POP 아이돌부터 배우, 인플루언서까지 좋아하는 연예인을 투표로 응원하세요" />
        <link rel="canonical" href="/entertainment" />
      </Helmet>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-r from-pink-600 to-purple-600 text-white">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-6 py-3 mb-6">
              <Star className="h-5 w-5" />
              <span className="font-medium">연예인 호감도 투표</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              <span className="text-yellow-300">최애 연예인</span>을<br />
              투표로 응원하세요!
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-pink-100 max-w-4xl mx-auto leading-relaxed">
              K-POP 아이돌부터 배우, 인플루언서까지<br />
              <strong>팬덤의 힘</strong>으로 스타 랭킹을 만들어 보세요
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/celebrity-battle">
                <Button size="lg" className="bg-white text-pink-600 hover:bg-pink-50 px-8 py-4 text-lg font-semibold">
                  연예인 배틀 참여하기
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/music">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                  K-POP 투표하기
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 카테고리 섹션 */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              어떤 연예인을 응원하고 싶으신가요?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              다양한 장르의 연예인들을 카테고리별로 만나보세요
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Link href="/music">
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 cursor-pointer h-full">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 bg-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Music className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-pink-900 dark:text-pink-100">K-POP 아이돌</CardTitle>
                  <CardDescription className="text-pink-700 dark:text-pink-300">가수 • 아이돌 그룹</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500" />
                      남돌 vs 여돌 투표
                    </li>
                    <li className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500" />
                      세대별 아이돌 배틀
                    </li>
                    <li className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500" />
                      솔로 가수 순위
                    </li>
                    <li className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500" />
                      최신 컴백 평가
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 cursor-pointer h-full">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Film className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-purple-900 dark:text-purple-100">배우</CardTitle>
                <CardDescription className="text-purple-700 dark:text-purple-300">드라마 • 영화 배우</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    로맨스 드라마 주연
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    액션 영화 배우
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    연기력 순위
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    차세대 스타
                  </li>
                </ul>
                <div className="mt-4 text-center">
                  <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full text-xs font-medium">
                    준비 중
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 cursor-pointer h-full">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Mic className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-blue-900 dark:text-blue-100">인플루언서</CardTitle>
                <CardDescription className="text-blue-700 dark:text-blue-300">유튜버 • 스트리머 • SNS 스타</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    구독자수 TOP 유튜버
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    인기 스트리머 랭킹
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    SNS 인플루언서
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    신진 크리에이터
                  </li>
                </ul>
                <div className="mt-4 text-center">
                  <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-medium">
                    준비 중
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 cursor-pointer h-full">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Gamepad2 className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-green-900 dark:text-green-100">스포츠 스타</CardTitle>
                <CardDescription className="text-green-700 dark:text-green-300">운동선수 • e스포츠</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    축구 선수 순위
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    야구 스타 투표
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    e스포츠 프로게이머
                  </li>
                  <li className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    올림픽 스타
                  </li>
                </ul>
                <div className="mt-4 text-center">
                  <span className="inline-block bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-xs font-medium">
                    준비 중
                  </span>
                </div>
              </CardContent>
            </Card>

            <Link href="/celebrity-battle">
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-yellow-50 to-orange-100 dark:from-yellow-900/20 dark:to-orange-800/20 cursor-pointer h-full">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Trophy className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-orange-900 dark:text-orange-100">연예인 배틀</CardTitle>
                  <CardDescription className="text-orange-700 dark:text-orange-300">이상형 월드컵 • 토너먼트</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-500" />
                      커스텀 배틀 생성
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-500" />
                      실시간 투표 결과
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-500" />
                      카테고리별 대결
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-orange-500" />
                      팬덤 대항전
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-red-50 to-pink-100 dark:from-red-900/20 dark:to-pink-800/20 cursor-pointer h-full">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-red-900 dark:text-red-100">예능인</CardTitle>
                <CardDescription className="text-red-700 dark:text-red-300">개그맨 • MC • 예능스타</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    인기 개그맨 순위
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    최고의 MC
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    예능 프로그램 스타
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    웃음 제조기
                  </li>
                </ul>
                <div className="mt-4 text-center">
                  <span className="inline-block bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-3 py-1 rounded-full text-xs font-medium">
                    준비 중
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 특징 섹션 */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              팬덤의 힘으로 만드는 스타 랭킹
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900 rounded-lg flex items-center justify-center mb-4">
                  <Heart className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                </div>
                <CardTitle>진짜 팬심 반영</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  단순한 클릭이 아닌 진정한 팬들의 마음이 담긴 투표로 더 의미 있는 순위를 만듭니다. 팬덤의 진정성이 반영된 결과를 확인하세요.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                  <Trophy className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>실시간 순위 업데이트</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  매일 업데이트되는 실시간 순위로 최신 트렌드를 확인할 수 있습니다. 내가 응원하는 스타가 어느 위치에 있는지 바로 확인하세요.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>다양한 투표 방식</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  일반 투표부터 이상형 월드컵, 토너먼트 방식까지 다양한 형태로 재미있게 참여할 수 있습니다. 매일 새로운 방식으로 최애를 응원하세요.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA 섹션 */}
      <section className="py-20 bg-gradient-to-r from-pink-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            지금 바로 최애를 응원하세요!
          </h2>
          <p className="text-xl mb-8 text-pink-100">
            내가 좋아하는 연예인을 투표로 응원하고, 팬덤의 힘을 보여주세요
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/celebrity-battle">
              <Button size="lg" className="bg-white text-pink-600 hover:bg-pink-50 px-8 py-4 text-lg font-semibold">
                연예인 배틀 시작하기
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/music">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                K-POP 투표하기
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Entertainment;