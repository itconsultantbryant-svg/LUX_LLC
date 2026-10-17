/**
 * Deterministic intent understanding for the LUX assistant.
 *
 * This is the "AI that does the actual work" without a live model: it maps a
 * customer's own words onto a small, explicit set of intents and extracts the
 * structured detail (amounts, emergency context) the action engine needs. It is
 * pure and unit-tested so behaviour is predictable and auditable.
 */

export type ChatIntent =
  | 'greeting'
  | 'briefing'
  | 'wallet'
  | 'bills'
  | 'pay'
  | 'provider'
  | 'emergency'
  | 'fees'
  | 'support'
  | 'add_funds'
  | 'unknown';

const GREETING =
  /^(hi|hey|hello|howdy|good (morning|afternoon|evening)|start|help)\b|^(hi|hello|hey)[!.]?$/;
const EMERGENCY =
  /(emergency|urgent|asap|accident|bleeding|injur|ambulance|collapse|unconscious|can'?t breathe|cannot breathe|chest pain|nearest hospital|closest hospital|nearest clinic|closest clinic|right now)/;
const ADD_FUNDS =
  /(add (money|funds|cash)|top ?up|top-up|deposit|recharge|load my|load funds|put money|move money|transfer money|from orange money|orange money to|fund my wallet|fund my account|add to my (wallet|account|health wallet))/;
const BRIEFING =
  /(what should i do|what do i do|next step|recommend|advice|suggest|what needs|attention|status|update|check|summary|overview|any alert)/;
const WALLET = /(wallet|balance|how much do i have|my funds|my money|savings|save)/;
const BILLS = /(bill|invoice|receipt|upload|document|scan|photo|statement|charge sheet)/;
const PAY = /(pay|payment|authorize|checkout|settle|paying for|pay for care)/;
const FEES =
  /(fee|fees|charge me|charges|cost of the service|your fee|how much do you charge|pricing)/;
const SUPPORT =
  /(support|help me|human|agent|shortfall|can'?t afford|cannot afford|assist|subsid|sponsor|voucher|charity)/;
const PROVIDER =
  /(provider|hospital|clinic|doctor|pharmacy|health cent|facility|near me|nearby|find a|find any)/;

export function classifyIntent(text: string): ChatIntent {
  const q = text.toLowerCase().trim();
  if (!q) return 'unknown';
  if (GREETING.test(q)) return 'greeting';
  if (EMERGENCY.test(q)) return 'emergency';
  // "add money", "top up", "from Orange Money" must beat the generic wallet match.
  if (ADD_FUNDS.test(q)) return 'add_funds';
  if (BRIEFING.test(q)) return 'briefing';
  if (FEES.test(q)) return 'fees';
  if (SUPPORT.test(q)) return 'support';
  if (BILLS.test(q)) return 'bills';
  if (PAY.test(q)) return 'pay';
  if (WALLET.test(q)) return 'wallet';
  if (PROVIDER.test(q)) return 'provider';
  return 'unknown';
}

const AMOUNT = /(?:l\$|lr\$|lrd|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;

/**
 * Extract the first plausible money amount from free text and return it in minor
 * units. Bare integers are read as whole currency units (e.g. "500" -> 500.00).
 * Returns null when nothing money-like is present.
 */
export function extractAmountMinor(text: string): string | null {
  const match = text.match(AMOUNT);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const minor = Math.round(numeric * 100);
  if (minor <= 0 || BigInt(minor) > 9223372036854775807n) return null;
  return minor.toString();
}

export function isEmergency(text: string): boolean {
  return EMERGENCY.test(text.toLowerCase());
}
