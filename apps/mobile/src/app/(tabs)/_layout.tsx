import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "../../components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, animation: "fade" }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="shelf" />
      <Tabs.Screen name="projects" />
    </Tabs>
  );
}
