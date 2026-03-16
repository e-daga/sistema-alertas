import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import {
  alertLocationText,
  citizenAgeText,
  citizenName,
  citizenPhone,
  extractLatLng,
  formatDateTime,
  getAlertReportDescription,
  getAlertReportType,
} from "../../services/alertUtils";

function getStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "asignada") return "Asignada";
  if (normalized === "atendiendo") return "Atendiendo";
  if (normalized === "cerrada") return "Cerrada";
  if (normalized === "expirada") return "Expirada";
  if (normalized === "cancelada") return "Cancelada";
  return "En atencion";
}

export default function PoliceAlertScreen({ navigation, route }) {
  const alert = route?.params?.alert || {};
  const readOnly = route?.params?.readOnly === true;
  const coords = extractLatLng(alert) || { lat: 19.4326, lng: -99.1332 };
  const alertId = alert?.id || alert?._id;
  const locationText = alertLocationText(alert);
  const reportDescription = getAlertReportDescription(alert);
  const reportType = getAlertReportType(alert);
  const statusLabel = useMemo(() => getStatusLabel(alert?.estado), [alert?.estado]);
  const canSendReport = !readOnly && !["cerrada", "expirada", "cancelada"].includes(String(alert?.estado || "").toLowerCase());

  const openMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const goToReport = async () => {
    if (alertId) {
      try {
        await api.patch(`/mobile/asignaciones/${alertId}/estado`, { estado: "atendiendo" });
      } catch {
        // Si falla el cambio de estado, igual dejamos avanzar al reporte.
      }
    }
    navigation.navigate("PoliceReport", { alert });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Panel de Policia</Text>
        <Ionicons name="shield-outline" size={22} color="#1D4ED8" />
      </View>
      <Text style={styles.agentText}>{alert?.unidadAsignada || "Unidad en servicio"}</Text>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Boton de Panico</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{statusLabel}</Text></View>
        </View>
        <Text style={styles.sectionLabel}>Detalles de la emergencia:</Text>
        <Text style={styles.line}>Nombre: {citizenName(alert)}</Text>
        <Text style={styles.line}>Telefono: {citizenPhone(alert)}</Text>
        <Text style={styles.line}>Edad: {citizenAgeText(alert)}</Text>
        <Text style={styles.line}>Ubicacion: {locationText}</Text>
        <Text style={styles.line}>Creada: {formatDateTime(alert?.fecha_creacion)}</Text>
        {alert?.fecha_cierre ? <Text style={styles.line}>Cerrada: {formatDateTime(alert?.fecha_cierre)}</Text> : null}
        <Text style={styles.line}>Unidad asignada: {alert?.unidadAsignada || alert?.unidad?.codigo || "Patrulla"}</Text>

        <Pressable style={styles.secondaryButton} onPress={openMaps}><Text style={styles.secondaryButtonText}>Ver en Google Maps</Text></Pressable>

        {reportDescription ? (
          <View style={styles.reportCard}>
            <Text style={styles.sectionLabel}>Reporte registrado</Text>
            {reportType ? <Text style={styles.line}>Tipo atendido: {reportType}</Text> : null}
            <Text style={styles.reportText}>{reportDescription}</Text>
          </View>
        ) : null}
      </View>

      {canSendReport ? (
        <Pressable style={styles.primaryButton} onPress={goToReport}><Text style={styles.primaryButtonText}>Enviar reporte</Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6", padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#111827" },
  agentText: { marginTop: 3, color: "#6B7280", fontSize: 12, marginBottom: 8 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#2563EB", borderRadius: 12, padding: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  badge: { backgroundColor: "#2563EB", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  sectionLabel: { marginTop: 10, fontWeight: "700", color: "#111827", fontSize: 12 },
  line: { marginTop: 3, color: "#374151", fontSize: 12 },
  secondaryButton: { marginTop: 10, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, alignItems: "center", paddingVertical: 7 },
  secondaryButtonText: { color: "#374151", fontWeight: "600", fontSize: 12 },
  reportCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    padding: 10,
  },
  reportText: { marginTop: 6, color: "#374151", fontSize: 12, lineHeight: 18 },
  primaryButton: { marginTop: 14, height: 42, borderRadius: 10, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700" },
});
