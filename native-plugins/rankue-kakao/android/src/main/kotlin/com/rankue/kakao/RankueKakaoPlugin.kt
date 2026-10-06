package com.rankue.kakao

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.kakao.sdk.auth.AuthApiClient
import com.kakao.sdk.auth.model.OAuthToken
import com.kakao.sdk.common.KakaoSdk
import com.kakao.sdk.common.model.ApiError
import com.kakao.sdk.common.model.AuthError
import com.kakao.sdk.common.model.AuthErrorCause
import com.kakao.sdk.common.model.ClientError
import com.kakao.sdk.common.model.ClientErrorCause
import com.kakao.sdk.user.UserApiClient

// 네이티브 카카오 로그인 — 웹(원격 URL)이 registerPlugin("RankueKakao") 로 부른다.
//
//   login({ nonce }) → { idToken, viaTalk }
//     카카오톡이 깔려 있으면 카카오톡 간편로그인, 없으면 카카오계정 로그인(커스텀 탭)으로 간다.
//     nonce 는 SDK 에 그대로 넘겨 ID 토큰에 실린다 — 서버가 자기가 낸 nonce 와 맞는지 본다.
//     액세스·리프레시 토큰은 웹(JS)으로 넘기지 않는다 — ID 토큰과 viaTalk 뿐이다(계약: shared/kakaoNative.ts).
//     거절 code: CANCELED(사용자 취소) · NO_ID_TOKEN(콘솔에서 OpenID Connect 꺼짐) ·
//               NOT_CONFIGURED(네이티브 앱 키 없음) · BAD_NONCE · IN_PROGRESS(연타) · FAILED(그 밖)
//   logout() → SDK 가 기기에 들고 있는 카카오 토큰만 지운다(우리 서버 세션과 무관). 늘 resolve.
//
// 네이티브 앱 키는 BuildConfig.KAKAO_NATIVE_APP_KEY — build.gradle 이 android/kakao.properties 에서 읽어 넣는다(README).
//
// 주의: Capacitor CLI 는 플러그인 표식(애너테이션) 뒤에 처음 나오는 "c-l-a-s-s 이름" 을 정규식으로 찾아 등록한다(cap sync →
// capacitor.plugins.json). 표식과 선언 사이에 주석을 끼워 넣지 않는다.
@CapacitorPlugin(name = "RankueKakao")
class RankueKakaoPlugin : Plugin() {

    private class Attempt(val call: PluginCall, val nonce: String) {
        val startedAt: Long = SystemClock.elapsedRealtime()
    }

    // 아래 상태는 전부 메인 스레드에서만 만진다.
    private val main = Handler(Looper.getMainLooper())
    private var configured = false
    private var current: Attempt? = null

    override fun load() {
        val appKey = BuildConfig.KAKAO_NATIVE_APP_KEY.trim()
        if (appKey.isNotEmpty() && appKey != PLACEHOLDER_KEY) {
            KakaoSdk.init(context.applicationContext, appKey)
            configured = true
        } else {
            Log.w(TAG, "네이티브 앱 키가 없다 — android/kakao.properties 의 KAKAO_NATIVE_APP_KEY 를 채워야 카카오 로그인이 된다")
        }
    }

    // ── 웹에서 부르는 메서드 ──────────────────────────────────────────────────

    @PluginMethod
    fun login(call: PluginCall) {
        // nonce 는 서버가 낸 글자 그대로 SDK 에 넘긴다(다듬지 않는다 — shared/kakaoNative.ts 계약). 빈 값만 거른다.
        val nonce = call.getString("nonce").orEmpty()
        if (nonce.isBlank()) {
            call.reject("nonce is required", CODE_BAD_NONCE)
            return
        }
        main.post { startLogin(call, nonce) }
    }

    @PluginMethod
    fun logout(call: PluginCall) {
        main.post {
            try {
                // 키가 없으면 SDK 를 건드리지 않는다(초기화 전 호출은 SDK 안에서 예외). 지울 토큰도 없다.
                if (!configured || !AuthApiClient.instance.hasToken()) {
                    call.resolve()
                    return@post
                }
                // 카카오 쪽 토큰 만료 요청이 실패해도 SDK 는 기기의 토큰을 지운다 — 그래서 늘 resolve.
                UserApiClient.instance.logout { _ -> call.resolve() }
            } catch (t: Throwable) {
                Log.w(TAG, "logout 실패: ${describe(t)}")
                call.resolve()
            }
        }
    }

    // ── 로그인 흐름 ───────────────────────────────────────────────────────────

