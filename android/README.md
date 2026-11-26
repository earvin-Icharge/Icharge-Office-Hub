# Office Hub for Android (builder notes)

A Trusted Web Activity: the app opens the live web app (https://icharge-office-hub.vercel.app) full screen through Google Chrome.
Screens and logic update over the air with every web release; rebuild this app only to change its name, icon or permissions.

- Package: `ph.com.icharge.officehub` · download page: `/download` · file: `public/download/office-hub.apk`
- Android trusts the app through `public/.well-known/assetlinks.json` (the signing key's SHA-256 fingerprint).
- **Signing key:** never in the repository. It is in the database table `public.app_secrets` (service role only):
  `android_keystore_b64` (the PKCS12 key file, base64) and `android_keystore_password`. Keep using this key: Android only installs
  an update signed with the same key.

## Rebuild
1. Android SDK with `platforms;android-36` and `build-tools;36.0.0`; Java 17+; Gradle 8.13+.
2. Restore the key file from `app_secrets` into a private folder (outside the repository).
3. Raise `versionCode` (and `versionName`) in `app/build.gradle`.
4. `OH_KEYSTORE=/path/officehub.jks OH_KEYSTORE_PASSWORD=… gradle assembleRelease`
5. Copy `app/build/outputs/apk/release/app-release.apk` to `public/download/office-hub.apk` and release the web app.
