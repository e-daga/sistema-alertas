import MUNICIPALITIES_CATALOG from "../constants/municipalitiesCatalog.json";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const STATE_ALIAS_MAP = {
  mexico: "Estado de Mexico",
  "estado de mexico": "Estado de Mexico",
  "ciudad de mexico": "Ciudad de Mexico",
  cdmx: "Ciudad de Mexico",
  coahuila: "Coahuila",
  michoacan: "Michoacan",
  queretaro: "Queretaro",
  yucatan: "Yucatan",
  "nuevo leon": "Nuevo Leon",
  nuevoleon: "Nuevo Leon",
  sanluispotosi: "San Luis Potosi",
};

export const STATE_OPTIONS = Object.keys(MUNICIPALITIES_CATALOG).sort((a, b) => a.localeCompare(b, "es-MX"));
export const GENDER_OPTIONS = ["Femenino", "Masculino"];

const MIN_AGE_OPTION = 12;
const MAX_AGE_OPTION = 100;

export const AGE_OPTIONS = Array.from(
  { length: MAX_AGE_OPTION - MIN_AGE_OPTION + 1 },
  (_, index) => String(index + MIN_AGE_OPTION),
);
export const AGE_GROUP_TO_NUMBER = {
  "Menor de 18 anios": 17,
  "18 a 25 anios": 21,
  "26 a 35 anios": 30,
  "36 a 45 anios": 40,
  "46 a 55 anios": 50,
  "56 a 65 anios": 60,
  "Mayor de 65 anios": 70,
};
const LEGACY_AGE_LABELS = {
  "Menor de 18 a??os": "Menor de 18 anios",
  "18 a 25 a??os": "18 a 25 anios",
  "26 a 35 a??os": "26 a 35 anios",
  "36 a 45 a??os": "36 a 45 anios",
  "46 a 55 a??os": "46 a 55 anios",
  "56 a 65 a??os": "56 a 65 anios",
  "Mayor de 65 a??os": "Mayor de 65 anios",
};
const AGE_RANGE_LOOKUP = [
  { label: "Menor de 18 anios", min: 0, max: 17 },
  { label: "18 a 25 anios", min: 18, max: 25 },
  { label: "26 a 35 anios", min: 26, max: 35 },
  { label: "36 a 45 anios", min: 36, max: 45 },
  { label: "46 a 55 anios", min: 46, max: 55 },
  { label: "56 a 65 anios", min: 56, max: 65 },
  { label: "Mayor de 65 anios", min: 66, max: 120 },
];

export const MUNICIPALITIES_BY_STATE = MUNICIPALITIES_CATALOG;

export function resolveStateOption(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  if (MUNICIPALITIES_BY_STATE[rawValue]) {
    return rawValue;
  }

  const normalized = normalizeText(rawValue);
  const aliasMatch = STATE_ALIAS_MAP[normalized];
  if (aliasMatch && MUNICIPALITIES_BY_STATE[aliasMatch]) {
    return aliasMatch;
  }

  const directMatch = STATE_OPTIONS.find((option) => normalizeText(option) === normalized);
  return directMatch || rawValue;
}

export function normalizeAgeLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(AGE_GROUP_TO_NUMBER, text)) {
    return text;
  }

  const lower = text.toLowerCase();
  if (lower.includes("menor de 18")) return "Menor de 18 anios";
  if (lower.includes("18 a 25")) return "18 a 25 anios";
  if (lower.includes("26 a 35")) return "26 a 35 anios";
  if (lower.includes("36 a 45")) return "36 a 45 anios";
  if (lower.includes("46 a 55")) return "46 a 55 anios";
  if (lower.includes("56 a 65")) return "56 a 65 anios";
  if (lower.includes("mayor de 65")) return "Mayor de 65 anios";

  return LEGACY_AGE_LABELS[text] || "";
}

export function getAgeNumber(value) {
  const normalized = normalizeAgeLabel(value);
  if (normalized) {
    return AGE_GROUP_TO_NUMBER[normalized] || null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function getAgeRangeLabel(ageValue, ageText = "") {
  const normalizedText = normalizeAgeLabel(ageText);
  if (normalizedText) {
    return normalizedText;
  }

  const numeric = getAgeNumber(ageValue);
  if (!numeric) {
    return "";
  }

  return AGE_RANGE_LOOKUP.find((range) => numeric >= range.min && numeric <= range.max)?.label || "";
}

export function getAgeSelectionValue(ageValue, ageText = "") {
  const numeric = getAgeNumber(ageValue);
  if (numeric) {
    return String(numeric);
  }

  const normalizedText = normalizeAgeLabel(ageText);
  if (normalizedText) {
    const numericFromText = AGE_GROUP_TO_NUMBER[normalizedText];
    return numericFromText ? String(numericFromText) : "";
  }

  return "";
}

export function getMunicipalityOptions(state) {
  const canonicalState = resolveStateOption(state);
  return MUNICIPALITIES_BY_STATE[canonicalState] || [];
}

export function searchOptions(options = [], query = "") {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => normalizeText(option).includes(normalizedQuery));
}
