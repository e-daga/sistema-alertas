import { ANDROID_PACKAGE_NAME, DEBUG_SHA1, getGoogleSignin } from "../../config/google";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { loadTenantSelection } from "../../services/tenantAccess";
import { useAuth } from "../../context/AuthContext";

function showDeveloperErrorHint(rawError) {
  const message =
    "Google Cloud Console -> OAuth Android Client\n\n" +
    `Package: ${ANDROID_PACKAGE_NAME}\n` +
    `SHA1: ${DEBUG_SHA1}\n\n` +
    "Luego reinstala app y prueba de nuevo.";

  Alert.alert("Google Sign-In DEVELOPER_ERROR", `${rawError?.message || "Configuracion OAuth invalida."}\n\n${message}`);
}


function showNetworkHint(rawError) {
  const message =
    `${rawError?.message || "Network Error"}\n\n` +
    "No se pudo conectar al backend.\n" +
    "1) Revisa internet en el celular\n" +
    "2) Verifica que backend-emergencias.onrender.com este activo\n" +
    "3) Intenta de nuevo en 20-30 segundos (Render puede tardar al despertar).";

  Alert.alert("Error de red", message);
}

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const forceAccountChooser = async (GoogleSignin) => {
    try {
      await GoogleSignin.revokeAccess();
    } catch {
      // Si no habia sesion previa, continuamos.
    }

    try {
      await GoogleSignin.signOut();
    } catch {
      // Si no habia sesion previa, continuamos.
    }
  };

  const warmupBackend = async () => {
    try {
      await api.get("/");
    } catch {
      // Puede regresar 404/401 y aun asi despierta el backend.
    }
  };

  const handleLoginGoogle = async () => {
    const GoogleSignin = getGoogleSignin();

    if (!GoogleSignin) {
      Alert.alert(
        "Modulo nativo no disponible",
        "Abre la app con Dev Client o APK de EAS. Expo Go no incluye RNGoogleSignin.",
      );
      return;
    }

    try {
      setLoading(true);

      await warmupBackend();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await forceAccountChooser(GoogleSignin);

      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens?.idToken || userInfo?.data?.idToken || userInfo?.idToken;

      if (!idToken) {
        throw new Error("Google no devolvio idToken");
      }

      // Leer el tenant guardado localmente (ciudadano ya eligio municipio previamente)
      // Para policia/paramedico puede no existir, el backend lo maneja sin filtro de tenant
      const tenantSelection = await loadTenantSelection();
      const tenantId = tenantSelection?.tenantId || "default";

      const res = await api.post("/auth/login/google/mobile", { idToken }, {
        headers: { "x-tenant-id": tenantId },
      });
      const { jwt, refresh_token, usuario } = res?.data || {};

      if (!jwt || !usuario) {
        throw new Error("No se pudo iniciar sesion con el servidor.");
      }

      const session = {
        accessToken: jwt,
        refreshToken: refresh_token,
        user: usuario,
      };

      const role = String(usuario.rol || usuario.role || "ciudadano").toLowerCase();

      if (role !== "ciudadano") {
        // Policia/paramedico: entrar directo sin pantalla de bienvenida
        await login(session);
      } else {
        // Ciudadano nuevo: necesita aceptar terminos y completar perfil
        if (!usuario.terminos_aceptados) {
          navigation.navigate("Terms", { session });
        } else if (!usuario.telefono || !usuario.estado || !usuario.municipio) {
          navigation.navigate("CompleteProfile", { session });
        } else {
          // Ciudadano ya registrado: entrar directo
          await login(session);
        }
      }
    } catch (error) {
      const code = String(error?.code || "");
      if (code === "10" || code === "DEVELOPER_ERROR") {
        showDeveloperErrorHint(error);
      } else if (error?.message === "Network Error" || code === "ECONNABORTED" || error?.message?.includes("Network")) {
        showNetworkHint(error);
      } else {
        Alert.alert("Error", error?.response?.data?.error || error?.message || "No se pudo iniciar sesion con Google");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={38} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Iniciar Sesion</Text>
        <Text style={styles.description}>
          Elige tu cuenta de Google para continuar. Si eres ciudadano, el codigo municipal se pedira en la siguiente
          pantalla. Si eres policia o paramedico, podras entrar sin capturarlo.
        </Text>

        <Pressable style={[styles.googleButton, loading && styles.googleButtonDisabled]} onPress={handleLoginGoogle} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleButtonText}>Elegir cuenta de Google</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#F5F5F5",
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  description: {
    marginTop: 8,
    marginBottom: 18,
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  googleButton: {
    width: "100%",
    borderRadius: 10,
    backgroundColor: "#2563EB",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
});
