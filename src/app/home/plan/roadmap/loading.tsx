import { PageLoading } from "@/components/brand/page-loading";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

export default function LoadingRoadmap() {
  return <PageLoading label={ROADMAP_COPY.loadingTitle} />;
}
