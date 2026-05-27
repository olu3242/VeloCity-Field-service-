export function getArrivalDeadline(input: { dispatchTime?: string | null; urgency?: string | null }) {
  const start = input.dispatchTime ? new Date(input.dispatchTime).getTime() : Date.now();
  const minutes = input.urgency === "emergency" ? 60 : input.urgency === "same_day" ? 180 : 24 * 60;
  return new Date(start + minutes * 60_000);
}

export function getSlaRemainingMs(deadline: Date, now = new Date()) {
  return deadline.getTime() - now.getTime();
}
