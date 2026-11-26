/** Version of this release. The builder raises it and adds a row to app_releases (What's new) with each release. */
export const APP_VERSION = "1.0.4";

/** Newest Android app (mobile/). The app tells its build number in its user agent: OfficeHubApp/<code>. */
export const ANDROID_APP = { code: 4, name: "2.2" };

/** Unique id of this build (the Git commit on Vercel). Used to spot that a newer build is live. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** -1 if a < b, 0 if equal, 1 if a > b (simple x.y.z compare). */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
