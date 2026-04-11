import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../context/AuthContext";

export default function AccountCreatedScreen({ route }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const session = route?.params?.session;

  const handleFinish = async () => {
    if (!session?.accessToken) {
      Alert.alert("Error", "No existe una sesion valida para continuar");
      return;
    }

    try {
      setLoading(true);
      await login(session);
    } catch (error) {
      Alert.alert("Error", error?.message || "No se pudo guardar la sesion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Listo!</Text>
      <Text style={styles.subtitle}>Tu cuenta esta configurada. Ahora puedes usar el sistema de emergencias.</Text>

      <Pressable style={styles.primaryButton} onPress={handleFinish}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Entrar al sistema</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8FAFF",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    color: "#475569",
  },
  primaryButton: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    paddingVertical: 14,
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
