import Foundation
import UIKit
import Capacitor
import KakaoSDKCommon
import KakaoSDKAuth
import KakaoSDKUser

// 네이티브 카카오 로그인 — 웹(원격 URL)이 registerPlugin("RankueKakao") 로 부른다.
//
//   login({ nonce }) → { idToken, viaTalk }
//     카카오톡이 깔려 있으면 카카오톡 간편로그인, 없으면 카카오계정 로그인(시스템 웹 인증 시트)으로 간다.
//     nonce 는 SDK 에 그대로 넘겨 ID 토큰에 실린다 — 서버가 자기가 낸 nonce 와 맞는지 본다.
//     액세스·리프레시 토큰은 웹(JS)으로 넘기지 않는다 — ID 토큰과 viaTalk 뿐이다(계약: shared/kakaoNative.ts).
//     거절 code: CANCELED(사용자 취소) · NO_ID_TOKEN(콘솔에서 OpenID Connect 꺼짐) ·
//               NOT_CONFIGURED(네이티브 앱 키 없음) · BAD_NONCE · IN_PROGRESS(연타) · FAILED(그 밖)
//   logout() → SDK 가 기기에 들고 있는 카카오 토큰만 지운다(우리 서버 세션과 무관). 늘 resolve.
//
// 네이티브 앱 키는 Info.plist 의 KAKAO_NATIVE_APP_KEY 한 값에서 읽는다(값은 ios/App/Kakao.xcconfig — README).
// 카카오톡에서 돌아오는 URL(kakao{키}://oauth)은 Capacitor 가 뿌리는 openURL 알림으로 받는다 —
// AppDelegate·SceneDelegate 를 고치지 않아도 된다.
//
// 주의: Capacitor CLI 는 이 폴더의 스위프트 파일마다 맨 처음 나오는 "objc 이름 표기(@objc 뒤에 괄호로 클래스 이름)"를
// 플러그인 클래스로 등록한다(cap sync → capacitor.config.json 의 packageClassList). 파일을 더 만들 때 그 표기를 붙이면
// 엉뚱한 클래스가 플러그인 목록에 올라간다. 주석에도 그 모양을 그대로 적지 않는다.
@objc(RankueKakaoPlugin)
public class RankueKakaoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RankueKakaoPlugin"
    public let jsName = "RankueKakao"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise)
    ]

    private static let infoPlistKey = "KAKAO_NATIVE_APP_KEY"
    private static let placeholderKey = "KAKAO_NATIVE_APP_KEY_HERE"

    private static let codeCanceled = "CANCELED"
    private static let codeNoIdToken = "NO_ID_TOKEN"
    private static let codeNotConfigured = "NOT_CONFIGURED"
    private static let codeBadNonce = "BAD_NONCE"
    private static let codeInProgress = "IN_PROGRESS"
    private static let codeFailed = "FAILED"

    /// 이 시간 안에 login 이 또 오면 연타로 보고 뒤의 것을 거절한다. 그보다 뒤에 오면 앞의 것이 멈춘 것으로 보고 새 호출이 이긴다.
    private static let doubleTapWindow: TimeInterval = 1.0
    /// 카카오톡에 갔다가 앱으로 돌아온 뒤 이 시간 안에 콜백 URL 이 안 오면 '마치지 않고 돌아옴'(취소)으로 끝낸다.
    private static let talkReturnGrace: TimeInterval = 1.5
    /// 카카오톡 로그인이 실패해 카카오계정 로그인으로 넘어갈 때, 앱이 앞으로 다 나온 뒤 시트를 띄우려고 잠깐 기다린다.
    private static let fallbackDelay: TimeInterval = 0.4

    private enum Phase {
        case talk
        case account
    }

    private final class Attempt {
        let call: CAPPluginCall
        let nonce: String
        let startedAt = Date()
        var phase: Phase = .account
        /// 카카오톡으로 넘어가면서 앱이 백그라운드로 갔는가
        var leftApp = false
        /// 카카오톡이 콜백 URL 을 돌려줬는가(이 뒤로는 SDK 가 토큰을 받는 중)
        var gotTalkCallback = false

        init(call: CAPPluginCall, nonce: String) {
            self.call = call
            self.nonce = nonce
        }
    }

    // 아래 상태는 전부 메인 스레드에서만 만진다.
    private var configured = false
    private var current: Attempt?
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        if let appKey = Self.readAppKey() {
            KakaoSDK.initSDK(appKey: appKey)
            configured = true
        } else {
            CAPLog.print("[RankueKakao] 네이티브 앱 키가 없다 — ios/App/Kakao.xcconfig 의 KAKAO_NATIVE_APP_KEY 를 채워야 카카오 로그인이 된다")
        }

        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .capacitorOpenURL, object: nil, queue: .main) { [weak self] notification in
            self?.handleOpenUrl(notification)
        })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.appDidEnterBackground()
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.appDidBecomeActive()
        })
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - 웹에서 부르는 메서드

    @objc func login(_ call: CAPPluginCall) {
        // nonce 는 서버가 낸 글자 그대로 SDK 에 넘긴다(다듬지 않는다 — shared/kakaoNative.ts 계약). 빈 값만 거른다.
        let nonce = call.getString("nonce") ?? ""
        guard !nonce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("nonce is required", Self.codeBadNonce)
            return
        }
        DispatchQueue.main.async {
            self.startLogin(call: call, nonce: nonce)
        }
    }

    @objc func logout(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // 키가 없으면 SDK 를 건드리지 않는다(초기화 전 호출은 SDK 안에서 죽는다). 지울 토큰도 없다.
            guard self.configured, AuthApi.hasToken() else {
                call.resolve()
                return
            }
            // 카카오 쪽 토큰 만료 요청이 실패해도 SDK 는 기기의 토큰을 지운다 — 그래서 늘 resolve.
            UserApi.shared.logout { _ in
                call.resolve()
            }
        }
    }

    // MARK: - 로그인 흐름

    private func startLogin(call: CAPPluginCall, nonce: String) {
        guard configured else {
            call.reject("Kakao native app key is not configured in this build", Self.codeNotConfigured)
            return
        }
        if let running = current {
            if Date().timeIntervalSince(running.startedAt) < Self.doubleTapWindow {
                call.reject("Kakao login is already in progress", Self.codeInProgress)
                return
            }
            // 앞의 시도가 끝나지 않은 채 남아 있다 — 취소로 정리하고 새로 시작한다.
            abandon(running)
        }

        let attempt = Attempt(call: call, nonce: nonce)
        current = attempt

        if UserApi.isKakaoTalkLoginAvailable() {
            attempt.phase = .talk
            UserApi.shared.loginWithKakaoTalk(nonce: nonce) { [weak self] token, error in
                DispatchQueue.main.async {
                    self?.talkFinished(attempt, token: token, error: error)
                }
            }
        } else {
            startAccountLogin(attempt)
        }
    }

    private func startAccountLogin(_ attempt: Attempt) {
        attempt.phase = .account
        // prompts·loginHint 를 굳이 적는 이유: SDK 에 같은 이름의 오버로드(카카오싱크용)가 있어 nonce 만 넘기면 모호하다.
        UserApi.shared.loginWithKakaoAccount(prompts: nil, loginHint: nil, nonce: attempt.nonce) { [weak self] token, error in
            DispatchQueue.main.async {
                self?.accountFinished(attempt, token: token, error: error)
            }
        }
    }

    private func talkFinished(_ attempt: Attempt, token: OAuthToken?, error: Error?) {
        guard current === attempt else { return }
        if let error = error {
            if Self.isCanceled(error) {
                fail(attempt, code: Self.codeCanceled, message: Self.describe(error))
                return
            }
            // 카카오 안내 그대로: 카카오톡 로그인이 취소가 아닌 이유로 실패하면(카카오톡에 계정이 없는 경우 등) 카카오계정 로그인으로 넘어간다.
            CAPLog.print("[RankueKakao] 카카오톡 로그인 실패 → 카카오계정 로그인으로: \(Self.describe(error))")
            attempt.phase = .account
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.fallbackDelay) { [weak self] in
                guard let self = self, self.current === attempt else { return }
                self.startAccountLogin(attempt)
            }
            return
        }
        succeed(attempt, token: token, viaTalk: true)
    }

    private func accountFinished(_ attempt: Attempt, token: OAuthToken?, error: Error?) {
        guard current === attempt else { return }
        if let error = error {
            fail(attempt, code: Self.isCanceled(error) ? Self.codeCanceled : Self.codeFailed, message: Self.describe(error))
            return
        }
        succeed(attempt, token: token, viaTalk: false)
    }

    private func succeed(_ attempt: Attempt, token: OAuthToken?, viaTalk: Bool) {
        guard let idToken = token?.idToken, !idToken.isEmpty else {
            fail(attempt, code: Self.codeNoIdToken, message: "Kakao did not return an ID token — enable OpenID Connect in the Kakao console")
            return
        }
        current = nil
        attempt.call.resolve([
            "idToken": idToken,
            "viaTalk": viaTalk
        ])
    }

    private func fail(_ attempt: Attempt, code: String, message: String) {
        if current === attempt {
            current = nil
        }
        attempt.call.reject(message, code)
    }

    /// 끝나지 않은 시도를 취소로 정리한다. SDK 가 뒤늦게 부르는 콜백은 `current === attempt` 검사에서 버려진다.
    private func abandon(_ attempt: Attempt) {
        switch attempt.phase {
        case .talk:
            AuthController.shared.authorizeWithTalkCompletionHandler = nil
        case .account:
            AuthController.shared.authenticationSession?.cancel()
        }
        fail(attempt, code: Self.codeCanceled, message: "superseded by a newer login call")
    }

    // MARK: - 카카오톡에서 돌아오기

    private func handleOpenUrl(_ notification: Notification) {
        // 키가 없을 때 SDK 에 URL 을 물으면 SDK 안에서 죽는다(초기화 전) — configured 가 먼저다.
        guard configured,
              let object = notification.object as? [String: Any],
              let url = object["url"] as? URL,
              AuthApi.isKakaoTalkLoginUrl(url) else {
            return
        }
        // 이 알림은 메인 스레드에서 온다(관찰자 queue = .main).
        let handled = MainActor.assumeIsolated {
            AuthController.handleOpenUrl(url: url)
        }
        if handled, let attempt = current, attempt.phase == .talk {
            attempt.gotTalkCallback = true
        }
    }

    private func appDidEnterBackground() {
        if let attempt = current, attempt.phase == .talk {
            attempt.leftApp = true
        }
    }

    /// 카카오톡에서 동의를 마치지 않고 앱 전환기로 돌아오면 SDK 는 아무 콜백도 주지 않는다(웹의 로그인 단추가 영영 돈다).
    /// 앱이 다시 앞으로 나왔는데 콜백 URL 이 잠깐 기다려도 안 오면 취소로 끝낸다.
    private func appDidBecomeActive() {
        guard let attempt = current, attempt.phase == .talk, attempt.leftApp, !attempt.gotTalkCallback else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.talkReturnGrace) { [weak self] in
            guard let self = self,
                  self.current === attempt,
                  attempt.phase == .talk,
                  !attempt.gotTalkCallback else {
                return
            }
            AuthController.shared.authorizeWithTalkCompletionHandler = nil
            self.fail(attempt, code: Self.codeCanceled, message: "returned from KakaoTalk without finishing login")
        }
    }

    // MARK: - 도우미

    /// Info.plist 의 네이티브 앱 키. 비었거나 자리표시자 그대로면 nil.
    private static func readAppKey() -> String? {
        let raw = (Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty || raw == placeholderKey || raw.hasPrefix("$(") {
            return nil
        }
        return raw
    }

    private static func isCanceled(_ error: Error) -> Bool {
        guard let sdkError = error as? SdkError else { return false }
        switch sdkError {
        case .ClientFailed(let reason, _):
            return reason == .Cancelled
        case .AuthFailed(let reason, _):
            // 동의 화면에서 '취소'를 누른 경우
            return reason == .AccessDenied
        default:
            return false
        }
    }

    private static func describe(_ error: Error) -> String {
        guard let sdkError = error as? SdkError else {
            return error.localizedDescription
        }
        switch sdkError {
        case .ClientFailed(let reason, let message):
            return "client:\(reason) \(message ?? "")"
        case .AuthFailed(let reason, let info):
            return "auth:\(reason.rawValue) \(info?.errorDescription ?? "")"
        case .ApiFailed(let reason, let info):
            return "api:\(reason.rawValue) \(info?.msg ?? "")"
        default:
            return String(describing: sdkError)
        }
    }
}
