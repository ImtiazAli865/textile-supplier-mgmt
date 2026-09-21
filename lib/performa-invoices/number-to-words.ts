const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

function threeDigitsToWords(n: number): string {
  if (n === 0) return "";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(twoDigitsToWords(rest));
  return parts.join(" ");
}

/** South Asian (Hundred/Thousand/Lakh/Crore) grouping — matches standard Pakistani
 * business-document convention, not the international short scale (Million/Billion). */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigitsToWords(hundred));

  return parts.join(" ");
}

/**
 * Converts a PKR amount into words for a printed Performa Invoice (FR-006), e.g.
 * `403265.00` -> `"Four Lakh Three Thousand Two Hundred Sixty Five Rupees Only"`. Uses the South
 * Asian (Lakh/Crore) numbering convention, matching standard Pakistani business-document
 * practice, not the international Million/Billion short scale (research.md). A self-contained,
 * dependency-free algorithm — no third-party number-to-words package.
 */
export function amountInWords(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paisa = Math.round((rounded - rupees) * 100);

  const rupeesWords = integerToWords(rupees);
  if (paisa === 0) {
    return `${rupeesWords} Rupees Only`;
  }
  const paisaWords = integerToWords(paisa);
  return `${rupeesWords} Rupees and ${paisaWords} Paisa Only`;
}
