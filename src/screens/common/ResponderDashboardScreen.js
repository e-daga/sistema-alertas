import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import api from "../../services/api";
import { getCurrentLocation, startLocationUpdates } from "../../services/location";
import { useAuth } from "../../context/AuthContext";
import { useNotificationCenter } from "../../context/NotificationCenterContext";
import { fetchNearbyAlertsRobust, mergeAlerts, normalizeMyAlerts } from "../../services/activeAlerts";
import { alertLocationText, citizenAgeText, citizenName, citizenPhone, getAlertId } from "../../services/alertUtils";
import { getResponderUi } from "../../services/responderUi";
import HamburgerMenu from "../../components/HamburgerMenu";

function isAlertAssignedToMe(alerta) {
  return (
    alerta?.source === "mias" ||
    alerta?.unidad_id ||
    alerta?.estado === "asignada" ||
    alerta?.estado === "atendiendo"
  );
}

function isResponderFinalState(alerta) {
  const state = String(alerta?.estado || "").toLowerCase();
  return state === "cerrada" || state === "cancelada" || state === "expirada";
}

function getStatusBadgeColor(alerta, ui) {
  const state = String(alerta?.estado || "").toLowerCase();
  if (state === "atendiendo") return "#F97316";
  if (state === "cerrada") return "#22C55E";
  return ui.badgeColor;
}

