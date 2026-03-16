import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNotificationCenter } from "../../context/NotificationCenterContext";
import { formatDateTime } from "../../services/alertUtils";
import { getResponderUi } from "../../services/responderUi";

export default function ResponderNotificationsScreen({ navigation, variant = "policia" }) {
  const ui = getResponderUi(variant);
  const { items, markAllAsRead, markAsRead, clearNotifications } = useNotificationCenter();

  useEffect(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const openNotification = (item) => {
    markAsRead(item.id);

    if (item?.payload?.alert) {
      navigation.navigate(ui.detailScreen, {
        alert: item.payload.alert,
        readOnly: item.payload.readOnly === true || item.payload.type === "history",
      });
    }
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.content}
      ListHeaderComponent={
        <View style={styles.screenHeader}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.title}>Notificaciones</Text>
              <Text style={styles.subtitle}>Aqui se guardan los avisos que te llegan dentro de la app y por push.</Text>
            </View>
            {items.length > 0 ? (
              <Pressable style={styles.clearButton} onPress={clearNotifications}>
                <Text style={[styles.clearButtonText, { color: ui.accentColor }]}>Limpiar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <Ionicons name="notifications-off-outline" size={30} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Sin notificaciones</Text>
          <Text style={styles.emptyText}>Cuando llegue una alerta cercana o una asignacion, la veras guardada aqui.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={[styles.card, !item.read && styles.unreadCard]} onPress={() => openNotification(item)}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!item.read ? <View style={[styles.unreadDot, { backgroundColor: ui.accentColor }]} /> : null}
          </View>
          <Text style={styles.cardBody}>{item.body || "Sin detalle adicional"}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{formatDateTime(item.createdAt)}</Text>
            {item?.payload?.alert ? <Text style={[styles.linkText, { color: ui.accentColor }]}>Abrir alerta</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 34,
  },
  emptyContent: {
    flexGrow: 1,
    padding: 14,
  },
  screenHeader: {
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
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
    lineHeight: 18,
  },
  clearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  clearButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 10,
  },
  unreadCard: {
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
  },
  cardHeader: {
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
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardBody: {
    marginTop: 6,
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  metaText: {
    color: "#6B7280",
    fontSize: 11,
  },
  linkText: {
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
    marginTop: 10,
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