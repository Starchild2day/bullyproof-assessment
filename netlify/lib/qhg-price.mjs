// The Quick Help Guides price, decided by date so nobody has to change anything by hand.
// Founding Family price $37 through Dec 31, 2026 (Arizona time); $47 from Jan 1, 2027.
// Checkout, the buy buttons and the locked-page buttons all read the price from here.
export const FOUNDING_CENTS = 3700;
export const REGULAR_CENTS = 4700;
export const PRICE_SWITCH = "2027-01-01T00:00:00-07:00"; // midnight in Yuma (Arizona has no daylight time)

export function isFounding(now = new Date()) {
  return now.getTime() < Date.parse(PRICE_SWITCH);
}
export function priceCents(now = new Date()) {
  return isFounding(now) ? FOUNDING_CENTS : REGULAR_CENTS;
}
export function priceLabel(now = new Date()) {
  return "$" + priceCents(now) / 100;
}
