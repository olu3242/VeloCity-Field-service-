import { RelatedList } from "./RelatedList";

export function JobAutomationEventsList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Automation Events" table="automation_events" tenantId={tenantId} filters={[{ column: "entity_id", value: jobId }]} primaryColumn="event_type" statusColumn="status" secondaryColumn="source" />;
}
