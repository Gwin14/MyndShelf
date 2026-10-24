import { View } from "react-native";
import { Headline } from "../../components/Headline";
export default function Screen() {
  return (
    <View style={{ flex: 1, padding: 20, paddingTop: 80 }}>
      <Headline kicker="I — Captura" before="Tudo o que" em="te" after="atravessa." />
    </View>
  );
}
