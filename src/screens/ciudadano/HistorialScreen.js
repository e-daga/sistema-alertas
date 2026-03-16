import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import api from "../../services/api";
import { getAlertCreatedAt, getAlertEffectiveState } from "../../services/alertState";

function formatAlertState(item) {
  const state = getAlertEffectiveState(item);
  return state ? state.charAt(0).toUpperCase() + state.slice(1) : "N/A";
}

function formatAlertDate(item) {
  const createdAt = getAlertCreatedAt(item);
  return createdAt ? createdAt.toLocaleString() : "Sin fecha";
}

export default function HistorialScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);

  const loadHistory = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/mobile/ciudadano/mis-alertas");
      const list = response?.data?.alertas || response?.data?.data || response?.data || [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => String(item?.id || item?._id || index)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHistory(true)} />}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>Aun no tienes alertas registradas.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item?.tipo || "Alerta"}</Text>
            <Text style={styles.cardSubtitle}>Estado: {formatAlertState(item)}</Text>
            <Text style={styles.cardMeta}>{formatAlertDate(item)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFF",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFF",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSubtitle: {
    marginTop: 4,
    color: "#334155",
  },
  cardMeta: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 12,
  },
});