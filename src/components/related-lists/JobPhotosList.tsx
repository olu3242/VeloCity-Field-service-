import { RelatedList } from "./RelatedList";

export function JobPhotosList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Photos" table="job_photos" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="photo_type" statusColumn="uploader_role" secondaryColumn="url" />;
}
