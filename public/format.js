// Shared by the market and the log: an amount of play money in yen.
export const yen = (n) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
