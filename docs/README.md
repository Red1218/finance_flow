# Documentation

Project documentation, organized by concern. Started with the Core
Transaction Loop feature (Expense/Income/Transfer CRUD) — the first
feature built against a written architecture.

- [`architecture/application-layer.md`](architecture/application-layer.md) — the Application layer: use cases, ports, composition root.
- [`architecture/transaction-architecture.md`](architecture/transaction-architecture.md) — the request flow from screen to database for a plain transaction.
- [`architecture/transfer-architecture.md`](architecture/transfer-architecture.md) — the transfer-pair invariant and atomic pair operations.
- [`architecture/rpc-security.md`](architecture/rpc-security.md) — the security contract for the transfer RPCs.
- [`architecture/domain.md`](architecture/domain.md) — Domain-owned types and business rules.
- [`architecture/presentation.md`](architecture/presentation.md) — implementation-relevant Presentation-layer changes.
- [`testing.md`](testing.md) — verified test results and known residual risks.
- [`traceability.md`](traceability.md) — requirement → Domain/Application/Infrastructure/Presentation/Tests mapping.
- [`status.md`](status.md) — project status and change log.
