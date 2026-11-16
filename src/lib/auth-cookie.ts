/**
 * The start of this app's sign-in cookie names. Browsers keep cookies by host, not by port, so
 * another app on the same server (another port of 192.168.0.119, say) that also used the library's
 * default names would overwrite this app's sign-in, and signing in there would sign people out here.
 */
export const COOKIE_PREFIX = "ap-it";
