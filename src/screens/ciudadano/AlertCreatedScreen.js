import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import api from "../../services/api";
import { isAlertFinalForClient } from "../../services/alertState";

function normalizeAlertsPayload(payload) {
  const list = payload?.alertas || payload?.data || payload;
  return Array.isArray(list) ? list : [];
}

function isNetworkError(error) {
  const code = String(error?.code || "").toUpperCase();
  return !error?.response || code === "ERR_NETWORK" || code === "ECONNABORTED" || String(error?.message || "") === "Network Error";
}

function getApiMessage(error, fallback) {
  const data = error?.response?.data;
  return data?.message || data?.error || error?.message || fallback;
}

export default function AlertCreatedScreen({ navigation, route }) {
  const mode = route?.params?.mode === "pending" ? "pending" : "sent";
  const pendingAlert = route?.params?.pendingAlert || {};
  const [sending, setSending] = useState(mode === "pending");
  const [statusMessage, setStatusMessage] = useState("");

  const finishedRef = useRef(false);
  const inFlightRef = useRef(false);

  const goToDashboard = useCallback(
    (alertPayload) => {
      if (finishedRef.current) {
        return;
      }

      finishedRef.current = true;
      const dashboardRoute = { name: "Dashboard" };
      if (alertPayload) {
        dashboardRoute.params = { createdAlert: alertPayload };
      }

      navigation.reset({
        index: 0,
        routes: [dashboardRoute],
      });
    },
    [navigation],
  );

  const syncPendingAlert = useCallback(async () => {
    if (mode !== "pending" || inFlightRef.current || finishedRef.current) {
      return;
    }

    inFlightRef.current = true;
    setSending(true);

    try {
      const historyResponse = await api.get("/mobile/ciudadano/mis-alertas", {
        params: { pagina: 1, limite: 20 },
      });

      const historyAlerts = normalizeAlertsPayload(historyResponse?.data);
      const activeAlert = historyAlerts.find((item) => !isAlertFinalForClient(item));

      if (activeAlert) {
        setStatusMessage("Tu alerta ya fue registrada. Redirigiendo al inicio...");
        goToDashboard(activeAlert);
        return;
      }

      const lat = Number(pendingAlert?.lat);
      const lng = Number(pendingAlert?.lng);
      if (!pendingAlert?.tipo || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatusMessage("No se pudo recuperar la ubicacion para reenviar la alerta.");
        return;
      }

      const response = await api.post("/alertas", {
        tipo: pendingAlert.tipo,
        lat,
        lng,
      });

      const createdAlert = response?.data?.alerta || response?.data || {};
      setStatusMessage("Alerta enviada correctamente. Redirigiendo al inicio...");
      goToDashboard({
        ...createdAlert,
        tipo: pendingAlert.tipo,
        lat,
        lng,
        fecha_creacion: createdAlert?.fecha_creacion || pendingAlert?.createdAt || new Date().toISOString(),
        local_created_at: pendingAlert?.createdAt || new Date().toISOString(),
      });
    } catch (error) {
      if (!isNetworkError(error)) {
        setStatusMessage(getApiMessage(error, "No se pudo reenviar la alerta automaticamente."));
      } else {
        setStatusMessage("Sin conexion por ahora. En cuanto regresen tus datos o wifi, se enviara automaticamente.");
      }
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }, [goToDashboard, mode, pendingAlert?.createdAt, pendingAlert?.lat, pendingAlert?.lng, pendingAlert?.tipo]);

  useEffect(() => {
    if (mode !== "pending") {
      return;
    }

    syncPendingAlert();
    const interval = setInterval(() => {
      syncPendingAlert();
    }, 8000);

    return () => clearInterval(interval);
  }, [mode, syncPendingAlert]);

  const title = useMemo(() => {
    if (mode === "pending") {
      return "!Alerta en espera de envio!";
    }

    return "!Alerta enviada!";
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === "pending") {
      return "No hay conexion estable. En cuanto te conectes a wifi o datos moviles, enviaremos la alerta automaticamente.";
    }

    return "Tu alerta ya fue enviada correctamente a los servicios de emergencia.";
  }, [mode]);

  return (
    <View style={styles.container}>
      <View style={[styles.card, mode === "pending" ? styles.warningCard : styles.successCard]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {mode === "pending" ? (
          <View style={styles.statusRow}>
            {sending ? <ActivityIndicator color="#1D4ED8" /> : null}
            <Text style={styles.statusText}>{statusMessage || "Estamos reintentando el envio automaticamente."}</Text>
          </View>
        ) : null}
      </View>

      {mode === "pending" ? (
        <Pressable style={styles.secondaryButton} onPress={syncPendingAlert} disabled={sending}>
          <Text style={styles.secondaryText}>{sending ? "Reintentando..." : "Reintentar ahora"}</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.primaryButton} onPress={() => goToDashboard(null)}>
        <Text style={styles.primaryText}>Ir al inicio</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECEEF3",
    padding: 16,
    paddingTop: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  successCard: {
    borderColor: "#22C55E",
    backgroundColor: "#ECFDF5",
  },
  warningCard: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1F2937",
    lineHeight: 29,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: "#374151",
  },
  statusRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    flex: 1,
    color: "#1E3A8A",
    fontSize: 12,
    lineHeight: 16,
  },
  primaryButton: {
    marginTop: 18,
    alignSelf: "center",
    borderRadius: 8,
    backgroundColor: "#1D4ED8",
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  secondaryButton: {
    marginTop: 10,
    alignSelf: "center",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1D4ED8",
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  secondaryText: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 12,
  },
});