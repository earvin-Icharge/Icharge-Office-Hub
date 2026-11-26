/** The Office Hub Android app shows this website in its own window; its user agent ends with "OfficeHubApp/<n>". */
export const OFFICE_HUB_APP_UA = "OfficeHubApp/";

export function isOfficeHubAppUA(ua: string | null | undefined) {
  return !!ua && ua.includes(OFFICE_HUB_APP_UA);
}

/** In the browser: is this page open inside the Office Hub app? */
export function inOfficeHubApp() {
  return typeof navigator !== "undefined" && isOfficeHubAppUA(navigator.userAgent);
}
