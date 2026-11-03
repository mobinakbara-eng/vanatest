/**
 * Deterministic rule engine for guest-message classification (DE/EN).
 *
 * The rule engine is the FIRST and authoritative gate: the LLM may raise the
 * level, never lower it below what a rule matched (see combineClassification).
 * Levels: AUTO < REVIEW < CRITICAL < EMERGENCY.
 *
 * Status: PLANNED → unit-tested; patterns must be tuned on real (anonymised) guest messages.
 */

const IC_LEVEL_ORDER = ['AUTO', 'REVIEW', 'CRITICAL', 'EMERGENCY'];

// Order matters only for intent naming; the highest level always wins.
const IC_RULES = [
  // ---- EMERGENCY --------------------------------------------------------
  { id: 'EMG_FIRE', level: 'EMERGENCY', intent: 'EMERGENCY_FIRE',
    re: /\b(fire|smoke|burning|feuer|brand|brennt|rauch)\b/i },
  { id: 'EMG_GAS', level: 'EMERGENCY', intent: 'EMERGENCY_GAS',
    re: /\b(gas\s?(leak|smell)|smell(s)? (of )?gas|gasgeruch|riecht nach gas)\b/i },
  { id: 'EMG_WATER', level: 'EMERGENCY', intent: 'EMERGENCY_WATER',
    re: /\b(flood(ing|ed)?|burst pipe|water (everywhere|leak(ing)? (from|through) (the )?ceiling)|überschwemm\w*|rohrbruch|wasserschaden|wasser (läuft|tropft) (aus|von) der decke)\b/i },
  { id: 'EMG_ELEC', level: 'EMERGENCY', intent: 'EMERGENCY_ELECTRIC',
    re: /\b(electric(al)? shock|sparks?|stromschlag|funken|kabel (brennt|qualmt))\b/i },
  { id: 'EMG_MEDICAL', level: 'EMERGENCY', intent: 'EMERGENCY_MEDICAL',
    re: /\b(ambulance|unconscious|heart attack|not breathing|bleeding (heavily|a lot)|krankenwagen|notarzt|bewusstlos|herzinfarkt|atmet nicht)\b/i },
  { id: 'EMG_SAFETY', level: 'EMERGENCY', intent: 'EMERGENCY_SAFETY',
    re: /\b(break-?in|burglar|intruder|someone (is )?(in|inside) the apartment|threat(en(ed|ing))?|attack(ed)?|einbruch|einbrecher|bedroht|angegriffen|eingesperrt|trapped|locked in)\b/i },
  { id: 'EMG_POLICE', level: 'EMERGENCY', intent: 'EMERGENCY_GENERIC',
    re: /\b(emergency|notfall|police|polizei|112|110)\b/i },

  // ---- CRITICAL ---------------------------------------------------------
  { id: 'CRT_REFUND', level: 'CRITICAL', intent: 'REFUND',
    re: /\b(refund|money back|chargeback|erstattung|rückerstattung|geld zurück|erstatten)\b/i },
  { id: 'CRT_LEGAL', level: 'CRITICAL', intent: 'LEGAL_THREAT',
    re: /\b(lawyer|attorney|sue|lawsuit|legal action|court|anwalt|rechtsanwalt|verklagen|klage|gericht|verbraucherzentrale)\b/i },
  { id: 'CRT_MEDIA', level: 'CRITICAL', intent: 'MEDIA_OR_REVIEW_THREAT',
    re: /\b(press|journalist|newspaper|bad review|1[- ]star|presse|zeitung|schlechte bewertung)\b/i },
  { id: 'CRT_CANCEL_DISPUTE', level: 'CRITICAL', intent: 'CANCELLATION_DISPUTE',
    re: /\b(cancel\w*|storn\w*)\b.*\b(refund|money|compensation|geld|entschädigung|erstatt\w*)\b/i },
  { id: 'CRT_DAMAGE', level: 'CRITICAL', intent: 'SERIOUS_DAMAGE',
    re: /\b(broken window|door (is )?broken|damaged|destroyed|kaputt(e|es)? (fenster|tür)|beschädigt|zerstört)\b/i },
  { id: 'CRT_SECURITY', level: 'CRITICAL', intent: 'SECURITY_ACCESS',
    re: /\b(lost (the |my )?key|key (is )?lost|stolen|change the code|code (doesn'?t|does not) work|can'?t (get|come) in|locked out|schlüssel verloren|gestohlen|code funktioniert nicht|komme nicht rein|ausgesperrt)\b/i },
  { id: 'CRT_NEIGHBOUR', level: 'CRITICAL', intent: 'NEIGHBOUR_CONFLICT',
    re: /\b(neighbou?r\w* (complain|angry|shout)|nachbar\w* (beschwer|streit|schrei))/i },
  { id: 'CRT_COMPENSATION', level: 'CRITICAL', intent: 'COMPENSATION',
    re: /\b(compensation|discount|reimburse|entschädigung|rabatt|preisnachlass|minderung)\b/i },

  // ---- REVIEW -----------------------------------------------------------
  { id: 'REV_EARLY_CHECKIN', level: 'REVIEW', intent: 'EARLY_CHECKIN',
    re: /\b(early check-?in|arrive (earlier|early)|früher (einchecken|anreisen|kommen)|früh(er|en)? check-?in)\b/i },
  { id: 'REV_LATE_CHECKOUT', level: 'REVIEW', intent: 'LATE_CHECKOUT',
    re: /\b(late check-?out|leave later|stay longer|später (auschecken|abreisen)|später(er|en)? check-?out)\b/i },
  { id: 'REV_EXTRA', level: 'REVIEW', intent: 'EXTRA_SERVICE',
    re: /\b(extra (bed|towels?|blanket)|baby ?cot|crib|zusätzlich\w* (bett|handtücher|decke)|babybett|kinderbett)\b/i },
  { id: 'REV_CLEANING', level: 'REVIEW', intent: 'CLEANING_ISSUE',
    re: /\b(dirty|not clean|stain|hair|smell(s|y)?|schmutzig|dreckig|nicht sauber|flecken|haare|stinkt)\b/i },
  { id: 'REV_CHANGE', level: 'REVIEW', intent: 'BOOKING_CHANGE',
    re: /\b(change (my |the )?(booking|reservation|dates)|extend|additional (night|guest)|umbuchen|verlängern|buchung ändern|zusätzlich\w* (nacht|gast))\b/i },
  { id: 'REV_PETS', level: 'REVIEW', intent: 'PETS',
    re: /\b(dog|cat|pet|hund|katze|haustier)\b/i },

  // ---- AUTO candidates (only AUTO if a verified KB fact exists) ----------
  { id: 'AUTO_WIFI', level: 'AUTO', intent: 'WIFI', kbKeys: ['wifi_ssid', 'wifi_password'],
    re: /\b(wi-?fi|wlan|internet|password|passwort)\b/i },
  { id: 'AUTO_CHECKOUT', level: 'AUTO', intent: 'CHECKOUT_TIME', kbKeys: ['check_out_time'],
    re: /\b(check-?out|auschecken|abreise)\b/i },
  { id: 'AUTO_CHECKIN', level: 'AUTO', intent: 'CHECKIN_TIME', kbKeys: ['check_in_time'],
    re: /\b(check-?in|einchecken|anreise)\b/i },
  { id: 'AUTO_ENTRY', level: 'AUTO', intent: 'ENTRY_GUIDE', kbKeys: ['entry_instructions'],
    re: /\b(enter|entrance|get (in|into)|find the (apartment|building|flat)|eingang|reinkommen|wohnung finden|haustür)\b/i },
  { id: 'AUTO_PARKING', level: 'AUTO', intent: 'PARKING', kbKeys: ['parking_info'],
    re: /\b(park(ing)?|parkplatz|parken|garage)\b/i },
  { id: 'AUTO_TRANSPORT', level: 'AUTO', intent: 'TRANSPORT', kbKeys: ['public_transport'],
    re: /\b(u-?bahn|s-?bahn|bus|tram|train|airport|flughafen|bahnhof|public transport)\b/i },
  { id: 'AUTO_WASTE', level: 'AUTO', intent: 'WASTE', kbKeys: ['waste_disposal'],
    re: /\b(trash|garbage|rubbish|waste|bin|müll|abfall|mülltonne)\b/i },
  { id: 'AUTO_HEATING', level: 'AUTO', intent: 'HEATING', kbKeys: ['heating_instructions'],
    re: /\b(heating|heater|radiator|cold|air ?con\w*|heizung|heizkörper|kalt|klimaanlage)\b/i },
  { id: 'AUTO_RULES', level: 'AUTO', intent: 'HOUSE_RULES', kbKeys: ['house_rules'],
    re: /\b(house rules|smok(e|ing)|party|quiet hours|hausordnung|rauchen|ruhezeit)\b/i },
  { id: 'AUTO_APPLIANCE', level: 'AUTO', intent: 'APPLIANCE', kbKeys: ['appliance_manual'],
    re: /\b(washing machine|dishwasher|oven|stove|coffee|tv|television|waschmaschine|spülmaschine|geschirrspüler|backofen|herd|kaffee|fernseher)\b/i },
];

// Something is broken/not working → never purely AUTO; troubleshooting answer + follow-up = REVIEW floor
const IC_MALFUNCTION_RE = /\b(not working|isn'?t working|is not working|won'?t (work|turn on)|doesn'?t work|does not work|broken|no (hot )?water|no power|funktioniert nicht|geht nicht|kaputt|kein (warm)?wasser|kein strom)\b/i;

// Attempts to steer the agent → never auto-answer.
const IC_INJECTION_RE = /(ignore (all |the )?(previous|above) (instructions|rules)|system prompt|you are now|act as|developer mode|reveal (the )?(code|password|prompt)|ignoriere (alle )?(vorherigen )?anweisungen|\bjailbreak\b|<\/?(system|assistant)>)/i;

function icMaxLevel(a, b) {
  return IC_LEVEL_ORDER.indexOf(a) >= IC_LEVEL_ORDER.indexOf(b) ? a : b;
}

/**
 * @param {string} text guest message
 * @returns {{level:string, intent:string, intents:string[], matchedRules:string[], kbKeys:string[], flags:string[]}}
 */
function classifyByRules(text) {
  const t = String(text || '').normalize('NFC');
  const matched = IC_RULES.filter((r) => r.re.test(t));
  const flags = [];
  let level = 'AUTO';
  for (const r of matched) level = icMaxLevel(level, r.level);

  if (IC_INJECTION_RE.test(t)) { flags.push('PROMPT_INJECTION_SUSPECTED'); level = icMaxLevel(level, 'REVIEW'); }
  if (IC_MALFUNCTION_RE.test(t)) { flags.push('MALFUNCTION'); level = icMaxLevel(level, 'REVIEW'); }
  if (matched.length === 0) { flags.push('NO_RULE_MATCH'); level = icMaxLevel(level, 'REVIEW'); }
  if (t.length > 1200) { flags.push('LONG_MESSAGE'); level = icMaxLevel(level, 'REVIEW'); }

  const top = matched.filter((r) => r.level === level);
  const intent = (top[0] || matched[0] || { intent: 'UNKNOWN' }).intent;
  return {
    level,
    intent,
    intents: [...new Set(matched.map((r) => r.intent))],
    matchedRules: matched.map((r) => r.id),
    kbKeys: [...new Set(matched.flatMap((r) => r.kbKeys || []))],
    flags,
  };
}

/**
 * Merge rule result with an (optional) LLM result.
 * - The LLM can only raise the level.
 * - AUTO requires: LLM agrees on AUTO, confidence >= threshold, and every needed KB key is available.
 * @param {object} rule  classifyByRules() output
 * @param {{level?:string, confidence?:number}|null} ai
 * @param {{availableKbKeys?:string[], threshold?:number, propertyAutoEnabled?:boolean}} ctx
 */
function combineClassification(rule, ai, ctx) {
  const c = ctx || {};
  const threshold = c.threshold ?? 0.85;
  const reasons = [];
  let level = rule.level;
  if (ai && IC_LEVEL_ORDER.includes(ai.level)) level = icMaxLevel(level, ai.level);

  if (level === 'AUTO') {
    if (!ai) { level = 'REVIEW'; reasons.push('no AI confirmation'); }
    else if ((ai.confidence ?? 0) < threshold) { level = 'REVIEW'; reasons.push(`AI confidence ${ai.confidence} < ${threshold}`); }
    const avail = new Set(c.availableKbKeys || []);
    const missing = rule.kbKeys.filter((k) => !avail.has(k));
    if (rule.kbKeys.length === 0 || missing.length === rule.kbKeys.length) {
      level = 'REVIEW'; reasons.push('no verified KB fact for intent');
    }
    if (!c.propertyAutoEnabled) { level = 'REVIEW'; reasons.push('auto-reply disabled for property'); }
  }
  if (level !== rule.level && reasons.length === 0) reasons.push('raised by AI');
  return { level, autoSendAllowed: level === 'AUTO', reasons };
}

// @export-start
if (typeof module !== 'undefined') module.exports = { classifyByRules, combineClassification, IC_LEVEL_ORDER };
// @export-end
