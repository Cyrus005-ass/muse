import StreamingHomeClient from "../components/streaming-home-client";
import { getCatalogFeed } from "../lib/catalog";

export default async function HomePage() {
  const items = await getCatalogFeed();
  return <StreamingHomeClient items={items} />;
}