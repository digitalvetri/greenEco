import { Decimal } from "decimal.js";

/**
 * Money helpers. Rule (spec §9): money is Decimal in DB, decimal.js in code —
 * never float arithmetic on ₹.
 */

export type Money = Decimal;

export function money(value: Decimal.Value | { toString(): string } = 0): Decimal {
  // Prisma.Decimal and decimal.js Decimal both round-trip cleanly via string.
  return new Decimal(value as Decimal.Value);
}

export function add(...values: Decimal.Value[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
}

export function mul(a: Decimal.Value, b: Decimal.Value): Decimal {
  return new Decimal(a).times(b);
}

/** Round to 2 decimals (paise) using banker-safe half-up. */
export function round2(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Indian grouping format: 1,50,000. Returns the numeric portion only (no ₹).
 */
export function formatIndianNumber(v: Decimal.Value): string {
  const d = new Decimal(v);
  const negative = d.isNegative();
  const fixed = d.abs().toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  const body = decPart === "00" ? grouped : `${grouped}.${decPart}`;
  return negative ? `-${body}` : body;
}

/** ₹1,50,000.00 style. */
export function formatINR(v: Decimal.Value): string {
  return `₹${formatIndianNumber(v)}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/**
 * Amount in words, Indian system (Crore/Lakh/Thousand), for invoices.
 * e.g. 150000 -> "Rupees One Lakh Fifty Thousand Only"
 */
export function amountInWords(v: Decimal.Value): string {
  const d = round2(v);
  const rupees = d.floor();
  const paise = d.minus(rupees).times(100).round().toNumber();

  let n = rupees.toNumber();
  if (!Number.isFinite(n)) throw new Error("amountInWords: value too large");

  if (n === 0 && paise === 0) return "Rupees Zero Only";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));

  let words = "Rupees " + parts.join(" ").replace(/\s+/g, " ").trim();
  if (paise > 0) {
    words += ` and ${twoDigits(paise)} Paise`;
  }
  return words + " Only";
}
