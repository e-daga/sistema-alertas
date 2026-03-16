import AsyncStorage from "@react-native-async-storage/async-storage";

const EXTENDED_FIELDS = ["estado", "municipio", "edad", "genero"];

function buildProfileKey(user = {}) {
  const identity = user?.id || user?.email || user?.google_id;
  return identity ? `@profile:extended:${identity}` : null;
}

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : value;
}

export function hasExtendedProfile(user = {}) {
  const estado = normalizeValue(user?.estado);
  const municipio = normalizeValue(user?.municipio);
  const genero = normalizeValue(user?.genero);
  const edad = Number(user?.edad);

  return Boolean(estado && municipio && genero && Number.isFinite(edad) && edad > 0);
}

export async function loadLocalExtendedProfile(user = {}) {
  const key = buildProfileKey(user);
  if (!key) {
    return {};
  }

  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveLocalExtendedProfile(user = {}, profile = {}) {
  const key = buildProfileKey(user);
  if (!key) {
    return profile;
  }

  const payload = EXTENDED_FIELDS.reduce((acc, field) => {
    const value = profile?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      acc[field] = value;
    }
    return acc;
  }, {});

  await AsyncStorage.setItem(key, JSON.stringify(payload));
  return payload;
}