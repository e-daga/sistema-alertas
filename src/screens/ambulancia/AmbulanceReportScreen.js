import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { composeReportDescription } from "../../services/alertUtils";
import { AMBULANCE_INCIDENT_TYPES } from "../../services/reportCatalogs";

const MAX_REPORT_PHOTOS = 10;

function SelectField({ label, value, placeholder, onPress }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.selectField} onPress={onPress}>
        <Text style={[styles.selectValue, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <Text style={styles.chevron}>v</Text>
      </Pressable>
    </View>
  );
}

export default function AmbulanceReportScreen({ navigation, route }) {
  const alert = route?.params?.alert || {};
  const alertId = alert?.id || alert?._id;
  const [incidentType, setIncidentType] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);

  const pickImage = async () => {
    if (photos.length >= MAX_REPORT_PHOTOS) {
      Alert.alert("Limite alcanzado", `Solo puedes adjuntar hasta ${MAX_REPORT_PHOTOS} fotos por reporte.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      return Alert.alert("Permiso requerido", "Debes permitir acceso a galeria para adjuntar evidencia.");
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setPhotos((prev) => [...prev, result.assets[0]].slice(0, MAX_REPORT_PHOTOS));
    }
  };

  const sendReport = async () => {
    if (!alertId) return Alert.alert("Error", "No hay alerta valida para reportar");
    if (!incidentType) {
      Alert.alert("Falta un dato", "Selecciona el tipo de hecho atendido antes de enviar el reporte.");
      return;
    }
    try {
      setSending(true);
      const formData = new FormData();
      formData.append("descripcion", composeReportDescription(descripcion, incidentType));
      photos.forEach((photo, index) => {
        formData.append("fotos", { uri: photo.uri, type: photo.mimeType || "image/jpeg", name: photo.fileName || `foto_${index + 1}.jpg` });
      });
      await api.post(`/reportes/alerta/${alertId}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      try { await api.patch(`/mobile/asignaciones/${alertId}/estado`, { estado: "cerrada" }); } catch {}
      Alert.alert("Exito", "Reporte enviado correctamente");
      navigation.popToTop();
    } catch (error) {
      Alert.alert("Error", error?.response?.data?.message || error?.response?.data?.error || "No se pudo enviar reporte");
    } finally { setSending(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Panel de Ambulancia</Text>
        <Ionicons name="heart-outline" size={22} color="#DC2626" />
      </View>
      <Text style={styles.agentText}>{alert?.unidadAsignada || "Unidad en servicio"}</Text>

      <View style={styles.card}>
        <View style={styles.badge}><Text style={styles.badgeText}>En atencion</Text></View>
        <Text style={styles.cardTitle}>Emergencia Medica</Text>

        <SelectField
          label="Tipo de hecho atendido:"
          value={incidentType}
          placeholder="Selecciona una opcion"
          onPress={() => setSelectorVisible(true)}
        />

        <Text style={styles.label}>Descripcion:</Text>
        <TextInput value={descripcion} onChangeText={setDescripcion} placeholder="Descripcion de lo sucedido" multiline style={styles.input} />

        <View style={styles.photoHeader}>
          <Text style={styles.label}>Evidencia:</Text>
          <Text style={styles.photoCount}>{photos.length}/{MAX_REPORT_PHOTOS} fotos</Text>
        </View>
        <View style={styles.photosRow}>
          {photos.slice(0, 3).map((photo) => <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.photoPreview} />)}
          <Pressable style={styles.addPhotoButton} onPress={pickImage}><Ionicons name="add" size={24} color="#6B7280" /></Pressable>
        </View>
      </View>
      <Pressable style={styles.primaryButton} onPress={sendReport} disabled={sending}>
        {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Enviar Reporte</Text>}
      </Pressable>

      <Modal transparent visible={selectorVisible} animationType="fade" onRequestClose={() => setSelectorVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectorVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Tipo de hecho atendido</Text>
            <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsContent}>
              {AMBULANCE_INCIDENT_TYPES.map((option) => (
                <Pressable
                  key={option}
                  style={styles.optionItem}
                  onPress={() => {
                    setIncidentType(option);
                    setSelectorVisible(false);
                  }}
                >
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  content: { padding: 16, paddingBottom: 32 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#111827" },
  agentText: { marginTop: 3, color: "#6B7280", fontSize: 12, marginBottom: 8 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, padding: 10 },
  badge: { alignSelf: "flex-end", backgroundColor: "#F97316", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111827", marginTop: 2 },
  label: { marginTop: 12, fontWeight: "700", color: "#111827", fontSize: 12 },
  selectField: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
  placeholderText: {
    color: "#6B7280",
  },
  chevron: {
    marginLeft: 10,
    color: "#6B7280",
    fontWeight: "700",
  },
  input: { marginTop: 6, minHeight: 170, borderRadius: 10, borderWidth: 1, borderColor: "#9CA3AF", padding: 10, textAlignVertical: "top", backgroundColor: "#F9FAFB" },
  photoHeader: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  photoCount: { color: "#6B7280", fontSize: 11, fontWeight: "600" },
  photosRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  photoPreview: { width: 48, height: 48, borderRadius: 8 },
  addPhotoButton: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: "#9CA3AF", alignItems: "center", justifyContent: "center", backgroundColor: "#E5E7EB" },
  primaryButton: { marginTop: 14, height: 42, borderRadius: 10, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  optionsList: {
    width: "100%",
  },
  optionsContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  optionItem: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  optionText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
});
