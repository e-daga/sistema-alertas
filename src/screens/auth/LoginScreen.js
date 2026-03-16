import { ANDROID_PACKAGE_NAME, DEBUG_SHA1, getGoogleSignin } from "../../config/google";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { hasExtendedProfile, loadLocalExtendedProfile } from "../../services/localExtendedProfile";

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

function buildAuthHeaders(accessToken, refreshToken = "") {
  const headers = {
    Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    "x-plataforma": "mobile",
  };

  if (accessToken && refreshToken) {
    headers.Cookie = `access_token=${accessToken}; refresh_token=${refreshToken}`;
  } else if (accessToken) {
    headers.Cookie = `access_token=${accessToken}`;
  }

  return headers;
}

async function fetchCitizenProfile(accessToken, refreshToken) {
  const response = await api.get("/mobile/ciudadano/perfil", {
    headers: buildAuthHeaders(accessToken, refreshToken),
  });

  return response?.data?.data || {};
}

function hasCitizenProfile(user) {
  return Boolean((user?.nombre || "").trim() && (user?.telefono || "").trim() && hasExtendedProfile(user));
}

export default function LoginScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const warmupBackend = async () => {
    try {
      await api.get("/");
    } catch {
      // Puede regresar 404/401 y aun asi "despierta" backend.
    }
  };

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

      const res = await api.post("/auth/login/google/mobile", { idToken });
      const data = res?.data || {};

      if (data?.success === false) {
        throw new Error(data?.message || "Login fallido");
      }

      const session = {
        accessToken: data?.jwt || data?.access_token,
        refreshToken: data?.refresh_token || data?.refreshToken || "",
        user: data?.usuario || data?.user || {},
      };

      if (!session.accessToken) {
        throw new Error("El backend no devolvio token de acceso");
      }

      const role = session?.user?.rol || session?.user?.role;
      if (role === "admin" || role === "superadmin") {
        Alert.alert("Acceso no permitido", "Este rol usa panel web, no app movil.");
        return;
      }

      if (role === "policia" || role === "ambulancia") {
        await login(session);
        return;
      }

      let citizenProfile = {};
      try {
        citizenProfile = await fetchCitizenProfile(session.accessToken, session.refreshToken);
      } catch {
        citizenProfile = {};
      }

      const localExtendedProfile = await loadLocalExtendedProfile({
        ...(session.user || {}),
        ...(citizenProfile || {}),
      });

      session.user = {
        ...session.user,
        ...citizenProfile,
        ...localExtendedProfile,
      };

      const acceptedTerms = Boolean(session.user?.terminos_aceptados);
      if (!acceptedTerms) {
        navigation.navigate("Terms", { session });
        return;
      }

      if (!hasCitizenProfile(session.user)) {
        navigation.navigate("CompleteProfile", { session });
        return;
      }

      await login(session);
    } catch (error) {
      const code = String(error?.code || "");
      if (code === "10" || code === "DEVELOPER_ERROR") {
        showDeveloperErrorHint(error);
      } else if (error?.message === "Network Error" || code === "ECONNABORTED") {
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
          Inicia sesion con Google para acceder al sistema de alertas y continuar de forma segura.
        </Text>

        <Pressable style={styles.googleButton} onPress={handleLoginGoogle} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleButtonText}>Entrar con Google</Text>}
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
  googleButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
});