import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { getAlertEffectiveState } from "../../services/alertState";
import { formatElapsed, getAlertId, resolveAlertCreatedAt } from "../../services/alertUtils";
import { connectSocket, getSocket } from "../../services/socket";

function normalizeAlertsPayload(payload) {
  const list = payload?.alertas || payload?.data || payload;
  return Array.isArray(list) ? list : [];
}

function getStatusText(status) {
  if (status === "confirmando") return "Tu alerta se esta confirmando. Durante los primeros 30 segundos aun puedes cancelarla.";
  if (status === "activa") return "Tu alerta ya esta activa y estamos buscando la unidad mas cercana.";
  if (status === "asignada") return "Una unidad confirmo tu alerta y ya va en camino a tu ubicacion.";
  if (status === "atendiendo") return "La unidad ya se encuentra atendiendo tu emergencia.";
  if (status === "cerrada") return "La alerta fue cerrada correctamente.";
  return "Mantente en calma y permanece en un lugar seguro.";
}

function alertSnapshot(alert, effectiveStatus) {
  return JSON.stringify({
    id: getAlertId(alert),
    estado: alert?.estado || "",
    effectiveStatus: effectiveStatus || getAlertEffectiveState(alert),
    fecha_cierre: alert?.fecha_cierre || "",
    unidadAsignada: alert?.unidadAsignada || alert?.unidad?.codigo || "",
    updatedAt: alert?.updatedAt || alert?.fecha_actualizacion || alert?.fechaActualizacion || "",
  });
}

