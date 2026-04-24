import { notFound } from "next/navigation";
import ContentDetailClient from "../../../components/content-detail-client";
import { getCatalogById } from "../../../lib/catalog";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ContentDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await getCatalogById(id);
  if (!item) notFound();

  return <ContentDetailClient item={item} />;
}