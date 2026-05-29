import { ProviderDocument } from "./provider-types";

/**
 * Check whether a document has expired and how many days remain.
 *
 * Returns `daysUntilExpiry: null` when the document has no expiry date.
 */
export function checkDocumentExpiry(doc: ProviderDocument): {
  isExpired: boolean;
  daysUntilExpiry: number | null;
} {
  if (!doc.expiresAt) {
    return { isExpired: false, daysUntilExpiry: null };
  }

  const now = Date.now();
  const expiryMs = new Date(doc.expiresAt).getTime();
  const diffMs = expiryMs - now;
  const daysUntilExpiry = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return {
    isExpired: diffMs < 0,
    daysUntilExpiry,
  };
}

/**
 * Return documents that will expire within `withinDays` days from now
 * (including already-expired documents).
 */
export function getExpiringDocuments(
  docs: ProviderDocument[],
  withinDays: number
): ProviderDocument[] {
  return docs.filter((doc) => {
    if (!doc.expiresAt) return false;
    const { daysUntilExpiry } = checkDocumentExpiry(doc);
    if (daysUntilExpiry === null) return false;
    return daysUntilExpiry <= withinDays;
  });
}

/**
 * Summarise the verification status breakdown across a set of documents.
 */
export function getDocumentStatus(docs: ProviderDocument[]): {
  verified: number;
  pending: number;
  expired: number;
} {
  let verified = 0;
  let pending = 0;
  let expired = 0;

  for (const doc of docs) {
    if (doc.status === "verified") {
      verified++;
    } else if (doc.status === "pending") {
      pending++;
    } else if (doc.status === "expired") {
      expired++;
    }
  }

  return { verified, pending, expired };
}
