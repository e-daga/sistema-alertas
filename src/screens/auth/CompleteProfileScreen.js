import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import api from "../../services/api";
import { saveLocalExtendedProfile } from "../../services/localExtendedProfile";
import { AGE_OPTIONS, GENDER_OPTIONS, getMunicipalityOptions, STATE_OPTIONS } from "../../services/profileCatalogs";

function sessionHeaders(session) {
  const access = session?.accessToken;
  return {
    Authorization: access ? `Bearer ${access}` : undefined,
    "x-plataforma": "mobile",
    Cookie: session?.refreshToken
      ? `access_token=${access || ""}; refresh_token=${session.refreshToken}`
      : access
        ? `access_token=${access}`
        : undefined,
  };
}

function SelectField({ label, value, placeholder, onPress, disabled = false }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={[styles.selectField, disabled && styles.selectDisabled]} onPress={onPress} disabled={disabled}>
        <Text style={[styles.selectValue, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <Text style={styles.chevron}>v</Text>
      </Pressable>
    </View>
  );
}

export default function CompleteProfileScreen({ navigation, route }) {
  const session = route?.params?.session;
  const baseUser = session?.user || {};
  const role = baseUser?.rol || baseUser?.role || "ciudadano";

  const [nombre, setNombre] = useState(baseUser?.nombre || "");
  const [telefono, setTelefono] = useState(baseUser?.telefono || "");
  const [estado, setEstado] = useState(baseUser?.estado || "");
  const [municipio, setMunicipio] = useState(baseUser?.municipio || "");
  const [edad, setEdad] = useState(baseUser?.edad ? String(baseUser.edad) : "");
  const [genero, setGenero] = useState(baseUser?.genero || "");
  const [loading, setLoading] = useState(false);
  const [activeSelector, setActiveSelector] = useState("");

  const municipalityOptions = useMemo(() => {
    const baseOptions = getMunicipalityOptions(estado);
    if (municipio && !baseOptions.includes(municipio)) {
      return [municipio, ...baseOptions];
    }
    return baseOptions;
  }, [estado, municipio]);

  const selectorConfig = useMemo(
    () => ({
      estado: {
        title: "Selecciona tu estado",
        options: STATE_OPTIONS,
        onSelect: (option) => {
          setEstado(option);
          if (!getMunicipalityOptions(option).includes(municipio)) {
            setMunicipio("");
          }
        },
      },
      municipio: {
        title: estado ? `Selecciona tu municipio en ${estado}` : "Selecciona primero tu estado",
        options: municipalityOptions,
        onSelect: (option) => setMunicipio(option),
      },
      edad: {
        title: "Selecciona tu edad",
        options: AGE_OPTIONS,
        onSelect: (option) => setEdad(option),
      },
      genero: {
        title: "Selecciona tu genero",
        options: GENDER_OPTIONS,
        onSelect: (option) => setGenero(option),
      },
    }),
    [estado, municipio, municipalityOptions],
  );

  const currentSelector = selectorConfig[activeSelector];
  const canContinue = useMemo(
    () =>
      nombre.trim().length > 1 &&
      telefono.trim().length >= 8 &&
      estado.trim().length > 0 &&
      municipio.trim().length > 0 &&
      edad.trim().length > 0 &&
      genero.trim().length > 0,
    [edad, estado, genero, municipio, nombre, telefono],
  );

  const handleContinue = async () => {
    if (!canContinue) {
      Alert.alert("Faltan datos", "Completa nombre, telefono, estado, municipio, edad y genero.");
      return;
    }

    try {
      setLoading(true);

      const profilePayload = {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        estado: estado.trim(),
        municipio: municipio.trim(),
        edad: Number(edad),
        genero: genero.trim(),
      };

      let updatedUser = { ...baseUser, ...profilePayload };

      if (role === "ciudadano") {
        const response = await api.patch(
          "/mobile/ciudadano/perfil",
          {
            nombre: profilePayload.nombre,
            telefono: profilePayload.telefono,
          },
          {
            headers: sessionHeaders(session),
          },
        );

        updatedUser = {
          ...updatedUser,
          ...(response?.data?.data || response?.data?.usuario || response?.data?.user || {}),
          ...profilePayload,
        };
      }

      await saveLocalExtendedProfile(updatedUser, profilePayload);

      navigation.navigate("AccountCreated", {
        session: {
          ...session,
          user: {
            ...updatedUser,
            terminos_aceptados: true,
          },
        },
      });
    } catch (error) {
      Alert.alert(
        "Error",
        error?.response?.data?.error || error?.response?.data?.message || "No fue posible completar tu perfil.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (option) => {
    currentSelector?.onSelect?.(option);
    setActiveSelector("");
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Completa tu perfil</Text>
        <Text style={styles.subtitle}>Necesitamos estos datos para activar tu cuenta en el municipio.</Text>

        <Text style={styles.label}>Nombre completo (obligatorio)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Juan Perez"
          value={nombre}
          onChangeText={setNombre}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Telefono (obligatorio)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 2381234567"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
        />

        <SelectField
          label="Estado (obligatorio)"
          value={estado}
          placeholder="Selecciona un estado"
          onPress={() => setActiveSelector("estado")}
        />

        <SelectField
          label="Municipio (obligatorio)"
          value={municipio}
          placeholder={estado ? "Selecciona un municipio" : "Primero elige tu estado"}
          onPress={() => setActiveSelector("municipio")}
          disabled={!estado}
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <SelectField
              label="Edad (obligatorio)"
              value={edad}
              placeholder="Selecciona"
              onPress={() => setActiveSelector("edad")}
            />
          </View>
          <View style={styles.col}>
            <SelectField
              label="Genero (obligatorio)"
              value={genero}
              placeholder="Selecciona"
              onPress={() => setActiveSelector("genero")}
            />
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, !canContinue && styles.disabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Continuar</Text>}
        </Pressable>
      </ScrollView>

      <Modal transparent visible={Boolean(activeSelector)} animationType="fade" onRequestClose={() => setActiveSelector("") }>
        <Pressable style={styles.modalOverlay} onPress={() => setActiveSelector("") }>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{currentSelector?.title || "Selecciona una opcion"}</Text>
            <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsContent}>
              {(currentSelector?.options || []).map((option) => (
                <Pressable key={option} style={styles.optionItem} onPress={() => handleSelectOption(option)}>
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  content: { paddingHorizontal: 20, paddingTop: 44, paddingBottom: 28 },
  title: { fontSize: 26, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 8, fontSize: 16, color: "#4B5563", lineHeight: 22, marginBottom: 8 },
  label: { marginTop: 10, fontSize: 13, color: "#374151", fontWeight: "700" },
  input: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  selectField: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectDisabled: {
    opacity: 0.55,
  },
  selectValue: {
    flex: 1,
    fontSize: 16,
    color: "#0F172A",
  },
  placeholderText: {
    color: "#94A3B8",
  },
  chevron: {
    marginLeft: 10,
    color: "#64748B",
    fontWeight: "700",
    fontSize: 16,
  },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  primaryButton: {
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: "#60A5FA",
    alignItems: "center",
    paddingVertical: 15,
  },
  primaryText: { color: "#E0F2FE", fontWeight: "800", fontSize: 20 },
  disabled: { opacity: 0.6 },
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