import { useEffect } from "react";
import { AuthProvider } from "./src/context/AuthContext";
import { NotificationCenterProvider } from "./src/context/NotificationCenterContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { configureGoogleSignin } from "./src/config/google";

export default function App() {
  useEffect(() => {
    configureGoogleSignin();
  }, []);

  return (
    <AuthProvider>
      <NotificationCenterProvider>
        <AppNavigator />
      </NotificationCenterProvider>
    </AuthProvider>
  );
}