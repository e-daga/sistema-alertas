import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useAuth } from "./AuthContext";
import { registerForPushNotifications } from "../services/notifications";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket";

const NotificationCenterContext = createContext({
  items: [],
  unreadCount: 0,
  addNotification: async () => {},
  markAllAsRead: () => {},
  markAsRead: () => {},
  clearNotifications: () => {},
});

const MAX_NOTIFICATIONS = 80;

function buildStorageKey(user) {
  if (!user?.id) {
    return null;
  }

  return `@notifications:${user.rol || "anon"}:${user.id}`;
}

function createNotificationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNotification(entry = {}, fallbackRole = "") {
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};

  return {
    id: String(entry?.id || createNotificationId()),
    title: entry?.title || "Nueva notificacion",
    body: entry?.body || entry?.message || "",
    type: entry?.type || "general",
    createdAt: entry?.createdAt || new Date().toISOString(),
    read: Boolean(entry?.read),
    dedupeKey: entry?.dedupeKey ? String(entry.dedupeKey) : null,
    role: entry?.role || fallbackRole || "",
    payload,
  };
}

function buildNotificationFromPush(notification, role) {
  const content = notification?.request?.content || {};
  const data = content?.data && typeof content.data === "object" ? content.data : {};
  const alertId = data?.alerta_id || data?.alertaId || data?.id || "";
  const type = data?.type || data?.action || "push";

  return normalizeNotification(
    {
      title: content?.title || "Nueva notificacion",
      body: content?.body || "",
      type,
      dedupeKey: alertId ? `push-${alertId}-${type}` : `push-${type}-${content?.title || "general"}`,
      payload: data,
    },
    role,
  );
}

export function NotificationCenterProvider({ children }) {
  const { user, token, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const storageKey = useMemo(() => buildStorageKey(user), [user?.id, user?.rol]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;

    if (!storageKey) {
      setItems([]);
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
      const normalized = normalizeNotification(entry, user?.rol || "");
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
          await Notifications.scheduleNotificationAsync({
            content: {
              title: normalized.title,
              body: normalized.body,
              data: normalized.payload,
            },
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

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    registerForPushNotifications().catch(() => {});
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(token);
    if (!socket || user?.rol === "ciudadano") {
      return;
    }

    const handleSocketMessage = (payload = {}) => {
      const alertId = payload?.alertaId || payload?.alerta_id || payload?.id || "";
      const state = payload?.nuevoEstado || payload?.estado || "socket";
      const title = payload?.titulo || payload?.title || "Actualizacion de alerta";
      const body = payload?.mensaje || payload?.message || "Revisa la bandeja para ver el detalle.";

      addNotification(
        {
          title,
          body,
          type: state,
          dedupeKey: alertId ? `socket-${alertId}-${state}` : `socket-${state}-${body}`,
          payload,
        },
        { showBanner: false },
      ).catch(() => {});
    };

    socket.on("nueva-alerta", handleSocketMessage);
    socket.on("alerta-asignada", handleSocketMessage);
    socket.on("alerta-actualizada", handleSocketMessage);

    return () => {
      const current = getSocket();
      current?.off("nueva-alerta", handleSocketMessage);
      current?.off("alerta-asignada", handleSocketMessage);
      current?.off("alerta-actualizada", handleSocketMessage);
    };
  }, [addNotification, isAuthenticated, token, user?.rol]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      addNotification(buildNotificationFromPush(notification, user?.rol || ""), { showBanner: false }).catch(() => {});
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      addNotification(buildNotificationFromPush(response?.notification, user?.rol || ""), { showBanner: false }).catch(() => {});
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
    }),
    [addNotification, clearNotifications, items, markAllAsRead, markAsRead],
  );

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenter() {
  return useContext(NotificationCenterContext);
}