import api from "./api";

function getNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.alertas,
    payload.data,
    payload.data?.alertas,
    payload.data?.data,
    payload.results,
    payload.items,
    payload.rows,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function parsePointText(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/POINT\s*\(\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s*\)/i);
  if (!match) return null;

  const lng = getNumeric(match[1]);
  const lat = getNumeric(match[3]);
  if (lat === null || lng === null) return null;

  return { lat, lng };
}

function normalizeActiveAlerts(payload) {
  const list = extractList(payload);
  return list.map((item) => ({
    ...item,
    source: "activas",
    estado: item?.estado || "activa",
  }));
}

function coordKey(coord) {
  return `${coord.lat.toFixed(6)}|${coord.lng.toFixed(6)}`;
}

function buildCoordCandidates(primaryCoords) {
  const candidates = [];

  const pushIfValid = (lat, lng) => {
    const nLat = getNumeric(lat);
    const nLng = getNumeric(lng);
    if (nLat === null || nLng === null) return;
    if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return;
    candidates.push({ lat: nLat, lng: nLng });
  };

  if (primaryCoords) {
    pushIfValid(primaryCoords.lat, primaryCoords.lng);
    pushIfValid(primaryCoords.lng, primaryCoords.lat);
  }

  return candidates;
}

function extractCoverageRadius(data) {
  const candidates = [
    data?.radio_cobertura,
    data?.radio,
    data?.municipio?.radio_cobertura,
    data?.municipio?.radio,
    data?.municipio_radio,
  ];

  for (const candidate of candidates) {
    const numeric = getNumeric(candidate);
    if (numeric !== null && numeric > 0) {
      return numeric;
    }
  }

  return null;
}

async function fetchUnitContext() {
  try {
    const response = await api.get("/mobile/unidades/mi-unidad");
    const data = response?.data?.data || {};

    const coordCandidates = buildCoordCandidates({
      lat: data?.lat,
      lng: data?.lng,
    });

    const coords = data?.ubicacion?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      coordCandidates.push(...buildCoordCandidates({ lat: coords[1], lng: coords[0] }));
    }

    const pointText = parsePointText(data?.ubicacion);
    if (pointText) {
      coordCandidates.push(...buildCoordCandidates(pointText));
    }

    return {
      coordCandidates,
      coverageRadius: extractCoverageRadius(data),
    };
  } catch {
    return {
      coordCandidates: [],
      coverageRadius: null,
    };
  }
}

async function queryNearbyByPath(path, coord, radio) {
  try {
    const response = await api.get(path, {
      params: {
        lat: coord.lat,
        lng: coord.lng,
        radio,
      },
    });

    return {
      ok: true,
      path,
      alerts: normalizeActiveAlerts(response?.data),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      path,
      alerts: [],
      error,
    };
  }
}

export async function fetchNearbyAlertsRobust(primaryCoords, options = {}) {
  const unitContext = await fetchUnitContext();
  const allCandidatesRaw = [...buildCoordCandidates(primaryCoords), ...unitContext.coordCandidates];

  const unique = new Map();
  allCandidatesRaw.forEach((coord) => {
    unique.set(coordKey(coord), coord);
  });

  const candidates = [...unique.values()];
  const baseRadio = getNumeric(options?.baseRadio) || unitContext.coverageRadius || 25;
  const radioCandidates = [baseRadio, 35, 50].filter((value, index, array) => array.indexOf(value) === index);
  let lastError = null;
  let lastAttempt = null;
  const attempts = [];

  if (candidates.length === 0) {
    const noCoordsError = new Error("NO_COORDS_AVAILABLE");
    return {
      alerts: [],
      usedCoords: null,
      usedRadio: null,
      usedPath: null,
      error: noCoordsError,
      attempts,
      coverageRadius: baseRadio,
    };
  }

  for (const coord of candidates) {
    for (const radio of radioCandidates) {
      const primary = await queryNearbyByPath("/alertas/activas", coord, radio);
      const primaryAttempt = {
        ok: primary.ok,
        path: primary.path,
        radio,
        lat: coord.lat,
        lng: coord.lng,
        count: primary.alerts.length,
        status: primary.error?.response?.status || 200,
      };
      attempts.push(primaryAttempt);
      lastAttempt = primaryAttempt;

      if (primary.ok) {
        if (primary.alerts.length > 0) {
          return {
            alerts: primary.alerts,
            usedCoords: coord,
            usedRadio: radio,
            usedPath: primary.path,
            error: null,
            attempts,
            coverageRadius: baseRadio,
          };
        }
        continue;
      }

      lastError = primary.error;

      if (primary.error?.response?.status === 404) {
        const fallback = await queryNearbyByPath("/mobile/alertas/activas", coord, radio);
        const fallbackAttempt = {
          ok: fallback.ok,
          path: fallback.path,
          radio,
          lat: coord.lat,
          lng: coord.lng,
          count: fallback.alerts.length,
          status: fallback.error?.response?.status || 200,
        };
        attempts.push(fallbackAttempt);
        lastAttempt = fallbackAttempt;

        if (fallback.ok) {
          if (fallback.alerts.length > 0) {
            return {
              alerts: fallback.alerts,
              usedCoords: coord,
              usedRadio: radio,
              usedPath: fallback.path,
              error: null,
              attempts,
              coverageRadius: baseRadio,
            };
          }

          continue;
        }

        lastError = fallback.error || lastError;
      }
    }
  }

  return {
    alerts: [],
    usedCoords: lastAttempt ? { lat: lastAttempt.lat, lng: lastAttempt.lng } : candidates[0] || null,
    usedRadio: lastAttempt?.radio || null,
    usedPath: lastAttempt?.path || null,
    error: lastError,
    attempts,
    coverageRadius: baseRadio,
  };
}

export function normalizeMyAlerts(payload) {
  const list = extractList(payload);
  return list.map((item) => ({ ...item, source: "mias" }));
}

export function mergeAlerts(activeAlerts, myAlerts) {
  const map = new Map();

  [...activeAlerts, ...myAlerts].forEach((item) => {
    const id = String(item?.id || item?._id || "");
    if (!id) return;
    map.set(id, item);
  });

  return [...map.values()];
}