/**
 * AnyDesk IDs, for remote support with the AnyDesk app: the ID a computer shows (nine or ten
 * digits, often written in groups) or an alias (`name@namespace`), and the link that opens AnyDesk
 * to it on the computer of whoever clicks.
 */

const DIGITS = /^\d{9,10}$/;
const ALIAS = /^[\w.-]+@[\w.-]+$/;

/** The ID as stored: digits without the spaces it is often written with, or an alias in lower case. */
export function normalizeAnydeskId(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[\s-]/g, "");
  return DIGITS.test(digits) ? digits : trimmed.toLowerCase();
}

export function isAnydeskId(value: string) {
  return DIGITS.test(value) || ALIAS.test(value);
}

/** The ID as AnyDesk shows it: digits in threes from the right ("1 234 567 890"). */
export function formatAnydeskId(id: string) {
  return DIGITS.test(id) ? id.replace(/\B(?=(\d{3})+$)/g, " ") : id;
}

/** Opens the AnyDesk app, where it is installed, and connects to the computer. */
export function anydeskLink(id: string) {
  return `anydesk:${id}`;
}
