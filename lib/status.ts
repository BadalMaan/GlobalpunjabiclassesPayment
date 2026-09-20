export type PortalStatus = "PENDING" | "PROCESSING" | "VERIFYING" | "PAID" | "FAILED" | "REFUNDED";

export function statusLabel(status: string) {
  switch (status) {
    case "PAID": return "RECEIVED";
    case "PROCESSING": return "IN PROGRESS";
    case "VERIFYING": return "IN PROGRESS";
    case "FAILED": return "FAILED";
    case "REFUNDED": return "REFUNDED";
    default: return "PENDING";
  }
}

export function statusClass(status: string) {
  if (status === "PAID") return "statusReceived";
  if (status === "PROCESSING" || status === "VERIFYING") return "statusProgress";
  if (status === "FAILED" || status === "REFUNDED") return "statusFailed";
  return "statusPending";
}
