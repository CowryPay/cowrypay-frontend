// Mirrors the backend's supported off-ramp corridors (Paycrest) — keep in
// sync with backend/src/ai-agent/offramp/countries.ts if that list changes.

export type CountryInfo = {
  countryCode:  string;
  currencyCode: string;
  name:         string;
};

const COUNTRIES: Record<string, CountryInfo> = {
  nigeria:  { countryCode: "NG", currencyCode: "NGN", name: "Nigeria" },
  ng:       { countryCode: "NG", currencyCode: "NGN", name: "Nigeria" },
  naira:    { countryCode: "NG", currencyCode: "NGN", name: "Nigeria" },
  kenya:    { countryCode: "KE", currencyCode: "KES", name: "Kenya" },
  ke:       { countryCode: "KE", currencyCode: "KES", name: "Kenya" },
  shilling: { countryCode: "KE", currencyCode: "KES", name: "Kenya" },
  uganda:   { countryCode: "UG", currencyCode: "UGX", name: "Uganda" },
  ug:       { countryCode: "UG", currencyCode: "UGX", name: "Uganda" },
  tanzania: { countryCode: "TZ", currencyCode: "TZS", name: "Tanzania" },
  tz:       { countryCode: "TZ", currencyCode: "TZS", name: "Tanzania" },
  malawi:   { countryCode: "MW", currencyCode: "MWK", name: "Malawi" },
  mw:       { countryCode: "MW", currencyCode: "MWK", name: "Malawi" },
};

export const SUPPORTED_COUNTRIES = ["Nigeria", "Kenya", "Uganda", "Tanzania", "Malawi"];

/** Resolve a free-text country/currency hint ("Nigeria", "NGN", "naira") to a country+currency pair. */
export function resolveCountry(text: string | null | undefined): CountryInfo | null {
  if (!text) return null;
  const key = text.trim().toLowerCase();
  if (COUNTRIES[key]) return COUNTRIES[key];

  const byCurrency = Object.values(COUNTRIES).find((c) => c.currencyCode.toLowerCase() === key);
  if (byCurrency) return byCurrency;

  const byName = Object.values(COUNTRIES).find(
    (c) => c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase()),
  );
  return byName ?? null;
}

/** Scans free text for any known country/currency word (used to parse a full sentence). */
export function findCountryInText(text: string): CountryInfo | null {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    const hit = COUNTRIES[w];
    if (hit) return hit;
  }
  return null;
}
