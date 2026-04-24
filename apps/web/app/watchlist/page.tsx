import WatchlistClient from "../../components/watchlist-client";
import { getCatalogFeed } from "../../lib/catalog";

export default async function WatchlistPage() {
  const items = await getCatalogFeed();
  return <WatchlistClient items={items} />;
}