import "server-only"

// This module enforces server-only boundaries for runtime infrastructure.
// Import this at the top of any server-side orchestration, cognition, or
// telemetry aggregator module to prevent client-side bundle inclusion.
