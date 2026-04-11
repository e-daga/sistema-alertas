import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_NOTIFICATION_CHANNEL_ID,
  EMERGENCY_NOTIFICATION_CHANNEL_ID,
  registerForPushNotifications,
  setupNotificationChannels,
} from "../services/notifications";
import { hydrateNotificationPayload } from "../services/notificationNavigation";
import { isCitizenRole, normalizeRole } from "../services/roles";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket";

const NotificationCenterContext = createContext({
  items: [],
  unreadCount: 0,
  addNotification: async () => {},
  markAllAsRead: () => {},
  markAsRead: () => {},
  clearNotifications: () => {},
  pendingNotification: null,
  clearPendingNotification: () => {},
});

const MAX_NOTIFICATIONS = 80;

function buildStorageKey(user) {
  if (!user?.id) {
    return null;
  }

  return `@notifications:${normalizeRole(user?.rol) || "anon"}:${user.id}`;
}

function createNotificationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveNotificationState(type, payload = {}) {
  return String(
    payload?.nuevoEstado ||
      payload?.estado ||
      payload?.notificationKind ||
      payload?.type ||
      payload?.action ||
      type ||
      "",
  )
    .trim()
    .toLowerCase();
}

function inferNotificationDedupeKey(entry = {}, payload = {}) {
  const alertId = payload?.alerta_id || payload?.alertaId || payload?.id || payload?.alert?.id || payload?.alert?._id || "";
  if (!alertId) {
    return entry?.dedupeKey ? String(entry.dedupeKey) : null;
  }

  const state = resolveNotificationState(entry?.type, payload);
  const normalizedState = state
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");

  if (normalizedState.includes("assignment") || normalizedState === "asignada" || normalizedState === "alertaasignada") {
    return `alert-${alertId}-assigned`;
  }

  if (
    normalizedState.includes("emergency") ||
    normalizedState.includes("nearby") ||
    normalizedState.includes("newalert") ||
    normalizedState.includes("nuevaalerta") ||
    normalizedState === "activa"
  ) {
    return `alert-${alertId}-nearby`;
  }

  if (
    normalizedState === "atendiendo" ||
    normalizedState === "cerrada" ||
    normalizedState === "cancelada" ||
    normalizedState === "expirada" ||
    normalizedState === "confirmando"
  ) {
    return `alert-${alertId}-${normalizedState}`;
  }

  return `alert-${alertId}-${normalizedState || "general"}`;
}

function isEmergencyPayload(payload = {}) {
  const tipo = String(payload?.tipo || payload?.tipo_alerta || "").toLowerCase();
  const notificationKind = String(payload?.notificationKind || payload?.type || payload?.action || "").toLowerCase();
  return tipo === "panico" || tipo === "medica" || notificationKind.includes("emergency") || notificationKind.includes("assignment");
}

function normalizeNotification(entry = {}, fallbackRole = "") {
  const rawPayload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const payload = hydrateNotificationPayload(rawPayload);
  const dedupeKey = inferNotificationDedupeKey(entry, payload);

  return {
    id: String(entry?.id || createNotificationId()),
    title: entry?.title || "Nueva notificacion",
    body: entry?.body || entry?.message || "",
    type: entry?.type || "general",
    createdAt: entry?.createdAt || new Date().toISOString(),
    read: Boolean(entry?.read),
    dedupeKey,
    role: entry?.role || fallbackRole || "",
    payload,
  };
}

function buildNotificationFromPush(notification, role) {
  const content = notification?.request?.content || {};
  const data = hydrateNotificationPayload(content?.data && typeof content.data === "object" ? content.data : {});
  const type = data?.notificationKind || data?.type || data?.action || "push";
  const alertId = data?.alertaId || data?.alerta_id || data?.id || data?.alert?.id || "";

  // Usar el mismo formato de dedupeKey que el handler de socket para evitar duplicados
  // cuando llegan tanto por push (FCM) como por websocket simultaneamente
  const dedupeKey = alertId ? `socket-${alertId}-${type}` : null;

  return normalizeNotification(
    {
      title: content?.title || "Nueva notificacion",
      body: content?.body || "",
      type,
      dedupeKey,
      payload: data,
    },
    role,
  );
}

