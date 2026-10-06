// swift-tools-version: 5.9
import PackageDescription

// 랭큐 로컬 Capacitor 플러그인 — 네이티브 카카오 SDK 로그인.
// 이름("RankueKakao")은 Capacitor CLI 가 패키지 이름(rankue-kakao)에서 만들어 CapApp-SPM/Package.swift 에 적는 값과 같아야 한다.
// 카카오 SDK 는 버전을 못 박는다 — 스토어에 낸 바이너리와 같은 SDK 로 다시 빌드할 수 있어야 한다. 올릴 때는 README 의 '버전 올리기'를 본다.
let package = Package(
    name: "RankueKakao",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "RankueKakao",
            targets: ["RankueKakaoPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/kakao/kakao-ios-sdk.git", exact: "2.29.0")
    ],
    targets: [
        .target(
            name: "RankueKakaoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "KakaoSDKCommon", package: "kakao-ios-sdk"),
                .product(name: "KakaoSDKAuth", package: "kakao-ios-sdk"),
                .product(name: "KakaoSDKUser", package: "kakao-ios-sdk")
            ],
            path: "ios/Sources/RankueKakaoPlugin")
    ]
)
