const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  UGX: "USh",
  TZS: "TSh",
  MWK: "MK",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}

export function formatFiat(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  const formatted = Number.isFinite(num)
    ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(amount);
  return `${currencySymbol(currency)}${formatted}`;
}

/** Formats a raw on-chain token amount (e.g. "1.000000000000000000") down to 2 decimals for display. */
export function formatToken(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return Number.isFinite(num)
    ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(amount);
}