export default function HelpOnTheWayScreen({ navigation, route }) {
  const { token } = useAuth();
  const initialAlert = route?.params?.alert || {};
  const [alertData, setAlertData] = useState(initialAlert);
  const [status, setStatus] = useState(getAlertEffectiveState(initialAlert));
  const [nowMs, setNowMs] = useState(Date.now());
  const [canceling, setCanceling] = useState(false);

  const handledClosedRef = useRef(false);
  const alertId = getAlertId(alertData);
  const createdAt = useMemo(
    () => resolveAlertCreatedAt(alertData, route?.params?.alert?.fecha_creacion || new Date().toISOString()),
    [alertData, route?.params?.alert?.fecha_creacion],
  );
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdAt.getTime()) / 1000));
  const cancelSecondsLeft = Math.max(0, 30 - elapsedSeconds);
  const canCancel = String(status || "").toLowerCase() === "confirmando" && cancelSecondsLeft > 0;

  const closeFlow = useCallback(
    (nextAlert) => {
      const nextStatus = getAlertEffectiveState(nextAlert);

      if (nextStatus === "cerrada") {
        const closedId = String(getAlertId(nextAlert) || "");
        if (!closedId || handledClosedRef.current) {
          return;
        }

        handledClosedRef.current = true;
        navigation.replace("AlertClosed", { alert: { ...nextAlert, estado: "cerrada" } });
        return;
      }

      if (nextStatus === "cancelada") {
        Alert.alert("Alerta cancelada", "La alerta fue cancelada correctamente.");
        navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
        return;
      }

      if (nextStatus === "expirada") {
        Alert.alert("Alerta finalizada", "La alerta ya no sigue activa.");
        navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
      }
    },
    [navigation],
  );

  const refreshAlert = useCallback(async () => {
    if (!alertId) {
      return;
    }

    try {
      const response = await api.get("/mobile/ciudadano/mis-alertas", {
        params: { pagina: 1, limite: 20 },
      });

      const alerts = normalizeAlertsPayload(response?.data);
      const current = alerts.find((item) => String(getAlertId(item) || "") === String(alertId));

      if (!current) {
        const expiredAlert = { ...alertData, estado: "expirada" };
        setAlertData(expiredAlert);
        setStatus("expirada");
        closeFlow(expiredAlert);
        return;
      }

      const mergedAlert = {
        ...alertData,
        ...current,
      };
      const nextStatus = getAlertEffectiveState(mergedAlert);

      if (alertSnapshot(alertData, status) !== alertSnapshot(mergedAlert, nextStatus)) {
        setAlertData(mergedAlert);
      }
      if (nextStatus !== status) {
        setStatus(nextStatus);
      }

      if (nextStatus === "cerrada" || nextStatus === "cancelada" || nextStatus === "expirada") {
        closeFlow({ ...mergedAlert, estado: nextStatus });
      }
    } catch {
      // Conservamos el ultimo estado local si falla la consulta.
    }
  }, [alertData, alertId, closeFlow, status]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = connectSocket(token);

    const onUpdated = (payload) => {
      const sameAlert = String(payload?.alertaId || payload?.id || "") === String(alertId || "");
      if (!sameAlert) {
        return;
      }

      const nextStatus = payload?.nuevoEstado || payload?.estado;
      if (!nextStatus) {
        return;
      }

      setAlertData((prev) => {
        if (String(prev?.estado || "") === String(nextStatus)) {
          return prev;
        }
        return { ...prev, estado: nextStatus };
      });
      if (nextStatus !== status) {
        setStatus(nextStatus);
      }

      if (nextStatus === "cerrada" || nextStatus === "cancelada") {
        closeFlow({ ...alertData, estado: nextStatus });
      }
    };

    socket.on("alerta-actualizada", onUpdated);

    return () => {
      const current = getSocket();
      current?.off("alerta-actualizada", onUpdated);
    };
  }, [alertData, alertId, closeFlow, status, token]);

  useEffect(() => {
    refreshAlert();
    const interval = setInterval(() => {
      refreshAlert();
    }, 8000);

    return () => clearInterval(interval);
  }, [refreshAlert]);

  const handleCancelAlert = async () => {
    if (!alertId || !canCancel || canceling) {
      return;
    }

    setCanceling(true);
    try {
      await api.patch(`/alertas/${alertId}/cancelar`);
      Alert.alert("Alerta cancelada", "La alerta se cancelo dentro del tiempo permitido.");
      navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
    } catch (error) {
      Alert.alert(
        "No se pudo cancelar",
        error?.response?.data?.error || error?.response?.data?.message || "La alerta ya no puede cancelarse.",
      );
      refreshAlert();
    } finally {
      setCanceling(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>!La ayuda va en camino!</Text>
        <Text style={styles.subtitle}>{getStatusText(status)}</Text>
        <Text style={styles.tip}>Mantente en calma y permanece en un lugar seguro.</Text>
      </View>

      <View style={styles.timerWrap}>
        <Ionicons name="time-outline" size={16} color="#1D4ED8" />
        <Text style={styles.timerText}>Tiempo transcurrido: {formatElapsed(elapsedSeconds)}</Text>
      </View>

      {canCancel ? (
        <View style={styles.cancelCard}>
          <Text style={styles.cancelTitle}>Puedes cancelar esta alerta</Text>
          <Text style={styles.cancelText}>Tiempo restante para cancelar: {cancelSecondsLeft}s</Text>
          <Pressable style={styles.cancelButton} onPress={handleCancelAlert} disabled={canceling}>
            {canceling ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.cancelButtonText}>Cancelar alerta</Text>}
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.primaryButton} onPress={() => navigation.navigate("Dashboard")}>
        <Text style={styles.primaryText}>Volver al inicio</Text>
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
    borderColor: "#22C55E",
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    padding: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1F2937",
    lineHeight: 29,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: "#374151",
  },
  tip: {
    marginTop: 8,
    color: "#374151",
    fontSize: 11,
  },
  timerWrap: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timerText: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 11,
  },
  cancelCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    padding: 12,
  },
  cancelTitle: {
    color: "#9A3412",
    fontWeight: "800",
    fontSize: 14,
  },
  cancelText: {
    marginTop: 6,
    color: "#9A3412",
    fontSize: 12,
  },
  cancelButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
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
    fontSize: 14,
  },
});
