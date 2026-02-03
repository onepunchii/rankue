# 📱 Expo Hybrid App Integration Manual
>
> **For Next.js / React Web Projects**

This documentation details how to wrap an existing web application into a native mobile app using Expo, enabling features like Push Notifications, Biometric Auth, and Persistent Login while maintaining a single codebase.

---

## 🏗️ 1. Project Structure

Create the mobile project **inside** your root directory to manage everything in one repo.

```
root/
├── client/          (Web Project: React/Next.js)
├── server/          (Backend API)
└── mobile-app/      (New Expo Project: The "Shell")
```

---

## 🛠️ 2. Step-by-Step Implementation

### Step 1: Create Expo Project

```bash
# In project root
npx create-expo-app mobile-app -t default

# Clean up default router files (we only need App.tsx)
rm -rf mobile-app/app
```

### Step 2: Install Essentials

```bash
cd mobile-app
npx expo install react-native-webview expo-secure-store expo-constants expo-notifications expo-device react-native-safe-area-context
```

### Step 3: Configure `app.json` (The Look & Feel)

Set the app to **Dark Mode** (or match your brand) to prevent white flashes during loading.

```json
{
  "expo": {
    "userInterfaceStyle": "dark",
    "backgroundColor": "#000000",
    "android": {
        "statusBar": {
            "backgroundColor": "#000000",
            "barStyle": "light-content"
        }
    }
    // ... config plugin: "expo-secure-store", "expo-notifications"
  }
}
```

### Step 4: The "Super Shell" Code (`App.tsx`)

This is the core native code. It handles:

1. **WebView**: Displays your Vercel URL.
2. **Auto-Login**: Injects stored tokens into `localStorage` on startup.
3. **Bridge**: Listens for messages from the web (`LOGIN_SUCCESS`) and sends native data to the web (`FCM_TOKEN`).
4. **Splash Screen**: Handles custom fade-out animation.

*(Refer to `rankue-app/App.tsx` for the full implementation.)*

### Step 5: Web-Side Bridge Hook (`useNativeBridge.ts`)

Create a hook in your web project to communicate with the app.

**Key Logic:**

- **Send**: `window.ReactNativeWebView.postMessage(JSON.stringify({ type: '...' }))`
- **Receive**: `window.addEventListener('message', ...)` or `document.addEventListener('message', ...)`

**Usage Example:**

```typescript
const { sendMessage, fcmToken } = useNativeBridge();

// 1. Notify App on Login
sendMessage({ type: 'LOGIN_SUCCESS', payload: { token: '...' } });

// 2. Trigger Native Vibration
sendMessage({ type: 'VIBRATE', payload: { style: 'heavy' } });
```

---

## 💡 3. Key Features Implemented

| Feature | How it works |
|:---:|---|
| **Zero-Loading** | Web: React Query Persistence (`persistQueryClient`) saves data to phone storage. |
| **Auto Login** | App: `SecureStore` saves token → Injects into WebView via `injectedJavaScript` on boot. |
| **Push Noti** | App: Gets `ExpoPushToken` → Sends to Web via Bridge → Web saves to DB. |
| **Safety** | App: `react-native-safe-area-context` prevents UI overlap with notches/status bars. |
| **Splash** | App: Custom `Animated.View` overlays WebView until fully loaded, then fades out. |

---

## ⚠️ Important Checkpoints

1. **User Agent**: Always set a custom UserAgent in WebView (e.g., `RankueApp`) so the web knows "I am inside the App".
2. **Android Back Button**: Must handle `HardwareBackPress` event in `App.tsx` to go back in WebView history instead of closing the app.
3. **PC Testing**: `react-native-webview` only works on phones (Simulators/Real Devices). It errors on PC browsers.

---

*This manual is based on the Rankue Hybrid Architecture (2026).*
