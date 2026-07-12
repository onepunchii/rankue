import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.co.rankue',
  appName: 'RANKUE',
  // Required by the CLI even when loading a remote URL; the built web assets live here.
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // ── Interim scaffolding approach ──────────────────────────────────────────
    // Load the live web app so the existing signed-cookie auth (SameSite=Lax)
    // works first-party inside the WebView with zero server changes.
    // Productionization path (bundle dist/public offline + native-optimized auth,
    // i.e. token or SameSite=None + CORS) is deferred to the push/build phase.
    url: 'https://www.rankue.co.kr',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0A0A',
  },
  android: {
    backgroundColor: '#0A0A0A',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0A0A0A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    // Push wiring (FCM/APNs) is added in the push phase; the plugin is already installed.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
