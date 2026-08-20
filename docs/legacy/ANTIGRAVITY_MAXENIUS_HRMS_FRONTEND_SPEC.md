# Maxenius HRMS — Frontend Build Brief for Antigravity

Paste this whole file into Antigravity as the build specification. It is self-contained: design language, domain rules, API contract, routes, component inventory, and acceptance criteria.

---

## 0. Mission

Build the **complete production frontend** for **Maxenius HRMS**, an enterprise HR & Payroll platform for a Pakistani software house. Visual direction is **Modern Industrial**: dark engineered surfaces, precision grid layouts, technical monospace data, machined borders, teal/cyan signal accents. No soft consumer gradients, no purple, no playful illustration.

Backend already exists (Flask/PostgreSQL REST API). **Do not build a backend.** Consume the API described in Section 5. Every screen must degrade gracefully when the API is unreachable (skeletons, empty states, retry, typed error toasts).

---

## 1. Tech Stack (mandatory)

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript (strict) + Vite |
| Routing | React Router v6 (or file-based equivalent) |
| Data layer | TanStack Query v5 — all server reads/writes, no `useEffect` fetching |
| Forms | React Hook Form + Zod resolvers |
| Styling | Tailwind CSS v4 with semantic design tokens in one global CSS file |
| Components | shadcn/ui, restyled to the Industrial system (variants, never inline color classes) |
| Tables | TanStack Table (sorting, filtering, pagination, column visibility) |
| Charts | Recharts, themed from tokens |
| Icons | lucide-react |
| Dates | date-fns |
| Toasts | sonner |
| State | TanStack Query + minimal Zustand/Context for auth/session only |

Rules: strict TypeScript (no `any`), one file per component, colocated feature folders (`src/features/payroll/...`), all API access through a single typed `apiClient`.

---

## 2. Design System — "Modern Industrial"

Define every value as a CSS custom property token; components must never hardcode hex or `text-white`/`bg-black`.

### 2.1 Palette (dark-first, single theme)

| Token | Value | Use |
|---|---|---|
| `--background` | `#020617` | App shell base |
| `--surface` | `#0F172A` | Panels, cards |
| `--surface-raised` | `#131C31` | Modals, drawers, popovers |
| `--border` | `rgba(255,255,255,0.08)` | Hairline machined edges |
| `--border-strong` | `rgba(255,255,255,0.16)` | Focus, table headers |
| `--foreground` | `#E8EEF7` | Primary text |
| `--muted-foreground` | `#8A99B0` | Labels, meta |
| `--primary` | `#14B8A6` (teal) | Primary actions, active nav |
| `--accent` | `#06B6D4` (cyan) | Overtime, data highlights |
| `--warning` | `#F59E0B` | Late arrival minutes, pending |
| `--destructive` | `#EF4444` | Rejections, deductions |
| `--success` | `#22C55E` | Approved, net payable |
| `--holdback` | `#2DD4BF` | 5% Security Holdback emphasis |

Charts: `--chart-1..5` derived from teal → cyan → amber → slate.

### 2.2 Industrial detailing (this is what makes it "industrial", apply consistently)

- **Panels, not floating cards**: 1px hairline borders, `rounded-md` max (6–8px), flat surfaces. Glass/blur allowed only on the top bar, login card, and modal overlays (`backdrop-blur-md`) — never on data tables.
- **Blueprint grid**: subtle 32px dotted/line grid background on the app shell and login screen at ~4% opacity.
- **Section headers**: uppercase, `tracking-[0.18em]`, 11px, muted, with a 1px rule extending to the right edge.
- **Stat plates**: KPI cards as instrument readouts — tiny uppercase label, large tabular-nums value, delta chip, thin teal bottom accent bar.
- **Data density**: 40px table rows, zebra-free, hairline row dividers, sticky header, monospace numerics right-aligned with `font-variant-numeric: tabular-nums`.
- **Status as engineered chips**: 1px bordered pills, uppercase 10px, colored border + 12% tint fill (never solid saturated fill).
- **Focus states**: 2px teal outline offset 2px. Keyboard navigation must be visible everywhere.
- **Motion**: 120–180ms ease-out, translate/opacity only. Skeleton shimmer for loading. No bouncy springs.
- **Typography**: `Plus Jakarta Sans` (UI) + `JetBrains Mono` (codes, CNIC, currency, timestamps, IDs). Load via `<link>` in the document head, not a CSS `@import` of a remote URL.

### 2.3 Layout shell

- Fixed left rail sidebar, 264px, collapsible to 72px icon rail; sections grouped: **Overview / People / Time / Finance / Resources / Governance**.
- Sticky top bar: breadcrumb, global search (`⌘K` command palette), department-scope pill, notification bell, role badge + avatar menu.
- Content max-width 1600px, 24px gutters, 12-column grid.
- Fully responsive: rail collapses to a sheet below `lg`, tables switch to stacked record cards below `md`.

