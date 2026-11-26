# Office Hub for Android (builder notes)

A native Android app (Capacitor 8) that shows the **live** Office Hub (https://icharge-office-hub.vercel.app) inside its own window:
no browser, and always in sync with the website (same screens and data; every web release reaches the app at once).
Rebuild this app only to change its name, icon, permissions or native features.

- Package `ph.com.icharge.officehub` · download page `/download` · file `public/download/office-hub.apk`
- Native: camera and location for Time in, Excel exports saved to Downloads, back button, Office Hub links open in the app,
  passkeys where the phone's WebView supports them, offline page (`www/offline.html`).
- The website knows it is inside the app from the user agent (`OfficeHubApp/<n>`, see `src/lib/native.ts`).
- Android trusts the app for links and passkeys through `public/.well-known/assetlinks.json` (signing key's SHA-256).
- **Signing key:** never in the repository. It is in the database table `public.app_secrets` (service role only):
  `android_keystore_b64` (PKCS12 key file, base64) and `android_keystore_password`. Always use this key: Android only installs
  an update signed with the same key.

## Rebuild
1. Android SDK (`platforms;android-36`, `build-tools;36.0.0`), Java 21, Node.
2. `cd mobile && npm install && npx cap sync android`
3. Raise `versionCode` / `versionName` in `android/app/build.gradle`.
4. Restore the key file from `app_secrets` to a private folder outside the repository, then
   `cd android && OH_KEYSTORE=/path/officehub.jks OH_KEYSTORE_PASSWORD=… ./gradlew assembleRelease`
5. Copy `android/app/build/outputs/apk/release/app-release.apk` to `public/download/office-hub.apk` and release the web app.
