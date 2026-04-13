import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { getAlertEffectiveState, isAlertFinalForClient } from "../../services/alertState";
import { getCurrentLocation } from "../../services/location";
import { getAlertId } from "../../services/alertUtils";
import HamburgerMenu from "../../components/HamburgerMenu";

function isNetworkError(error) {
  const code = String(error?.code || "").toUpperCase();
  return !error?.response || code === "ERR_NETWORK" || code === "ECONNABORTED" || String(error?.message || "") === "Network Error";
}

function extractApiMessage(error) {
  const data = error?.response?.data;
  return data?.message || data?.error || error?.message || "No se pudo crear la alerta";
}

function normalizeAlertsPayload(payload) {
  const list = payload?.alertas || payload?.data || payload;
  return Array.isArray(list) ? list : [];
}

function getCitizenStatusLabel(state) {
  const normalized = String(state || "").toLowerCase();
  if (normalized === "confirmando") return "En confirmacion";
  if (normalized === "activa") return "Buscando unidad";
  if (normalized === "asignada") return "Ayuda en camino";
  if (normalized === "atendiendo") return "Unidad atendiendo";
  if (normalized === "cerrada") return "Cerrada";
  if (normalized === "cancelada") return "Cancelada";
  if (normalized === "expirada") return "Expirada";
  return "En proceso";
}

