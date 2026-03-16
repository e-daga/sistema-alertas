const FINAL_STATES = new Set(["cerrada", "cancelada", "expirada"]);
const ACTIVE_ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const ASSIGNED_ALERT_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeState(value) {
  return String(value || "").toLowerCase().trim();
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAlertCreatedAt(alert) {
  return parseDateValue(
    alert?.fecha_creacion ||
      alert?.created_at ||
      alert?.createdAt ||
      alert?.fecha ||
      alert?.timestamp,
  );
}

export function getAlertAssignedAt(alert) {
  return parseDateValue(alert?.fecha_asignacion || alert?.assigned_at || alert?.assignedAt);
}

export function getAlertEffectiveState(alert, now = new Date()) {
  const rawState = normalizeState(alert?.estado);

  if (FINAL_STATES.has(rawState) || alert?.expirada === true || alert?.fecha_expiracion) {
    return rawState || "expirada";
  }

  const createdAt = getAlertCreatedAt(alert);
  const assignedAt = getAlertAssignedAt(alert);
  const ageMs = createdAt ? now.getTime() - createdAt.getTime() : 0;
  const assignedAgeMs = assignedAt ? now.getTime() - assignedAt.getTime() : ageMs;

  if ((rawState === "confirmando" || rawState === "activa") && ageMs >= ACTIVE_ALERT_TTL_MS) {
    return "expirada";
  }

  if ((rawState === "asignada" || rawState === "atendiendo") && assignedAgeMs >= ASSIGNED_ALERT_TTL_MS) {
    return "expirada";
  }

  return rawState || "confirmando";
}

export function isAlertFinalForClient(alert, now = new Date()) {
  return FINAL_STATES.has(getAlertEffectiveState(alert, now));
}
