import type { CaptureKind } from "@myndshelf/types";
import { BookOpen, Code, Disc3, Film, Gamepad2, Image, Link2, MapPin, MessageCircle, Newspaper, Radio, ShoppingBag, StickyNote, Tv } from "lucide-react";

const S = 15;
export const KIND_ICONS: Record<CaptureKind, React.JSX.Element> = {
  music: <Disc3 size={S} />,
  podcast: <Radio size={S} />,
  book: <BookOpen size={S} />,
  video: <Tv size={S} />,
  film: <Film size={S} />,
  game: <Gamepad2 size={S} />,
  product: <ShoppingBag size={S} />,
  article: <Newspaper size={S} />,
  image: <Image size={S} />,
  code: <Code size={S} />,
  place: <MapPin size={S} />,
  social: <MessageCircle size={S} />,
  note: <StickyNote size={S} />,
  link: <Link2 size={S} />,
};