export default function ResponderDashboardScreen({ navigation, variant = "policia" }) {
  const ui = getResponderUi(variant);
  const { logout } = useAuth();
  const { addNotification, unreadCount } = useNotificationCenter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [available, setAvailable] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [unitLocation, setUnitLocation] = useState(null);
  const [coverageRadius, setCoverageRadius] = useState(25);

  const hasLoadedOnceRef = useRef(false);
  const notificationsPrimedRef = useRef(false);
  const previousAlertIdsRef = useRef(new Set());

  const menuItems = useMemo(
    () => [
      {
        key: "profile",
        label: "Mi perfil",
        icon: "person-outline",
        onPress: () => navigation.navigate(ui.profileScreen),
      },
      {
        key: "history",
        label: "Historial",
        icon: "time-outline",
        onPress: () => navigation.navigate(ui.historyScreen),
      },
      {
        key: "logout",
        label: "Cerrar sesion",
        icon: "log-out-outline",
        color: "#DC2626",
        onPress: logout,
      },
    ],
    [logout, navigation, ui.historyScreen, ui.profileScreen],
  );

  const pendingAlerts = useMemo(() => {
    return alerts
      .filter((item) => ui.filterAlert(item) && !isResponderFinalState(item))
      .sort((a, b) => Number(isAlertAssignedToMe(b)) - Number(isAlertAssignedToMe(a)));
  }, [alerts, ui]);

  const activeCount = pendingAlerts.filter((item) => item?.estado === "atendiendo").length;
  const waitingCount = pendingAlerts.filter((item) => item?.estado !== "atendiendo").length;
  const closedCount = alerts.filter((item) => String(item?.estado || "").toLowerCase() === "cerrada").length;

  const ensureLocation = useCallback(async () => {
    if (unitLocation?.lat && unitLocation?.lng) {
      return unitLocation;
    }

    const coords = await getCurrentLocation();
    setUnitLocation(coords);
    return coords;
  }, [unitLocation]);

  const announceNewAlerts = useCallback(
    (nextAlerts) => {
      const nextIds = new Set();

      nextAlerts.forEach((alerta) => {
        const id = String(getAlertId(alerta) || "");
        if (!id) {
          return;
        }

        nextIds.add(id);

        if (!notificationsPrimedRef.current || previousAlertIdsRef.current.has(id) || !ui.filterAlert(alerta) || isResponderFinalState(alerta)) {
          return;
        }

        const assigned = isAlertAssignedToMe(alerta);
        addNotification(
          {
            title: assigned ? ui.notificationTitleAssigned : ui.notificationTitleNearby,
            body: `${citizenName(alerta)} - ${alertLocationText(alerta)}`,
            type: assigned ? "assignment" : "nearby_alert",
            dedupeKey: `${variant}-${id}-${assigned ? "assigned" : "nearby"}`,
            payload: {
              alert: alerta,
              alertId: id,
            },
          },
          { showBanner: true },
        ).catch(() => {});
      });

      previousAlertIdsRef.current = nextIds;
      notificationsPrimedRef.current = true;
    },
    [addNotification, ui, variant],
  );

  const loadAvailability = useCallback(async () => {
    try {
      const response = await api.get("/mobile/personal/perfil");
      const nextAvailable = response?.data?.data?.disponible;
      if (typeof nextAvailable === "boolean") {
        setAvailable(nextAvailable);
      }
    } catch {
      // Si falla, usamos el estado local por defecto.
    }
  }, []);

  const loadAlerts = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (!hasLoadedOnceRef.current) {
          setLoading(true);
        }

        const myAlertsPromise = api.get("/mobile/asignaciones/mias");
        let nearAlerts = [];

        if (available) {
          try {
            const coords = await ensureLocation();
            const nearbyResult = await fetchNearbyAlertsRobust(coords, { baseRadio: coverageRadius });
            nearAlerts = nearbyResult.alerts.filter(ui.filterAlert);
            if (nearbyResult?.coverageRadius) {
              setCoverageRadius(nearbyResult.coverageRadius);
            }
          } catch {
            if (isRefresh) {
              Alert.alert("Ubicacion requerida", "Activa permisos de ubicacion para ver alertas cercanas.");
            }
          }
        }

        const myRes = await Promise.allSettled([myAlertsPromise]);
        const myAlerts = myRes[0]?.status === "fulfilled" ? normalizeMyAlerts(myRes[0].value?.data) : [];
        const mergedAlerts = mergeAlerts(nearAlerts, myAlerts);

        setAlerts(mergedAlerts);
        announceNewAlerts(mergedAlerts);
      } catch {
        setAlerts([]);
      } finally {
        hasLoadedOnceRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [announceNewAlerts, available, coverageRadius, ensureLocation, ui],
  );

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    const polling = setInterval(() => {
      loadAlerts(false);
    }, 12000);

    return () => clearInterval(polling);
  }, [loadAlerts]);

  useEffect(() => {
    let watcher = null;

    if (available) {
      startLocationUpdates(async (coords) => {
        setUnitLocation(coords);
        try {
          await api.patch("/mobile/unidades/ubicacion", coords);
        } catch {
          // No bloqueamos si falla la ubicacion.
        }
      }, 10000)
        .then((subscription) => {
          watcher = subscription;
        })
        .catch(() => {
          watcher = null;
        });
    }

    return () => {
      watcher?.remove?.();
    };
  }, [available]);

  const handleAvailabilityChange = async (nextValue) => {
    const previousValue = available;
    setAvailable(nextValue);

    try {
      await api.patch("/mobile/personal/estado", { disponible: nextValue });
      if (!nextValue) {
        setAlerts((prev) => prev.filter((item) => isAlertAssignedToMe(item)));
      }
    } catch (error) {
      setAvailable(previousValue);
      Alert.alert(
        "No se pudo actualizar tu estado",
        error?.response?.data?.error || error?.response?.data?.message || "Intenta de nuevo en unos segundos.",
      );
    }
  };

  const handleAccept = async (alerta) => {
    const alertId = alerta?.id || alerta?._id;
    if (!alertId) {
      Alert.alert("Error", "La alerta no tiene identificador valido.");
      return;
    }

    try {
      await api.post(`/mobile/asignaciones/${alertId}/aceptar`);
      const assignedAlert = { ...alerta, estado: "asignada", source: "mias" };
      addNotification(
        {
          title: ui.notificationTitleAssigned,
          body: `${citizenName(alerta)} - ${alertLocationText(alerta)}`,
          type: "assignment",
          dedupeKey: `${variant}-${alertId}-assigned`,
          payload: { alert: assignedAlert, alertId },
        },
        { showBanner: false },
      ).catch(() => {});
      navigation.navigate(ui.detailScreen, { alert: assignedAlert });
    } catch (error) {
      Alert.alert("Error", error?.response?.data?.message || error?.response?.data?.error || "No se pudo aceptar la alerta.");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ui.accentColor} />
      </View>
    );
  }

  const topAlert = pendingAlerts[0];
  const topAlertAssigned = topAlert ? isAlertAssignedToMe(topAlert) : false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAlerts(true)} />}
    >
      <View style={styles.topbar}>
        <Pressable style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={22} color="#111827" />
        </Pressable>
        <View style={styles.topbarBrand}>
          <Ionicons name={ui.brandIcon} size={17} color={ui.accentColor} />
          <Text style={styles.topbarText}>Sistema de Alertas</Text>
        </View>
        <Pressable style={styles.notificationButton} onPress={() => navigation.navigate(ui.notificationsScreen)}>
          <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={22} color="#111827" />
          {unreadCount > 0 ? (
            <View style={[styles.notificationBadge, { backgroundColor: ui.dangerColor }]}>
              <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>{ui.headerTitle}</Text>
          <Text style={styles.agentText}>{ui.roleCaption}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate(ui.profileScreen)}>
          <Ionicons name={ui.profileIcon} size={22} color={ui.accentColor} />
        </Pressable>
      </View>

      <View style={styles.statusCard}>
        <View style={[styles.statusDot, { backgroundColor: available ? "#22C55E" : "#9CA3AF" }]} />
        <View style={styles.statusTextWrap}>
          <Text style={styles.statusTitle}>Estado de disponibilidad</Text>
          <Text style={styles.statusSubtitle}>{available ? "Disponible para recibir alertas" : "Fuera de servicio"}</Text>
        </View>
        <Switch value={available} onValueChange={handleAvailabilityChange} />
      </View>

      <View style={styles.coverageCard}>
        <Ionicons name="locate-outline" size={16} color={ui.accentColor} />
        <Text style={styles.coverageText}>Cobertura actual del cliente: {coverageRadius} km</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: ui.dangerColor }]}>
        {ui.sectionTitle} ({pendingAlerts.length})
      </Text>

      {topAlert ? (
        <View style={[styles.alertCard, { borderColor: ui.accentColor }]}>
          <View style={styles.alertCardHeader}>
            <Text style={styles.alertCardTitle}>{ui.alertCardTitle}</Text>
            <View style={[styles.badge, { backgroundColor: getStatusBadgeColor(topAlert, ui) }]}>
              <Text style={styles.badgeText}>{topAlert?.estado || "pendiente"}</Text>
            </View>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Datos del ciudadano</Text>
            <Text style={styles.infoText}>Nombre: {citizenName(topAlert)}</Text>
            <Text style={styles.infoText}>Telefono: {citizenPhone(topAlert)}</Text>
            <Text style={styles.infoText}>Edad: {citizenAgeText(topAlert)}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Ubicacion</Text>
            <Text style={styles.infoText}>{alertLocationText(topAlert)}</Text>
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: topAlertAssigned ? ui.accentColor : "#22C55E" }]}
            onPress={() => {
              if (topAlertAssigned) {
                navigation.navigate(ui.detailScreen, { alert: topAlert });
                return;
              }
              handleAccept(topAlert);
            }}
          >
            <Ionicons name={topAlertAssigned ? "eye-outline" : "checkmark"} color="#FFFFFF" size={16} />
            <Text style={styles.primaryButtonText}>{topAlertAssigned ? "Ver detalle" : "Confirmar atencion"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sin alertas pendientes</Text>
          <Text style={styles.emptyText}>{ui.emptyText}</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statTitle}>Alertas activas</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{activeCount}</Text>
            <MaterialIcons name="graphic-eq" size={24} color="#FB923C" />
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statTitle}>En espera</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{waitingCount}</Text>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statTitle}>Completadas</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{closedCount}</Text>
            <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
          </View>
        </View>
      </View>

      <View style={[styles.instructionsCard, { borderColor: ui.accentColor }]}>
        <Text style={[styles.instructionsTitle, { color: ui.accentColor }]}>Instrucciones de operacion</Text>
        {ui.instructions.map((instruction) => (
          <Text key={instruction} style={styles.instructionsItem}>- {instruction}</Text>
        ))}
      </View>

      <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} title={ui.menuTitle} items={menuItems} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  content: { padding: 14, paddingBottom: 34 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  topbar: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
  },
  menuButton: {
    position: "absolute",
    left: 0,
    top: 1,
    padding: 2,
  },
  notificationButton: {
    position: "absolute",
    right: 0,
    top: 1,
    padding: 2,
  },
  notificationBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  topbarBrand: { flexDirection: "row", alignItems: "center", gap: 5 },
  topbarText: { fontWeight: "700", color: "#111827", fontSize: 13 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 10 },
  headerTitle: { fontSize: 30, fontWeight: "800", color: "#111827" },
  agentText: { color: "#6B7280", fontSize: 13 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  statusTextWrap: { flex: 1 },
  statusTitle: { fontWeight: "700", color: "#111827", fontSize: 13 },
  statusSubtitle: { fontSize: 11, color: "#4B5563" },
  coverageCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coverageText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
  alertCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderRadius: 14, padding: 10 },
  alertCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  alertCardTitle: { fontSize: 13, fontWeight: "700", color: "#111827" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  infoBlock: { marginBottom: 8, borderRadius: 10, backgroundColor: "#F9FAFB", padding: 9 },
  infoLabel: { fontWeight: "700", color: "#111827", marginBottom: 4, fontSize: 12 },
  infoText: { color: "#374151", fontSize: 12, marginBottom: 2 },
  primaryButton: {
    marginTop: 2,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", textTransform: "uppercase", fontSize: 12 },
  emptyCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#F97316", borderRadius: 12, padding: 12 },
  emptyTitle: { color: "#111827", fontWeight: "700", marginBottom: 6 },
  emptyText: {
    color: "#6B7280",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  statsGrid: { marginTop: 10, gap: 8 },
  statCard: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 10 },
  statTitle: { color: "#111827", fontSize: 13 },
  statRow: { marginTop: 3, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "800", color: "#111827" },
  instructionsCard: {
    marginTop: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
  },
  instructionsTitle: { fontWeight: "800", marginBottom: 6 },
  instructionsItem: { color: "#1E3A8A", fontSize: 11, marginBottom: 3 },
});