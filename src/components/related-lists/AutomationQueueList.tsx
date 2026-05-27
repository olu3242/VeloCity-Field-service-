import { RelatedList } from "./RelatedList";

export function AutomationQueueList({ tenantId }: { tenantId: string }) {
  return <RelatedList title="Automation Queue" table="automation_queue" tenantId={tenantId} primaryColumn="event_type" statusColumn="status" secondaryColumn="error_message" />;
}