    private fun startLogin(call: PluginCall, nonce: String) {
        if (!configured) {
            call.reject("Kakao native app key is not configured in this build", CODE_NOT_CONFIGURED)
            return
        }
        val host = activity
        if (host == null || host.isFinishing) {
            call.reject("activity is not available", CODE_FAILED)
            return
        }
        current?.let { running ->
            if (SystemClock.elapsedRealtime() - running.startedAt < DOUBLE_TAP_WINDOW_MS) {
                call.reject("Kakao login is already in progress", CODE_IN_PROGRESS)
                return
            }
            // 앞의 시도가 끝나지 않은 채 남아 있다 — 취소로 정리하고 새로 시작한다(뒤늦은 SDK 콜백은 current 검사에서 버려진다).
            fail(running, CODE_CANCELED, "superseded by a newer login call")
        }

        val attempt = Attempt(call, nonce)
        current = attempt
        try {
            if (UserApiClient.instance.isKakaoTalkLoginAvailable(host)) {
                UserApiClient.instance.loginWithKakaoTalk(host, nonce = nonce) { token, error ->
                    main.post { talkFinished(attempt, token, error) }
                }
            } else {
                startAccountLogin(attempt)
            }
        } catch (t: Throwable) {
            fail(attempt, CODE_FAILED, describe(t))
        }
    }

    private fun startAccountLogin(attempt: Attempt) {
        val host = activity
        if (host == null || host.isFinishing) {
            fail(attempt, CODE_FAILED, "activity is not available")
            return
        }
        try {
            UserApiClient.instance.loginWithKakaoAccount(host, nonce = attempt.nonce) { token, error ->
                main.post { accountFinished(attempt, token, error) }
            }
        } catch (t: Throwable) {
            fail(attempt, CODE_FAILED, describe(t))
        }
    }

    private fun talkFinished(attempt: Attempt, token: OAuthToken?, error: Throwable?) {
        if (current !== attempt) return
        if (error != null) {
            if (isCanceled(error)) {
                fail(attempt, CODE_CANCELED, describe(error))
                return
            }
            // 카카오 안내 그대로: 카카오톡 로그인이 취소가 아닌 이유로 실패하면(카카오톡에 계정이 없는 경우 등) 카카오계정 로그인으로 넘어간다.
            Log.w(TAG, "카카오톡 로그인 실패 → 카카오계정 로그인으로: ${describe(error)}")
            startAccountLogin(attempt)
            return
        }
        succeed(attempt, token, viaTalk = true)
    }

    private fun accountFinished(attempt: Attempt, token: OAuthToken?, error: Throwable?) {
        if (current !== attempt) return
        if (error != null) {
            fail(attempt, if (isCanceled(error)) CODE_CANCELED else CODE_FAILED, describe(error))
            return
        }
        succeed(attempt, token, viaTalk = false)
    }

    private fun succeed(attempt: Attempt, token: OAuthToken?, viaTalk: Boolean) {
        val idToken = token?.idToken
        if (idToken.isNullOrEmpty()) {
            fail(attempt, CODE_NO_ID_TOKEN, "Kakao did not return an ID token — enable OpenID Connect in the Kakao console")
            return
        }
        current = null
        val result = JSObject()
        result.put("idToken", idToken)
        result.put("viaTalk", viaTalk)
        attempt.call.resolve(result)
    }

    private fun fail(attempt: Attempt, code: String, message: String) {
        if (current === attempt) {
            current = null
        }
        attempt.call.reject(message, code)
    }

    // ── 도우미 ────────────────────────────────────────────────────────────────

    private fun isCanceled(error: Throwable): Boolean = when (error) {
        is ClientError -> error.reason == ClientErrorCause.Cancelled
        // 동의 화면에서 '취소'를 누른 경우
        is AuthError -> error.reason == AuthErrorCause.AccessDenied
        else -> false
    }

    private fun describe(error: Throwable): String = when (error) {
        is ClientError -> "client:${error.reason} ${error.msg}"
        is AuthError -> "auth:${error.response.error} ${error.response.errorDescription.orEmpty()}"
        is ApiError -> "api:${error.response.code} ${error.response.msg}"
        else -> "${error.javaClass.simpleName}: ${error.message.orEmpty()}"
    }

    private companion object {
        const val TAG = "RankueKakao"
        const val PLACEHOLDER_KEY = "KAKAO_NATIVE_APP_KEY_HERE"

        const val CODE_CANCELED = "CANCELED"
        const val CODE_NO_ID_TOKEN = "NO_ID_TOKEN"
        const val CODE_NOT_CONFIGURED = "NOT_CONFIGURED"
        const val CODE_BAD_NONCE = "BAD_NONCE"
        const val CODE_IN_PROGRESS = "IN_PROGRESS"
        const val CODE_FAILED = "FAILED"

        /** 이 시간 안에 login 이 또 오면 연타로 보고 뒤의 것을 거절한다. 그보다 뒤에 오면 앞의 것이 멈춘 것으로 보고 새 호출이 이긴다. */
        const val DOUBLE_TAP_WINDOW_MS = 1000L
    }
}
