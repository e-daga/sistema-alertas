import { getAlertCreatedAt } from "./alertState";
import { getAgeRangeLabel, getAgeNumber } from "./profileCatalogs";

// Grupos etarios con nombres claros para el panel de policia/paramedico
const AGE_GROUPS = [
  { min: 0,  max: 11,  label: "Nino/a" },
  { min: 12, max: 17,  label: "Adolescente" },
  { min: 18, max: 29,  label: "Adulto joven" },
  { min: 30, max: 45,  label: "Adulto" },
  { min: 46, max: 64,  label: "Adulto mayor" },
  { min: 65, max: 999, label: "Adulto mayor (65+)" },
];

function ageGroupLabel(numericAge) {
  if (!numericAge || !Number.isFinite(numericAge) || numericAge <= 0) {
    return null;
  }
  const group = AGE_GROUPS.find((g) => numericAge >= g.min && numericAge <= g.max);
  return group ? group.label : null;
}


const REPORT_TYPE_PATTERN = /^\[Tipo atendido:\s*(.+?)\]\s*(?:\r?\n\r?\n)?([\s\S]*)$/i;

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseReportValue(value) {
  if (typeof value !== "string") {
    return { reportType: "", description: "" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { reportType: "", description: "" };
  }

  const match = trimmed.match(REPORT_TYPE_PATTERN);
  if (!match) {
    return { reportType: "", description: trimmed };
  }

  return {
    reportType: match[1]?.trim() || "",
    description: match[2]?.trim() || "",
  };
}

function findReportDescriptionValue(alert) {
  const reportCandidates = [];

  if (Array.isArray(alert?.Reportes)) reportCandidates.push(...alert.Reportes);
  if (Array.isArray(alert?.reportes)) reportCandidates.push(...alert.reportes);
  if (alert?.Reporte) reportCandidates.push(alert.Reporte);
  if (alert?.reporte) reportCandidates.push(alert.reporte);

  const found = reportCandidates.find((item) => typeof item?.descripcion === "string" && item.descripcion.trim());
  if (found?.descripcion) {
    return found.descripcion.trim();
  }

  if (typeof alert?.descripcion_reporte === "string" && alert.descripcion_reporte.trim()) {
    return alert.descripcion_reporte.trim();
  }

  return "";
}

function findReportCandidates(alert) {
  const reportCandidates = [];

  if (Array.isArray(alert?.Reportes)) reportCandidates.push(...alert.Reportes);
  if (Array.isArray(alert?.reportes)) reportCandidates.push(...alert.reportes);
  if (alert?.Reporte) reportCandidates.push(alert.Reporte);
  if (alert?.reporte) reportCandidates.push(alert.reporte);

  return reportCandidates.filter(Boolean);
}

function findCitizenCandidate(alert) {
  const candidates = [
    alert?.ciudadano,
    alert?.ciudadano_data,
    alert?.usuario,
    alert?.user,
    alert?.solicitante,
    alert?.data?.ciudadano,
    alert?.data?.usuario,
    alert?.payload?.ciudadano,
    alert?.payload?.usuario,
  ];

  return candidates.find((item) => item && typeof item === "object") || null;
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getAlertId(alert) {
  return alert?.id || alert?._id || null;
}

export function getNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function extractLatLng(alert) {
  const directLat = getNumeric(alert?.lat ?? alert?.latitude ?? alert?.dataValues?.lat);
  const directLng = getNumeric(alert?.lng ?? alert?.longitude ?? alert?.dataValues?.lng);
  if (directLat !== null && directLng !== null) {
    return { lat: directLat, lng: directLng };
  }

  const coords = alert?.ubicacion?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = getNumeric(coords[0]);
    const lat = getNumeric(coords[1]);
    if (lat !== null && lng !== null) {
      return { lat, lng };
    }
  }

  return null;
}

export function alertLocationText(alert) {
  if (typeof alert?.direccion === "string" && alert.direccion.trim()) {
    return alert.direccion.trim();
  }

  const coords = extractLatLng(alert);
  if (coords) {
    return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
  }

  return "Direccion no disponible";
}

export function citizenName(alert) {
  const citizen = findCitizenCandidate(alert);
  return (typeof alert?.ciudadano === "string" ? alert?.ciudadano : citizen?.nombre) || "Sin nombre";
}

export function citizenPhone(alert) {
  const citizen = findCitizenCandidate(alert);
  return citizen?.telefono || alert?.telefono_ciudadano || alert?.telefono || "Sin telefono";
}

export function citizenAgeText(alert) {
  const citizen = findCitizenCandidate(alert);
  const directAgeValue =
    citizen?.edad ??
    alert?.edad ??
    alert?.edad_ciudadano ??
    alert?.ciudadano_edad ??
    alert?.citizen_age;
  const directAgeText =
    citizen?.edad_texto ||
    alert?.edad_texto ||
    alert?.edad_rango ||
    alert?.rango_edad ||
    alert?.ciudadano_edad_texto;
  const ageText = getAgeRangeLabel(directAgeValue, directAgeText);
  if (ageText) {
    // Convertir el rango textual a numero para obtener el grupo
    const numeric = getAgeNumber(ageText) || getAgeNumber(directAgeValue);
    return ageGroupLabel(numeric) || ageText;
  }

  const directAge = directAgeValue;
  if (directAge !== undefined && directAge !== null && String(directAge).trim()) {
    const numericAge = Number(directAge);
    if (Number.isFinite(numericAge) && numericAge > 0) {
      return ageGroupLabel(numericAge) || `${numericAge} anios`;
    }

    return String(directAge).trim();
  }

  const birthDate = parseDateValue(
    citizen?.fecha_nacimiento ||
      alert?.fecha_nacimiento ||
      alert?.birth_date ||
      alert?.ciudadano_fecha_nacimiento,
  );
  if (!birthDate) {
    return "No disponible";
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  const dayDiff = now.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? `${age} anios` : "No disponible";
}

export function getAlertReportType(alert) {
  const typedReport = findReportCandidates(alert).find(
    (item) => typeof item?.tipo_incidente === "string" && item.tipo_incidente.trim(),
  );
  if (typedReport?.tipo_incidente) {
    return typedReport.tipo_incidente.trim();
  }

  if (typeof alert?.tipo_incidente === "string" && alert.tipo_incidente.trim()) {
    return alert.tipo_incidente.trim();
  }

  return parseReportValue(findReportDescriptionValue(alert)).reportType;
}

export function getAlertReportDescription(alert) {
  const source = findReportDescriptionValue(alert);
  const parsed = parseReportValue(source);
  return parsed.description || source;
}

export function composeReportDescription(description, reportType) {
  const cleanDescription = String(description || "").trim();
  const cleanReportType = String(reportType || "").trim();

  if (!cleanReportType) {
    return cleanDescription;
  }

  if (!cleanDescription) {
    return `[Tipo atendido: ${cleanReportType}]`;
  }

  return `[Tipo atendido: ${cleanReportType}]\n\n${cleanDescription}`;
}

export function formatDateTime(value) {
  const date = parseDateValue(value);
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatElapsed(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const parts = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0"));
  return parts.join(":");
}

export function resolveAlertCreatedAt(alert, fallbackValue = null) {
  return getAlertCreatedAt(alert) || parseDateValue(alert?.local_created_at) || parseDateValue(fallbackValue) || new Date();
}