---

## 3. Roles & RBAC (enforce in UI)

| Role | Access |
|---|---|
`Super Admin` | Everything, including `/audit` and settings
`HR Manager` | Employees, attendance, leave approval, payroll runs, assets, expenses, notices
`Department Manager` | Own department only: employees, attendance, leave/expense approval queues, performance reviews
`Employee` | Self-service: own profile, payslips, attendance punch, leave & expense requests, goals, notices

Implementation: `permissions[]` from login response drives a `<Can permission="payroll:approve">` guard component plus route guards. Hide, don't disable, forbidden nav items. Department Managers show a persistent scope pill: `SCOPE — SOFTWARE ENGINEERING`.

---

## 4. Domain Rules (must be reflected exactly in the UI)

- **Employee Code**: `EMP-001` — monospace, teal bordered badge.
- **CNIC**: masked input `XXXXX-XXXXXXX-X`, Zod-validated, monospace.
- **Employment Type**: `full_time | part_time | contract`.
- **Departments**: Software Engineering, Human Resources, Quality Assurance, Operations.
- **Currency**: always `PKR 1,234,567.00`, tabular numerals.
- **Standard shift**: 09:00–18:00 (9h).
  - Late arrival minutes = minutes after 09:00 on check-in → shown as `+12m` in `--warning`.
  - Early leaving minutes = minutes before 18:00 on check-out.
  - Overtime hours = time after 18:00, min 30 minutes → shown as `1.5h` in `--accent`.
- **Leave entitlements/year**: Casual 10d, Sick 10d, Annual Paid 14d (Annual requires HR approval). Balance deducts on approval, restores on rejection/cancellation. Render as `Used / Total` with a segmented progress meter and remaining-days readout.
- **Payroll formulas** (display them literally in a "Calculation Trace" panel):
  - `Security Deduction = Basic Salary × 0.05` (5% Security Holdback, escrowed monthly)
  - `Gross Pay = Basic Salary + Σ Allowances + Overtime Pay + Bonus`
  - `Net Pay = Gross Pay − (Tax Deducted + Security Deduction + Other Deductions)`
- **5% Security Holdback** gets a dedicated bordered highlight block in `--holdback` on the payroll table, employee salary modal, and payslip preview — labelled `5% SECURITY HOLDBACK — ESCROWED`.
- **Allowances**: JSON map (Housing / Medical / Transport / custom) — editable key-value repeater, live `Total Allowances` sum.
- **Assets**: tag `MX-LAP-101`; categories `laptop | mobile | sim | equipment`; statuses available / assigned / retired.
- **Audit action strings**: `payroll.run_triggered`, `leave.approved`, `salary.updated` — immutable, never editable in UI.
- **Biometric device**: `BIOMETRIC-GATE-01` ingestion events; UI has a simulate-punch panel.

---

## 5. API Contract

Base URL from `VITE_API_BASE_URL`, default `http://localhost:5000/api/v1`. Header `Authorization: Bearer <access_token>`. On `401`: clear session, redirect to `/login`, toast `Session expired`.

### Auth
- `POST /auth/login` → body `{ email, password }` → `{ access_token, user: { id, email, role, permissions[], employee } }`
- `GET /auth/me` → `{ user }`

### Employees
- `GET /employees?search=&department_id=&status=` → `{ employees[], total }`
  - employee: `{ id, employee_code, first_name, last_name, cnic, department_name, designation, status }`
- `POST /employees` → `{ email, password, first_name, last_name, cnic, employee_code, designation, department_id, basic_salary, security_deduction_rate, tax_bracket_rate, joining_date }`

### Attendance
- `GET /attendance?employee_id=&from=&to=` → `{ attendance: [{ id, employee_name, date, check_in, check_out, status, late_minutes, overtime_hours, device_id }] }`
- `POST /attendance/check-in`, `POST /attendance/check-out`
- `POST /attendance/biometric-ingest` → `{ employee_code, timestamp, device_id, event_type }`

### Leave
- `GET /leave/types`
- `GET /leave/balances/{employee_id}` → `{ year, balances: [{ leave_type_name, allocated_days, used_days, remaining_days }] }`
- `GET /leave/requests`, `POST /leave/requests` → `{ leave_type_id, start_date, end_date, reason }`
- `PUT /leave/requests/{id}/approve`, `PUT /leave/requests/{id}/reject` → `{ rejection_reason }`

### Payroll
- `GET /payroll/runs` → `{ payroll_runs: [{ id, employee_name, employee_code, month_year, basic_salary, total_allowances, overtime_pay, tax_deducted, security_deduction, net_salary, status }] }`
- `POST /payroll/runs` → `{ year, month }`
- `GET /payroll/runs/{id}/payslip-pdf` → binary PDF (download via blob)

