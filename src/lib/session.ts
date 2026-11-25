/** Spec 3.5: stay signed in for 30 days on the same device, then a new email code is needed. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Set once when an email code is accepted; never refreshed. When it expires the user must sign in again. */
export const SIGNED_IN_COOKIE = "oh_signed_in";

export const LOCALE_COOKIE = "locale";

export const signedInCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
