import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import React from 'react';
import { FlexWidget, TextWidget, Action, requestWidgetUpdate } from "react-native-android-widget";

const BASE_URL = "https://backend-emergencias.onrender.com/api";
const ACCESS_TOKEN_KEY = "@auth:token";

function PanicWidgetUi() {
  return (
    <FlexWidget
      style={{
        height: 'wrap_content',
        width: 'fill_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget
        style={{
          flex: 1,
          height: 100,
          marginRight: 6,
          backgroundColor: '#DC2626',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        clickAction="ALERTA_PANICO"
      >
        <TextWidget
          text="PÁNICO"
          style={{
            fontSize: 20,
            fontFamily: 'sans-serif-condensed-light',
            color: '#FFFFFF',
            fontWeight: 'bold',
          }}
        />
        <TextWidget
          text="(Policía)"
          style={{ fontSize: 12, color: '#FCA5A5', marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{
          flex: 1,
          height: 100,
          marginLeft: 6,
          backgroundColor: '#2563EB',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        clickAction="ALERTA_MEDICA"
      >
        <TextWidget
          text="MÉDICA"
          style={{
            fontSize: 20,
            fontFamily: 'sans-serif-condensed-light',
            color: '#FFFFFF',
            fontWeight: 'bold',
          }}
        />
        <TextWidget
          text="(Ambulancia)"
          style={{ fontSize: 12, color: '#93C5FD', marginTop: 2 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

export async function widgetTaskHandler(props) {
  const { widgetAction, widgetInfo } = props;

  if (
    widgetAction === "WIDGET_ADDED" ||
    widgetAction === "WIDGET_UPDATE" ||
    widgetAction === "WIDGET_RESIZED" ||
    widgetAction === "ALERTA_PANICO" ||
    widgetAction === "ALERTA_MEDICA"
  ) {
    if (widgetAction === "ALERTA_PANICO" || widgetAction === "ALERTA_MEDICA") {
      try {
        const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        if (accessToken) {
          const tipo = widgetAction === "ALERTA_PANICO" ? "panico" : "medica";
          await axios.post(
            `${BASE_URL}/alertas`,
            {
              tipo,
              lat: 0,
              lng: 0,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "x-plataforma": "mobile",
              },
            }
          );
          console.log("Widget: Alerta de pánico enviada correctamente");
        }
      } catch (error) {
        console.error("Widget: Error al enviar alerta", error?.message);
      }
    }

    try {
      requestWidgetUpdate({
        widgetName: "PanicButtonWidget",
        renderWidget: () => <PanicWidgetUi />,
        widgetInfo,
      });
    } catch {}
  }
}
