# Maxenius HRMS - Architecture Decision Records (ADRs)

## ADR-001: Separation of Document Sharing Hub from ESS Profile

### Status
Accepted

### Context
Initially, team file sharing, cross-user document handovers, and policy broadcasts were nested inside the Employee Self-Service (ESS) Profile page (`/profile`). This created UI clutter, confused private employee documents (CNIC, Passport, Degrees) with team collaborative assets, and restricted advanced search and category filtering.

### Decision
Separated the workflows into two distinct modules:
1. **My ESS Profile (`/profile`)**: Focuses exclusively on personal employee information and private vault documents (`MY PRIVATE VAULT`).
2. **Dedicated Document Hub (`/documents`)**: A full-featured workspace under the `PEOPLE` navigation group with KPI stat widgets, search/filter bars, category tags, outbox/inbox tabs, and a dedicated Share File modal.

### Consequences
- **Positive**: Clean separation of concerns, improved user privacy clarity, enhanced document searchability.
- **Negative**: Requires routing an additional page route (`/documents`).

---

## ADR-002: Dual Token Verification for Direct File Stream Downloads

### Status
Accepted

### Context
Standard HTML links (`<a href="..." target="_blank">`) do not send custom HTTP headers like `Authorization: Bearer <token>`. When users clicked "VIEW & DOWNLOAD" on a document, browser tab requests were rejected with `401 Missing Authorization Header`.

### Decision
Enhanced `get_current_user()` and `@jwt_required(optional=True)` to accept JWT authentication via:
1. Standard HTTP `Authorization: Bearer <token>` headers (for AJAX/Axios API requests).
2. URL query string parameter `?token=<access_token>` (for direct browser tab link navigation).

### Consequences
- **Positive**: Eliminates 401 errors when opening files in new browser tabs while preserving full JWT security and user access verification.
- **Negative**: Access tokens may appear in browser URL histories; mitigated by short JWT expiration lifetimes.

---

## ADR-003: Dynamic Aggregation for Notification Center

### Status
Accepted

### Context
Maintaining a separate static notifications database table requires complex trigger logic across multiple database entities (leaves, expenses, asset requests, documents, holidays).

### Decision
Implemented a dynamic notification aggregator in `GET /api/v1/notifications` that queries live models (`LeaveRequest`, `ExpenseRequest`, `AssetRequest`, `DocumentShare`, `Announcement`) for items needing user attention.

### Consequences
- **Positive**: Zero database desynchronization risk; notifications always reflect real-time underlying object states.
- **Negative**: Requires executing lightweight query joins on notification endpoint fetch.