export default function DashboardScreen({ navigation, route }) {
  const { user, logout } = useAuth();
  const [creatingType, setCreatingType] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [checkingAlertState, setCheckingAlertState] = useState(true);

  const activeAlertRef = useRef(null);
  const lastClosedAlertIdRef = useRef("");

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  const handleClosedAlert = useCallback(
    (closedAlert) => {
      const id = String(getAlertId(closedAlert) || "");
      if (!id || lastClosedAlertIdRef.current === id) {
        return;
      }

      lastClosedAlertIdRef.current = id;
      setActiveAlert(null);
      navigation.navigate("AlertClosed", { alert: closedAlert });
    },
    [navigation],
  );

  const refreshCitizenAlertState = useCallback(async () => {
    try {
      const response = await api.get("/mobile/ciudadano/mis-alertas", {
        params: { pagina: 1, limite: 20 },
      });

      const alerts = normalizeAlertsPayload(response?.data);
      const trackedId = getAlertId(activeAlertRef.current);

      if (trackedId) {
        const tracked = alerts.find((item) => String(getAlertId(item) || "") === String(trackedId));
        if (tracked) {
          const trackedState = getAlertEffectiveState(tracked);
          if (isAlertFinalForClient(tracked)) {
            if (trackedState === "cerrada") {
              handleClosedAlert(tracked);
            } else {
              setActiveAlert(null);
            }
          } else {
            setActiveAlert(tracked);
          }
          return;
        }
      }

      const foundActive = alerts.find((item) => !isAlertFinalForClient(item));
      setActiveAlert(foundActive || null);
    } catch {
      // Si falla consulta, conservamos estado local actual.
    } finally {
      setCheckingAlertState(false);
    }
  }, [handleClosedAlert]);

  useFocusEffect(
    useCallback(() => {
      refreshCitizenAlertState();
    }, [refreshCitizenAlertState]),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      refreshCitizenAlertState();
    }, 12000);

    return () => clearInterval(interval);
  }, [refreshCitizenAlertState]);

  useEffect(() => {
    const createdAlert = route?.params?.createdAlert;
    if (!createdAlert) {
      return;
    }

    setActiveAlert(createdAlert);
    navigation.setParams({ createdAlert: undefined });
  }, [navigation, route?.params?.createdAlert]);

  const menuItems = useMemo(
    () => [
      {
        key: "profile",
        label: "Mi perfil",
        icon: "person-outline",
        onPress: () => navigation.navigate("Perfil"),
      },
      {
        key: "history",
        label: "Ver historial",
        icon: "time-outline",
        onPress: () => navigation.navigate("Historial"),
      },
      {
        key: "logout",
        label: "Cerrar sesion",
        icon: "log-out-outline",
        color: "#DC2626",
        onPress: logout,
      },
    ],
    [logout, navigation],
  );

  const hasActiveAlert = Boolean(activeAlert && !isAlertFinalForClient(activeAlert));

  const createAlert = async (tipo) => {
    if (hasActiveAlert) {
      Alert.alert("Alerta en curso", "Ya tienes una alerta activa. Espera a que termine para crear otra.");
      return;
    }

    let requestedLocation = null;
    const localCreatedAt = new Date().toISOString();

    try {
      setCreatingType(tipo);
      requestedLocation = await getCurrentLocation();

      const payload = {
        tipo,
        lat: Number(requestedLocation.lat),
        lng: Number(requestedLocation.lng),
      };

      const response = await api.post("/alertas", payload);
      const alertPayload = response?.data?.alerta || response?.data || {};
      const nextAlert = {
        ...alertPayload,
        tipo,
        lat: payload.lat,
        lng: payload.lng,
        fecha_creacion: alertPayload?.fecha_creacion || localCreatedAt,
        local_created_at: localCreatedAt,
      };

      setActiveAlert(nextAlert);
      Alert.alert("Alerta enviada", "Tu alerta ya fue enviada correctamente.");
    } catch (error) {
      if (isNetworkError(error)) {
        navigation.navigate("AlertCreated", {
          mode: "pending",
          pendingAlert: {
            tipo,
            lat: Number(requestedLocation?.lat),
            lng: Number(requestedLocation?.lng),
            createdAt: localCreatedAt,
          },
          fallbackLocationRequest: true,
          fallbackTipo: tipo,
          autoReturn: true,
        });
      } else {
        Alert.alert("Error", extractApiMessage(error));
      }
    } finally {
      setCreatingType("");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Pressable style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={23} color="#111827" />
        </Pressable>

        <View style={styles.topbarBrand}>
          <Ionicons name="shield-outline" size={18} color="#1D4ED8" />
          <Text style={styles.topbarText}>Sistema de Alertas</Text>
        </View>
      </View>

      <Text style={styles.welcome}>Bienvenido, {user?.nombre || "Usuario"}</Text>
      <Text style={styles.caption}>En caso de emergencia presiona un boton</Text>

      {hasActiveAlert ? (
        <View style={styles.activeAlertCard}>
          <View style={styles.activeAlertHeader}>
            <Ionicons name="notifications-outline" size={18} color="#1D4ED8" />
            <Text style={styles.activeAlertTitle}>Alerta en curso</Text>
          </View>
          <Text style={styles.activeAlertText}>Estado: {getCitizenStatusLabel(getAlertEffectiveState(activeAlert))}</Text>
          <Text style={styles.activeAlertHint}>Si aun esta en confirmacion, podras cancelarla desde seguimiento durante los primeros 30 segundos.</Text>
          <Pressable style={styles.activeAlertButton} onPress={() => navigation.navigate("HelpOnTheWay", { alert: activeAlert })}>
            <Text style={styles.activeAlertButtonText}>Ver seguimiento</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.card, styles.blueCard, hasActiveAlert && styles.disabledCard]}>
        <View style={[styles.iconCircle, styles.blueCircle]}>
          <Ionicons name="alert-circle-outline" size={30} color="#FFFFFF" />
        </View>
        <Text style={styles.cardTitle}>Boton de Panico</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => createAlert("panico")}
          disabled={creatingType === "panico" || hasActiveAlert || checkingAlertState}
        >
          {creatingType === "panico" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="shield-outline" size={14} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Pedir Patrulla</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={[styles.card, styles.redCard, hasActiveAlert && styles.disabledCard]}>
        <View style={[styles.iconCircle, styles.redCircle]}>
          <Ionicons name="heart-outline" size={30} color="#FFFFFF" />
        </View>
        <Text style={styles.cardTitle}>Emergencia Medica</Text>
        <Pressable
          style={[styles.primaryButton, styles.redButton]}
          onPress={() => createAlert("medica")}
          disabled={creatingType === "medica" || hasActiveAlert || checkingAlertState}
        >
          {creatingType === "medica" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="heart-outline" size={14} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Pedir Ambulancia</Text>
            </>
          )}
        </Pressable>
      </View>

      <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} title="Menu ciudadano" items={menuItems} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF0F4",
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  topbar: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  menuButton: {
    position: "absolute",
    left: 0,
    top: 2,
    padding: 2,
  },
  topbarBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topbarText: {
    fontWeight: "700",
    color: "#111827",
    fontSize: 13,
  },
  welcome: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 30,
  },
  caption: {
    marginTop: 2,
    color: "#6B7280",
    fontSize: 14,
  },
  activeAlertCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
    padding: 12,
  },
  activeAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeAlertTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E3A8A",
  },
  activeAlertText: {
    marginTop: 4,
    color: "#1E3A8A",
    fontSize: 13,
  },
  activeAlertHint: {
    marginTop: 6,
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
  activeAlertButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  activeAlertButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  card: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  disabledCard: {
    opacity: 0.55,
  },
  blueCard: {
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  redCard: {
    borderWidth: 1,
    borderColor: "#F97316",
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  blueCircle: { backgroundColor: "#1D4ED8" },
  redCircle: { backgroundColor: "#EF233C" },
  cardTitle: {
    fontWeight: "700",
    fontSize: 20,
    color: "#111827",
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: "#1D4ED8",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  redButton: {
    backgroundColor: "#EF233C",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});