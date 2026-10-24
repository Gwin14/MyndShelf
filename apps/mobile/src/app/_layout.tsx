import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import { InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold } from "@expo-google-fonts/inter-tight";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { Newsreader_400Regular, Newsreader_400Regular_Italic, Newsreader_600SemiBold } from "@expo-google-fonts/newsreader";
import { fetch as expoFetch } from "expo/fetch";
import { configureAi } from "@myndshelf/core";
import { Cosmos } from "../components/Cosmos";
import { ActionSheetHost } from "../components/ActionSheet";
import { ToastHost } from "../components/Toast";
import { PromptHost } from "../components/PromptHost";
import { startFeedSync } from "../lib/feeds";
import { seedOnce } from "../lib/seed";
import { startAutoTag } from "../lib/ai";
import { colors } from "../lib/theme";

void SplashScreen.preventAutoHideAsync();

// telas transparentes: o céu em Skia aparece por trás de tudo
const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "transparent", card: colors.night, primary: colors.amber, text: colors.paper, border: colors.line } };

// streaming das respostas do Gemini precisa do fetch do Expo (corpo legível aos pedaços)
configureAi({ fetch: expoFetch as unknown as typeof fetch });

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_600SemiBold,
  });

  useEffect(() => {
    void seedOnce();
    const stopFeeds = startFeedSync();
    const stopTags = startAutoTag();
    return () => {
      stopFeeds();
      stopTags();
    };
  }, []);

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return <View style={styles.root} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <Cosmos />
      <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "fade_from_bottom" }}>
        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
        <Stack.Screen name="capture/[id]" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="view/[id]" options={{ presentation: "fullScreenModal", contentStyle: styles.viewer, animation: "fade" }} />
        <Stack.Screen name="ask" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="feeds/add" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="creation/[id]" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="creation/new" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="creation/read/[id]" options={{ presentation: "fullScreenModal", contentStyle: styles.viewer, animation: "fade" }} />
        <Stack.Screen name="project/[id]" options={{ animation: "fade", animationDuration: 320, gestureEnabled: false, contentStyle: styles.viewer }} />
        <Stack.Screen name="project/add" options={{ presentation: "modal", contentStyle: styles.modal }} />
        <Stack.Screen name="save" options={{ animation: "none" }} />
        <Stack.Screen name="settings" options={{ presentation: "modal", contentStyle: styles.modal }} />
      </Stack>
      </ThemeProvider>
      <ActionSheetHost />
      <PromptHost />
      <ToastHost />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  modal: { backgroundColor: colors.night },
  viewer: { backgroundColor: colors.void },
});
