import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { getAlertEffectiveState, isAlertFinalForClient } from "../../services/alertState";
import { formatDateTime, getAlertId } from "../../services/alertUtils";

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

export default function PerfilScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  const trackedAlertIdRef = useRef("");
  const handledClosedAlertIdRef = useRef("");

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get("/mobile/ciudadano/perfil");
      const profile = response?.data?.data || {};

      setNombre(profile?.nombre || user?.nombre || "");
      setTelefono(profile?.telefono || "");
      setEmail(profile?.email || user?.email || "");
    } catch {
      setNombre(user?.nombre || "");
      setTelefono(user?.telefono || "");
      setEmail(user?.email || "");
    } finally {
      setLoading(false);
    }
  };

  const refreshLatestAlert = useCallback(async () => {
    try {
      const response = await api.get("/mobile/ciudadano/mis-alertas", {
        params: { pagina: 1, limite: 10 },
      });

      const alerts = normalizeAlertsPayload(response?.data);
      const activeAlert = alerts.find((item) => !isAlertFinalForClient(item));
      const latest = activeAlert || alerts[0] || null;
      setLatestAlert(latest);

      if (activeAlert) {
        trackedAlertIdRef.current = String(getAlertId(activeAlert) || "");
        return;
      }

      if (!trackedAlertIdRef.current) {
        return;
      }

      const trackedAlert = alerts.find((item) => String(getAlertId(item) || "") === trackedAlertIdRef.current);
      const trackedState = trackedAlert ? getAlertEffectiveState(trackedAlert) : "expirada";

      if (trackedAlert && trackedState === "cerrada" && handledClosedAlertIdRef.current !== trackedAlertIdRef.current) {
        handledClosedAlertIdRef.current = trackedAlertIdRef.current;
        trackedAlertIdRef.current = "";
        navigation.navigate("AlertClosed", { alert: trackedAlert });
        return;
      }

      if (!trackedAlert || trackedState === "cancelada" || trackedState === "expirada") {
        trackedAlertIdRef.current = "";
      }
    } catch {
      // Si falla la consulta, dejamos la ultima informacion cargada.
    }
  }, [navigation]);

  useEffect(() => {
    loadProfile();
    refreshLatestAlert();
  }, [refreshLatestAlert]);

  useFocusEffect(
    useCallback(() => {
      refreshLatestAlert();
      const interval = setInterval(() => {
        refreshLatestAlert();
      }, 12000);

      return () => clearInterval(interval);
    }, [refreshLatestAlert]),
  );

  const saveProfile = async () => {
    try {
      setSaving(true);
      const payload = {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
      };

      const response = await api.patch("/mobile/ciudadano/perfil", payload);
      const updated = response?.data?.data || payload;
      await updateUser(updated);
      Alert.alert("Perfil actualizado", "Tus datos fueron guardados correctamente.");
    } catch (error) {
      Alert.alert("Error", error?.response?.data?.error || error?.response?.data?.message || "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  const latestState = latestAlert ? getAlertEffectiveState(latestAlert) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mi Perfil</Text>
        <Pressable style={styles.editButton} onPress={saveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.editButtonText}>Editar perfil</Text>}
        </Pressable>
      </View>

      <Text style={styles.subtitle}>Revisa tu informacion personal</Text>

      {latestAlert ? (
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Ionicons name="pulse-outline" size={18} color="#1D4ED8" />
            <Text style={styles.alertTitle}>Estado de tu ultima alerta</Text>
          </View>
          <Text style={styles.alertLine}>Estado: {getCitizenStatusLabel(latestState)}</Text>
          <Text style={styles.alertLine}>Tipo: {latestAlert?.tipo || "Sin tipo"}</Text>
          <Text style={styles.alertLine}>Creada: {formatDateTime(latestAlert?.fecha_creacion)}</Text>
          {latestState === "cerrada" ? (
            <Text style={styles.alertClosed}>Tu alerta ya se cerro. Si aplica, te mostraremos la pantalla de calificacion.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <Ionicons name="person-outline" size={26} color="#FFFFFF" />
        </View>

        <Text style={styles.name}>{nombre || "Usuario"}</Text>

        <Text style={styles.label}>Nombre completo</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Correo electronico</Text>
        <TextInput style={[styles.input, styles.readonly]} value={email} editable={false} />

        <Text style={styles.label}>Telefono</Text>
        <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />

        <Text style={styles.label}>Seguridad</Text>
        <View style={styles.fakeInput}><Text style={styles.fakeInputText}>Contrasena</Text></View>

        <Text style={styles.label}>Permisos</Text>
        <View style={styles.fakeInput}><Text style={styles.fakeInputText}>Ubicacion</Text></View>

        <Text style={styles.label}>Privacidad</Text>
        <Text style={styles.privacy}>Terminos y condiciones de uso</Text>

        <Pressable onPress={logout} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Eliminar mi cuenta</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECEEF3" },
  content: { padding: 16, paddingBottom: 34 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ECEEF3" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 40, fontWeight: "900", color: "#111827" },
  editButton: { backgroundColor: "#111827", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: 95, alignItems: "center" },
  editButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
  subtitle: { marginTop: 2, color: "#6B7280", fontSize: 13 },
  alertCard: {
    marginTop: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2563EB",
    padding: 12,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alertTitle: {
    color: "#1E3A8A",
    fontWeight: "800",
    fontSize: 15,
  },
  alertLine: {
    marginTop: 6,
    color: "#1E3A8A",
    fontSize: 12,
  },
  alertClosed: {
    marginTop: 8,
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
  card: { marginTop: 12, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#111827", padding: 12 },
  avatarWrap: { alignSelf: "center", width: 58, height: 58, borderRadius: 29, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  name: { marginTop: 8, textAlign: "center", color: "#1F2937", fontWeight: "700", fontSize: 32 },
  label: { marginTop: 10, color: "#111827", fontWeight: "700", fontSize: 13 },
  input: { marginTop: 4, height: 34, borderRadius: 6, backgroundColor: "#F3F4F6", paddingHorizontal: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  readonly: { opacity: 0.75 },
  fakeInput: { marginTop: 4, height: 34, borderRadius: 6, backgroundColor: "#F3F4F6", justifyContent: "center", paddingHorizontal: 10 },
  fakeInputText: { color: "#6B7280" },
  privacy: { marginTop: 4, color: "#374151", fontSize: 12 },
  deleteButton: { marginTop: 10, alignItems: "flex-end" },
  deleteText: { color: "#DC2626", fontWeight: "600" },
});