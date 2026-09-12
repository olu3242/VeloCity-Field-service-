# AI-Native Standard Service Job — Outcome Contract v1.0.0

## Result

A standard service request is complete only when Velocity can prove qualified
intake, governed provider assignment, execution evidence, customer-confirmed
completion, captured payment, an audit trail, and no unresolved dispute.

The existing 30-state job state machine remains the command authority. The
outcome contract is a durable projection that prevents a status such as
`completed` from being mistaken for a verified business outcome.

## REMOVE alignment

| Stage | Implementation |
| --- | --- |
| Result | Versioned `standard-service-job` contract with six evidence checkpoints |
| Examine | Derives truth from jobs, photos, history, payments, and disputes |
| Minimize | Ordinary progression is evaluated automatically after job events |
| Orchestrate | Existing ALICE, MAX, NOVA, REX, FINN, and GABRIEL handlers remain in place |
| Verify | `/api/jobs/:id/outcome` returns evidence, progress, next action, and verdict |
| Evolve | Contract versions are immutable identifiers; future behavior ships as a new version |

## Authority and failure behavior

- Customers, assigned providers, and tenant admins can read only outcomes for jobs they may access.
- Only the service role writes the outcome projection.
- The outcome evaluator never performs a job transition or financial action.
- Customer confirmation and unresolved disputes explicitly require human action.
- Projection failure is audited and does not replay a domain action that already succeeded.
- A cancelled, expired, or refunded job cannot receive a satisfied verdict.

## Certification path

1. Create a service request and verify the intake checkpoint.
2. Process automation and accept an eligible provider offer.
3. Check in, upload before evidence, approve a quote, and start work.
4. Upload after evidence and mark completion pending confirmation.
5. Confirm as the customer and capture payment once.
6. Query the outcome endpoint and require `verdict=satisfied`, `progressPercent=100`.
7. Repeat with an unresolved dispute and require `verdict=blocked`.