### Remaining
- `GET|POST /assets`, `POST /assets/{id}/assign`, `POST /assets/{id}/return`
- `GET|POST /expenses`, `PUT /expenses/{id}/approve`
- `GET /performance/goals`, `GET /performance/reviews`
- `GET /holidays`, `GET /holidays/announcements`
- `GET /audit-logs`

Generate Zod schemas for every response and parse at the boundary; types flow from the schemas.

---

## 6. Routes & Screen Requirements

```
/login        Industrial login panel: grid backdrop, wordmark plate "MAXENIUS HRMS ENTERPRISE",
              email/password, inline validation, 4 quick demo role buttons, error banner.
/dashboard    KPI plates: Total Staff, Present Today, Pending Leaves, Monthly Payroll status.
              Attendance trend chart (14d), department headcount bar, announcements feed,
              quick check-in/out widget with live shift clock and today's punch state.
/employees    Directory table (code, name, CNIC, department, designation, type, status, actions),
              search + department + status filters, add/edit side drawer with salary structure
              section (Basic Pay, Allowances repeater, Tax %, Security Holdback % locked at 5.0
              with override for Super Admin), employee detail page with tabs:
              Profile / Salary / Attendance / Leave / Assets / Performance.
/attendance   Date-range picker, daily log table with +Xm late (amber) and X.Xh overtime (cyan),
              punch in/out actions, monthly calendar heatmap, "Simulate Biometric Event" panel
              (employee code, timestamp, device, event type).
/leave        Entitlement meters (Casual/Sick/Annual: Used/Total/Remaining), request modal with
              live balance validation and day count, my requests table, approval queue with
              approve / reject (+ rejection reason) for managers.
/payroll      Month/year selector, "Run Batch Payroll" with confirm dialog and progress state,
              payroll table with earnings vs deductions column groups, 5% Security Holdback
              highlight column + summary block, expandable Calculation Trace row,
              payslip preview sheet, PDF download.
/assets       Registry table (asset tag, category, model, serial, status, holder), serial search,
              assign-to-employee modal, mark returned, category summary plates.
/expenses     Submit claim form (category, amount, description, receipt upload), my claims list,
              reimbursement approval queue with totals by status.
/performance  Goal cards per cycle with status, KPI score breakdown out of 5.0 (radial/segmented
              gauge), reviewer feedback panel, review history.
/notices      Announcements feed with category chips, holiday timeline for the year
              (public vs company holidays visually distinguished).
/audit        Super Admin only: activity log table (timestamp, user, action badge, entity),
              action/user/date filters, JSON metadata inspector drawer.
```

Every route: unique document title and meta description, breadcrumb, loading skeletons, empty state, error state.

---

## 7. Component Inventory to Build

`AppShell`, `SidebarRail`, `TopBar`, `CommandPalette`, `Can`/`RoleGuard`, `StatPlate`, `SectionHeader`, `DataTable` (generic, typed), `StatusChip`, `MonoBadge`, `CurrencyCell`, `EmptyState`, `SkeletonPanel`, `ConfirmDialog`, `FormDrawer`, `AllowanceRepeater`, `LeaveBalanceMeter`, `PunchClockWidget`, `PayrollBreakdownTable`, `HoldbackHighlight`, `PayslipPreview`, `AssetAssignDialog`, `KpiGauge`, `AnnouncementFeed`, `HolidayTimeline`, `JsonInspector`, `AuditActionBadge`.

---

## 8. Quality Bar / Acceptance Criteria

1. All 11 routes implemented, navigable, and RBAC-gated; no dead links or placeholder pages.
2. Zero hardcoded colors in components — tokens and variants only.
3. Every list view: loading skeleton, empty state, error + retry, and working filters.
4. Every mutation: optimistic or invalidating TanStack Query update, toast feedback, disabled-while-pending buttons.
5. All currency in `PKR` with tabular numerals; all codes/CNIC/timestamps monospace.
6. 5% Security Holdback visibly emphasized in payroll, salary modal, and payslip.
7. Forms fully Zod-validated with inline field errors (CNIC format, date ranges, positive amounts, leave balance limits).
8. Keyboard accessible: focus rings, labelled inputs, ARIA on dialogs/tables, `⌘K` palette.
9. Responsive at 360 / 768 / 1280 / 1920.
10. `tsc --noEmit` and lint clean; no console errors in the browser.
11. Mock/fixture layer toggled by `VITE_USE_MOCKS=true` so the UI is fully demoable without the backend running.

---

## 9. Environment

```
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_USE_MOCKS=false
```

Demo credentials for the login quick-switch buttons: `admin@maxenius.com / Admin@123` plus equivalent HR Manager, Department Manager, and Employee accounts.

---

## 10. Explicit Non-Goals

No backend, database, or auth server work. No light theme or theme toggle. No purple/indigo consumer gradients. No marketing landing page. No client-side role elevation — permissions come only from the API.
