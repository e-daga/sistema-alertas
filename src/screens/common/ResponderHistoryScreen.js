import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { alertLocationText, citizenName, formatDateTime, getAlertId, getAlertReportDescription, toArray } from "../../services/alertUtils";
import { getResponderUi } from "../../services/responderUi";

function normalizeHistoryPayload(payload) {
  return toArray(payload?.alertas || payload?.data?.alertas || payload?.data || payload);
}

export default function ResponderHistoryScreen({ navigation, variant = "policia" }) {
  const ui = getResponderUi(variant);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState([]);

  const loadHistory = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/mobile/asignaciones/historial", {
        params: { pagina: 1, limite: 50 },
      });

      setAlerts(normalizeHistoryPayload(response?.data));
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const emptyText = useMemo(() => {
    return variant === "ambulancia"
      ? "Todavia no hay servicios cerrados para mostrar."
      : "Todavia no hay atenciones cerradas para mostrar.";
  }, [variant]);

  const renderItem = ({ item }) => {
    const reportDescription = getAlertReportDescription(item);

    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate(ui.detailScreen, { alert: item, readOnly: true })}
      >
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>{citizenName(item)}</Text>
          <View style={[styles.badge, { backgroundColor: ui.accentColor }]}>
            <Text style={styles.badgeText}>{item?.estado || "cerrada"}</Text>
          </View>
        </View>

        <Text style={styles.line}>Tipo: {item?.tipo || "Sin tipo"}</Text>
        <Text style={styles.line}>Ubicacion: {alertLocationText(item)}</Text>
        <Text style={styles.line}>Creada: {formatDateTime(item?.fecha_creacion)}</Text>
        <Text style={styles.line}>Cerrada: {formatDateTime(item?.fecha_cierre)}</Text>
        {reportDescription ? <Text style={styles.report}>Reporte: {reportDescription}</Text> : null}

        <View style={styles.footerRow}>
          <Ionicons name="eye-outline" size={16} color={ui.accentColor} />
          <Text style={[styles.footerText, { color: ui.accentColor }]}>Ver detalle #{getAlertId(item) || "-"}</Text>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ui.accentColor} />
      </View>
    );
  }

  return (
    <FlatList
      data={alerts}
      keyExtractor={(item, index) => String(getAlertId(item) || index)}
      contentContainerStyle={alerts.length === 0 ? styles.emptyContent : styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHistory(true)} />}
      ListHeaderComponent={
        <View style={styles.screenHeader}>
          <Text style={styles.title}>{ui.historyTitle}</Text>
          <Text style={styles.subtitle}>Consulta las alertas cerradas y abre su detalle cuando lo necesites.</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sin historial disponible</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      }
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  content: {
    padding: 14,
    paddingBottom: 34,
    gap: 10,
  },
  emptyContent: {
    flexGrow: 1,
    padding: 14,
  },
  screenHeader: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    color: "#6B7280",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: "#111827",
    fontWeight: "800",
    fontSize: 15,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  line: {
    marginTop: 6,
    color: "#374151",
    fontSize: 12,
  },
  report: {
    marginTop: 8,
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  footerRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontWeight: "700",
    fontSize: 12,
  },
  emptyCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  emptyTitle: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },
  emptyText: {
    marginTop: 8,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
});