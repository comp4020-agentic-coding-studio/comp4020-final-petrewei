// Shared by the market, the log and the tutorial: play money in yen, and a price of a pair
// to five significant digits, so 158.45 and 1.2013 are as long as each other.
export const quoted = (p) => p.toPrecision(5);
export const yen = (n) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