export function NotificationCenterProvider({ children }) {
  const { user, token, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [pendingNotification, setPendingNotification] = useState(null);
  const storageKey = useMemo(() => buildStorageKey(user), [user]);
  const hydratedRef = useRef(false);
  const initialResponseHandledRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    initialResponseHandledRef.current = false;

    if (!storageKey) {
      setItems([]);
      setPendingNotification(null);
      return;
    }

    let cancelled = false;

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) {
          return;
        }

        const parsed = raw ? JSON.parse(raw) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
        hydratedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          hydratedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydratedRef.current) {
      return;
    }

    AsyncStorage.setItem(storageKey, JSON.stringify(items)).catch(() => {});
  }, [items, storageKey]);

  const addNotification = useCallback(
    async (entry, options = {}) => {
      const normalized = normalizeNotification(entry, normalizeRole(user?.rol) || "");
      let inserted = false;

      setItems((prev) => {
        if (normalized.dedupeKey && prev.some((item) => item.dedupeKey === normalized.dedupeKey)) {
          return prev;
        }

        if (prev.some((item) => item.id === normalized.id)) {
          return prev;
        }

        inserted = true;
        return [normalized, ...prev].slice(0, MAX_NOTIFICATIONS);
      });

      if (inserted && options?.showBanner) {
        try {
          const emergency = isEmergencyPayload(normalized.payload);
          const content = {
            title: normalized.title,
            body: normalized.body,
            data: normalized.payload,
            sound: emergency ? "sirena.wav" : "default",
            ...(Platform.OS === "android"
              ? {
                  channelId: emergency ? EMERGENCY_NOTIFICATION_CHANNEL_ID : DEFAULT_NOTIFICATION_CHANNEL_ID,
                }
              : {}),
          };

          await Notifications.scheduleNotificationAsync({
            content,
            trigger: null,
          });
        } catch {
          // Si el dispositivo no permite notificaciones, igual la guardamos en bandeja.
        }
      }

      return normalized;
    },
    [user?.rol],
  );

  const markAllAsRead = useCallback(() => {
    setItems((prev) => prev.map((item) => (item.read ? item : { ...item, read: true })));
  }, []);

  const markAsRead = useCallback((notificationId) => {
    setItems((prev) =>
      prev.map((item) => (item.id === notificationId && !item.read ? { ...item, read: true } : item)),
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setItems([]);
  }, []);

  const clearPendingNotification = useCallback(() => {
    setPendingNotification(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setPendingNotification(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await setupNotificationChannels();
        await registerForPushNotifications();

        if (cancelled || initialResponseHandledRef.current) {
          return;
        }

        const lastResponse = Notifications.getLastNotificationResponseAsync
          ? await Notifications.getLastNotificationResponseAsync()
          : Notifications.getLastNotificationResponse?.();

        if (lastResponse?.notification) {
          const built = buildNotificationFromPush(lastResponse.notification, normalizeRole(user?.rol) || "");
          await addNotification(built, { showBanner: false });
          if (!cancelled) {
            setPendingNotification(built);
            initialResponseHandledRef.current = true;
          }
          if (Notifications.clearLastNotificationResponseAsync) {
            await Notifications.clearLastNotificationResponseAsync();
          }
        }
      } catch {
        // Si falla el setup, no rompemos la app.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addNotification, isAuthenticated, user?.id, user?.rol]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(token);
    const normalizedRole = normalizeRole(user?.rol);
    if (!socket) {
      return;
    }

    const handleSocketMessage = async (payload = {}) => {
      if (!isCitizenRole(normalizedRole)) {
        const rawDisp = await AsyncStorage.getItem("@personal:disponible");
        if (rawDisp === "false") {
          return; // Ignore alerts when deactivated
        }
      }

      const hydratedPayload = hydrateNotificationPayload(payload);
      const alertId = hydratedPayload?.alertaId || hydratedPayload?.alerta_id || hydratedPayload?.id || hydratedPayload?.alert?.id || "";
      const state = hydratedPayload?.nuevoEstado || hydratedPayload?.estado || hydratedPayload?.notificationKind || "socket";
      const title = hydratedPayload?.titulo || hydratedPayload?.title || "Actualizacion de alerta";
      const body = hydratedPayload?.mensaje || hydratedPayload?.message || "Revisa la bandeja para ver el detalle.";

      addNotification(
        {
          title,
          body,
          type: state,
          dedupeKey: alertId ? `socket-${alertId}-${state}` : `socket-${state}-${body}`,
          payload: hydratedPayload,
        },
        { showBanner: true },
      ).catch(() => {});
    };

    socket.on("alerta-actualizada", handleSocketMessage);
    if (!isCitizenRole(normalizedRole)) {
      socket.on("nueva-alerta", handleSocketMessage);
      socket.on("alerta-asignada", handleSocketMessage);
    }

    return () => {
      const current = getSocket();
      current?.off("alerta-actualizada", handleSocketMessage);
      if (!isCitizenRole(normalizedRole)) {
        current?.off("nueva-alerta", handleSocketMessage);
        current?.off("alerta-asignada", handleSocketMessage);
      }
    };
  }, [addNotification, isAuthenticated, token, user?.rol]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const normalizedRole = normalizeRole(user?.rol);
      if (!isCitizenRole(normalizedRole)) {
        const rawDisp = await AsyncStorage.getItem("@personal:disponible");
        if (rawDisp === "false") {
          return;
        }
      }
      addNotification(buildNotificationFromPush(notification, normalizedRole || ""), { showBanner: false }).catch(() => {});
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const built = await addNotification(buildNotificationFromPush(response?.notification, normalizeRole(user?.rol) || ""), { showBanner: false });
      setPendingNotification(built);
      if (Notifications.clearLastNotificationResponseAsync) {
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [addNotification, isAuthenticated, user?.rol]);

  const value = useMemo(
    () => ({
      items,
      unreadCount: items.filter((item) => !item.read).length,
      addNotification,
      markAllAsRead,
      markAsRead,
      clearNotifications,
      pendingNotification,
      clearPendingNotification,
    }),
    [addNotification, clearNotifications, clearPendingNotification, items, markAllAsRead, markAsRead, pendingNotification],
  );

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenter() {
  return useContext(NotificationCenterContext);
}
