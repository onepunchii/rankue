import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { MapPin, Users, Star, MessageSquare, ArrowRight, Building, Vote } from 'lucide-react';

const Politics = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900">
      <Helmet>
        <title>정치인 평가 플랫폼 - 국회의원, 기초의원, 시장 평가 | Polli</title>
        <meta name="description" content="내 지역 국회의원, 기초의원, 시장, 구청장을 직접 평가하고 의견을 남기세요. 지역 기반 검증 시스템으로 신뢰할 수 있는 정치인 평가 플랫폼 Polli입니다." />
        <meta name="keywords" content="정치인 평가, 국회의원 설문조사, 기초의원 평가, 시장 평가, 구청장 활동, 지역 정치인, 정치 참여 앱, 내 지역 국회의원, 정치인 댓글, 정치 평가 사이트" />
        <meta property="og:title" content="정치인 평가 플랫폼 - 내 지역 대표를 평가하세요" />
        <meta property="og:description" content="국회의원부터 기초의원까지, 내 지역 정치인을 직접 평가하고 의견을 전달하세요" />
        <link rel="canonical" href="/politics" />
      </Helmet>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-6 py-3 mb-6">
              <Vote className="h-5 w-5" />
              <span className="font-medium">정치인 평가 플랫폼</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              <span className="text-yellow-300">내 지역 정치인</span>을<br />
              직접 평가하고 의견을 전달하세요
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-4xl mx-auto leading-relaxed">
              국회의원, 기초의원, 시장, 구청장까지<br />
              <strong>지역 기반 검증 시스템</strong>으로 신뢰할 수 있는 평가를 제공합니다
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/my-district">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold">
                  내 지역 정치인 보기
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/assembly">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                  국회의원 전체 보기
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 평가 카테고리 */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              누구를 평가하고 싶으신가요?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              각 정치인별 전문 평가 항목으로 더 정확한 의견을 전달할 수 있습니다
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Link href="/assembly">
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 cursor-pointer h-full">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Building className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-blue-900 dark:text-blue-100">국회의원 평가</CardTitle>
                  <CardDescription className="text-blue-700 dark:text-blue-300">298명의 국회의원</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      소통 능력 평가
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      정책 실행력 평가
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      청렴도 평가
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      지역발전 기여도 평가
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            <Link href="/local-council">
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 cursor-pointer h-full">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Users className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-green-900 dark:text-green-100">기초의원 평가</CardTitle>
                  <CardDescription className="text-green-700 dark:text-green-300">2,987명의 기초의원</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      지역 소통 활동
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      의정 활동 성과
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      주민 편의 개선
                    </li>
                    <li className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      공약 이행률
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 cursor-pointer h-full">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <MapPin className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-purple-900 dark:text-purple-100">단체장 평가</CardTitle>
                <CardDescription className="text-purple-700 dark:text-purple-300">시장, 구청장, 군수</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    행정 혁신 능력
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    지역 경제 발전
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    시민 서비스 개선
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    위기 대응 능력
                  </li>
                </ul>
                <div className="mt-4 text-center">
                  <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full text-xs font-medium">
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
              왜 Polli 정치인 평가인가요?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>지역 기반 검증</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  사용자의 거주지를 인증하여 실제 선거구 주민만 해당 정치인을 평가할 수 있습니다. 더 정확하고 신뢰할 수 있는 평가를 제공합니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>실시간 의견 전달</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  평가와 댓글이 정치인 측에 전달되어 실제 정책과 활동에 반영될 수 있습니다. 시민의 목소리가 직접 전달되는 소통 창구 역할을 합니다.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-0 bg-white dark:bg-gray-900">
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                  <Star className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>체계적 평가 시스템</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  소통, 정책 실행, 청렴도, 지역 발전 등 4개 카테고리로 구분된 평가 시스템으로 다양한 관점에서 정치인을 종합적으로 평가할 수 있습니다.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA 섹션 */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            내 목소리를 정치인에게 전달하세요
          </h2>
          <p className="text-xl mb-8 text-blue-100">
            지금 당장 내 지역 정치인을 평가하고, 더 나은 정치를 만들어 가세요
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/my-district">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold">
                내 지역 정치인 평가하기
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/assembly">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                국회의원 전체 보기
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Politics;