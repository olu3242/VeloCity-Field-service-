export interface QueueStatus {
  queueDepth: number;
  processingRate: number; // events/min
  activeWorkers: number;
  failureRate: number;
  avgLatencyMs: number;
  lastUpdatedAt: string;
}

export interface QueueStreamSubscriber {
  id: string;
  tenantId?: string; // undefined = admin (sees all)
  callback: (status: QueueStatus) => void;
  createdAt: string;
}

let CURRENT_STATUS: QueueStatus = {
  queueDepth: 0,
  processingRate: 0,
  activeWorkers: 0,
  failureRate: 0,
  avgLatencyMs: 0,
  lastUpdatedAt: new Date().toISOString(),
};

const SUBSCRIBERS = new Map<string, QueueStreamSubscriber>();

export function subscribe(
  callback: (status: QueueStatus) => void,
  tenantId?: string
): string {
  const id = crypto.randomUUID();
  const subscriber: QueueStreamSubscriber = {
    id,
    tenantId,
    callback,
    createdAt: new Date().toISOString(),
  };
  SUBSCRIBERS.set(id, subscriber);
  return id;
}

export function unsubscribe(id: string): void {
  SUBSCRIBERS.delete(id);
}

export function updateQueueStatus(partial: Partial<QueueStatus>): void {
  CURRENT_STATUS = {
    ...CURRENT_STATUS,
    ...partial,
    lastUpdatedAt: new Date().toISOString(),
  };
  broadcastToSubscribers();
}

export function broadcastToSubscribers(): void {
  for (const subscriber of Array.from(SUBSCRIBERS.values())) {
    try {
      subscriber.callback(CURRENT_STATUS);
    } catch {
      // Swallow subscriber errors to prevent broadcast failures
    }
  }
}

export function getCurrentStatus(): QueueStatus {
  return { ...CURRENT_STATUS };
}

export function getSubscriberCount(): number {
  return SUBSCRIBERS.size;
}
