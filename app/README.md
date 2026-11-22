# Rubbernecker — Android app (Expo)

Same engine as the website (`../core.js`), plus a background location service so it keeps working with the screen off.

## Get the APK (no accounts or tokens needed)
Every push that touches `app/` builds a release APK on GitHub (workflow **Build Android APK**, ~10–15 min) and publishes it to the
**latest** release: https://github.com/bbrucker50/Rubbernecker/releases/tag/latest

On your phone: open that page, download **Rubbernecker.apk**, open it, and allow "install unknown apps" for your browser when asked.
Later builds install over earlier ones.

## First run on the phone
1. Tap **Start exploring**, allow **Location** and **Notifications**.
2. For tracking with the screen off, choose **Allow all the time** (Android settings → Apps → Rubbernecker → Permissions → Location) and
   set battery to **Unrestricted**. A persistent notification shows while it's watching; that's Android's required foreground-service notice.
3. Use **Settings → Test location** to try a preset without moving.

## Develop
```bash
cd app && npm ci
npm run typecheck && npm run lint && npm test
npm run sync-core   # after editing ../core.js (a test fails if the copies differ)
```
The native `android/` project is generated from `app.json` (`npx expo prebuild`); never edit it by hand.

## Alternative: EAS Build (like Podcast Bandit)
`eas.json` has a `preview` profile that builds an APK. The first build needs one interactive run (`npx eas-cli build -p android --profile preview`)
to link an Expo project and create a keystore; after that the same command works from CI with an `EXPO_TOKEN`.
