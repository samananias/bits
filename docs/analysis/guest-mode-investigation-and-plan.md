# BITS Guest Mode — Research, Investigation, and Implementation Plan

## 1. Branch Status

- **Repository**: `samananias/bits` (Local: `c:\antigravity-proj\samananias-org\bits`)
- **Active Branch**: `feature/guest-mode` (created and switched from `main`)
- **Base Commit**: `06b0df8 feat: link zkteco-simulator-app as submodule`
- **Working Tree State**:
  - The uncommitted change adding `docs/` to `.gitignore` was preserved and remains staged.
  - No existing code, commits, or files were overwritten, reset, or discarded.
  - The feature branch is ready for review and implementation planning.

---

## 2. Current Architecture (Codebase Investigation)

All findings below were verified by inspecting active files in `frontend/` and `backend/`:

### 2.1 Framework & Architecture
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.
- **Backend**: Express.js 5, TypeScript, Prisma ORM 6, PostgreSQL 15.
- **Routing & Proxy**:
  - Next.js edge proxy at [`frontend/src/proxy.ts`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/proxy.ts) intercepts all non-static requests before page render, checking for `auth_token` or `refresh_token` cookies. Unauthenticated requests are redirected to `/login?from=<pathname>`.
  - Next.js rewrites in [`frontend/next.config.ts`](file:///c:/antigravity-proj/samananias-org/bits/frontend/next.config.ts) forward all `/api/:path*` calls to `BACKEND_URL` (`http://localhost:3001` or `http://backend:3001`), unless handled by a Next.js route handler.

### 2.2 Authentication & Session Flow
- **Login**: Handled by `POST /api/auth/login` in [`backend/src/modules/auth/auth.controller.ts`](file:///c:/antigravity-proj/samananias-org/bits/backend/src/modules/auth/auth.controller.ts).
- **Credentials**: Email or employee number matched against the `Employee` model; password verified using bcrypt (`bcryptjs`).
- **Tokens**:
  - `auth_token` (Access token): Signed JWT (`HS256`, `process.env.JWT_SECRET`, 1-hour expiration).
  - `refresh_token`: Signed JWT (7-day expiration), saved to the `RefreshToken` table in PostgreSQL with a maximum session cap of 5 concurrent sessions per user.
- **Cookie Delivery**:
  - Cookies are set as `HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` (`process.env.COOKIE_SECURE === 'true'`).
  - Next.js route handler at [`frontend/src/app/api/auth/login/route.ts`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/api/auth/login/route.ts) relays cookies from Express to the client browser and strips raw token strings from the JSON payload so tokens never touch browser JavaScript or localStorage.
- **Backend Verification**:
  - Handled by `authenticate` in [`backend/src/shared/middleware/auth.middleware.ts`](file:///c:/antigravity-proj/samananias-org/bits/backend/src/shared/middleware/auth.middleware.ts).
  - Extracts JWT from `auth_token` cookie (or `Authorization: Bearer <token>`).
  - Executes a fresh database query:
    ```typescript
    const freshUser = await prisma.employee.findUnique({
        where: { id: decoded.employeeId },
        select: { employmentStatus: true },
    });
    ```
  - If `freshUser` does not exist or `employmentStatus !== 'ACTIVE'`, it immediately terminates the session with a 401.

### 2.3 Role Definition & Verification
- **Roles**: Defined as Prisma enum `Role` in [`backend/prisma/schema.prisma`](file:///c:/antigravity-proj/samananias-org/bits/backend/prisma/schema.prisma#L488):
  ```prisma
  enum Role {
    USER
    HR
    MANAGER
    ADMIN
  }
  ```
  *(Note: There is currently no `GUEST` role in Prisma or the backend).*
- **Backend Authorization**:
  - Enforced by `authorize(['ADMIN', ...])` in [`backend/src/shared/middleware/role.middleware.ts`](file:///c:/antigravity-proj/samananias-org/bits/backend/src/shared/middleware/role.middleware.ts).
  - Checks if `req.user.role` is in the allowed array. If not, returns `403 Forbidden`.
  - Helpers include `adminOnly`, `adminOrHR`, `managerOrAdmin`, `adminManagerOrHR`, `managerOnly`.
  - Additional scoping: [`departmentScope.middleware.ts`](file:///c:/antigravity-proj/samananias-org/bits/backend/src/shared/middleware/departmentScope.middleware.ts) restricts `MANAGER` queries to their assigned department IDs (`ManagerDepartment` table).

### 2.4 Dashboard & Portal Layout Architecture
The four portals have separate route directories and layouts, but share feature widgets:

| Portal | Route Prefix | Layout File | Guard Hook | Rendered Dashboard View |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `app/(admin)/*` | [`app/(admin)/layout.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/%28admin%29/layout.tsx) | `useAuth('ADMIN')` | `<DashboardPage role="admin" />` |
| **HR** | `app/hr/*` | [`app/hr/layout.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/hr/layout.tsx) | `useAuth('HR')` | `<DashboardPage role="hr" />` |
| **Manager** | `app/manager/*` | [`app/manager/layout.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/manager/layout.tsx) | `useAuth('MANAGER')` | `<ManagerDashboardPage />` |
| **Employee** | `app/(employee)/*` | [`app/(employee)/layout.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/%28employee%29/layout.tsx) | `useAuth('USER')` | `<OverviewDashboard />` |

- **Guard Mechanism**:
  - The [`useAuth`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/hooks/useAuth.ts) hook calls `GET /api/auth/me`.
  - If `requiredRole` does not match `employee.role`, it calls `router.replace('/login')`.
  - Therefore, an authenticated user cannot view another role's dashboard without changing their backend role or being blocked by the frontend guard.

### 2.5 Mutations & File Uploads
- Mutations (POST, PUT, PATCH, DELETE) exist throughout the backend (`/api/employees`, `/api/attendance`, `/api/shifts`, `/api/devices`, `/api/holidays`, `/api/departments`, etc.).
- Avatar uploads are handled by Multer in [`profilePicture.validator.ts`](file:///c:/antigravity-proj/samananias-org/bits/backend/src/modules/profile-picture/profilePicture.validator.ts), writing to the local filesystem at `backend/uploads/avatars/`.
- There is currently no global middleware blocking state mutations for demo or guest users.

---

## 3. Research Findings (Evidence & Best Practices)

### A. Guest Access and Read-Only Security
1. **OWASP Broken Access Control (A01:2021)**:
   - *Evidence*: [OWASP Top 10:2021 A01](https://owasp.org/Top10/A01_2021-Broken_Access_Control/) and [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
   - *Principle*: Client-side disabled or hidden buttons are strictly UX enhancements and provide zero security. An attacker can easily send direct `POST`, `PUT`, `PATCH`, or `DELETE` HTTP requests using browser developer tools, cURL, or Postman.
   - *Implication for BITS*: Every single mutation request from a guest session must be intercepted and rejected on the backend with `403 Forbidden` (`read_only_guest_mode`). A global Express middleware must act as a catch-all guard.
2. **Protection Against Sensitive Data Exposure (CWE-200 / OWASP A02:2021)**:
   - *Evidence*: [OWASP Cryptographic Failures & PII Protection](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/).
   - *Principle*: Real employee data—such as personal phone numbers, salary rates, email addresses, emergency contacts, and biometric templates—must never be displayed in a public or guest demonstration environment.
   - *Implication for BITS*: If the guest mode connects to the main database containing real company data, data masking or a dedicated sanitized demo database/seed must be used.

### B. Role Switching in Demonstration Modes
1. **Separation of True Identity from Active View Context**:
   - *Evidence*: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and NIST SP 800-63C.
   - *Principle*: In applications supporting user delegation or role viewing, the active session token must explicitly distinguish between the base identity (`isGuest: true`) and the active view role (`guestViewRole: 'ADMIN' | 'HR' | 'MANAGER' | 'USER'`).
   - *Implication for BITS*: Switching the active view role must **never** grant actual administrative write capabilities. The system must treat the guest's permissions as strictly read-only, regardless of which dashboard layout is selected.
2. **Preventing Administrative Confusion**:
   - When switching views, the UI must explicitly remind the visitor of their synthetic context (e.g., *"Guest Mode — Viewing as HR (Read-Only)"*), preventing them from assuming they have gained actual corporate administrative rights.

### C. UX Best Practices for Demo & Guest Modes
1. **Radical State Transparency**:
   - *Evidence*: Nielsen Norman Group (NN/g) Usability Heuristic #1: Visibility of System Status.
   - *Guideline*: A persistent, non-dismissible global banner positioned at the top of the viewport anchors the user's mental model. It communicates the active mode, current role view, and provides an exit path.
2. **Handling Restricted Actions (Disclose vs. Intercept)**:
   - *Guideline*: Primary action buttons (e.g., "Add Employee", "Create Shift", "Delete Device") should remain visible but disabled or adorned with a subtle badge/tooltip.
   - When clicked, a non-intrusive modal or toast informs the user:
     > *"This action is disabled in Guest Mode. Sign in with an authorized account to make changes."*
   - Completely hiding buttons makes the demo feel incomplete, whereas disabling them with feedback demonstrates full product capabilities without allowing modifications.

---

## 4. Security & UX Risk Assessment

| Risk Area | Specific Threat | Severity | Technical Countermeasure |
| :--- | :--- | :---: | :--- |
| **Data Tampering** | Attacker calls `DELETE /api/employees/1` with a guest token | **Critical** | Server-side Express middleware blocks all non-`GET` methods for guests |
| **PII Exposure** | Visitor inspects real employee phone numbers and contact details | **High** | Data masking middleware or isolated synthetic database |
| **Privilege Escalation** | Guest modifies JWT payload or cookie to become a real `ADMIN` | **Critical** | JWT cryptographically signed with `JWT_SECRET`; strict role verification |
| **Resource Exhaustion** | Bots spam heavy export endpoints (`/api/reports/export-excel`) | **Medium** | Rate limiting specifically tuned for guest sessions; restrict heavy exports |
| **Session Bleed** | Authenticated user logs in, but remains trapped in guest mode | **Medium** | Clear guest cookies upon standard login; enforce clean cookie isolation |
| **User Confusion** | Visitor thinks edits were saved, only to lose them on refresh | **Medium** | Global persistent banner and explanatory modal on form submits |

---

## 5. Architectural Solution Comparison

We evaluated three viable architectural approaches for BITS Guest Mode:

| Evaluation Criteria | Option 1: Ephemeral Guest JWT + Dynamic Role View (Recommended) | Option 2: Pre-Seeded Static Demo Accounts | Option 3: Separate Isolated Sandbox Database |
| :--- | :--- | :--- | :--- |
| **Concept** | Single "Explore as Guest" entry. Generates an ephemeral guest JWT with an active `viewRole`. Role switcher updates the view role. Global middleware blocks all mutations. | 4 pre-seeded demo accounts in DB (`guest.admin@demo.com`, etc.). User logs in normally to each one or uses quick-login buttons. | Standalone Docker container or database replica with synthetic data. |
| **Security & Mutation Protection** | **High**: Server-side middleware intercepts all non-GET requests when `isGuest === true`. Zero risk of DB writes. | **Medium**: Requires individual permission checks or separate DB user to prevent demo users from editing demo data. | **Highest**: Even if write operations occur, they only affect isolated sandbox data. |
| **User Experience (Role Switching)** | **Seamless**: Visitor switches between Admin, HR, Manager, and Employee dashboards in 1 click without logging out. | **Fragmented**: Visitor must log out and re-login with a different credential to change views. | Depends on whether Option 1 or 2 is implemented within the sandbox. |
| **Implementation Complexity** | **Low to Moderate**: 1 new auth route, 1 Express middleware, update `useAuth`, and 1 persistent banner component. | **Low**: Add 4 seeded users and UI buttons, but requires managing account states and reset scripts. | **High**: Requires duplicate infrastructure, DB sync pipelines, and multi-tenant routing. |
| **Data Exposure Risk** | Low if using masked data or synthetic seed; moderate if viewing live operational data. | Same as Option 1. | **Zero**: Uses 100% synthetic mock data. |
| **Impact on Authenticated Users** | **Zero**: Existing auth flows and DB records remain completely untouched. | Low, but pollutes the `Employee` table with static demo accounts. | **Zero**: Completely isolated. |

---

## 6. Recommended Design

We recommend **Option 1 (Ephemeral Guest Session with Dynamic Role-View & Global Mutation Blocker)**, combined with **synthetic data alignment**:

### 6.1 Guest Entry Flow
1. On the login page ([`frontend/src/app/(auth)/login/page.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/app/%28auth%29/login/page.tsx)), add a prominent button: **"Explore Demo as Guest"** below the standard login form.
2. Clicking this calls `POST /api/auth/guest-login`.
3. The server issues an ephemeral `auth_token` with claims:
   ```json
   {
     "isGuest": true,
     "employeeId": 0,
     "guestViewRole": "ADMIN",
     "name": "Guest Visitor",
     "email": "guest@bits.demo"
   }
   ```
4. Sets the `auth_token` cookie and redirects to `/dashboard` (Admin Overview).

### 6.2 Role Switching Mechanism
1. A persistent, high-contrast banner appears at the very top of all pages when `isGuest === true`:
   - Text: `⚠️ Guest Mode (Read-Only)`
   - Role Switcher Segmented Control: `[ Admin | HR | Manager | Employee ]`
   - Action Button: `[ Exit Demo ]`
2. Selecting a role (e.g., `HR`):
   - Calls `POST /api/auth/guest-view` with `{ role: 'HR' }` (or updates a client cookie).
   - Server re-issues the short-lived guest token with `guestViewRole: 'HR'`.
   - Client navigates to `/hr/dashboard`.

### 6.3 Server-Side Enforcement (The Immutable Guard)
1. In `backend/src/shared/middleware/auth.middleware.ts`:
   - If `decoded.isGuest === true`, skip the `prisma.employee.findUnique` check and attach:
     ```typescript
     req.user = {
         employeeId: 0,
         role: decoded.guestViewRole,
         isGuest: true,
         name: 'Guest Visitor'
     };
     ```
2. In a new global middleware (`backend/src/shared/middleware/guestGuard.middleware.ts`):
   ```typescript
   export const guestGuard = (req: Request, res: Response, next: NextFunction) => {
       if (req.user?.isGuest) {
           const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
           if (!SAFE_METHODS.includes(req.method)) {
               return res.status(403).json({
                   success: false,
                   message: 'Guest Mode is read-only. Modifications, creations, and file uploads are disabled in demo mode.',
                   error: 'guest_read_only'
               });
           }
       }
       next();
   };
   ```
   This ensures that **100% of mutation attempts across every endpoint in BITS are rejected automatically**.

### 6.4 Frontend Adaptation
1. Update [`frontend/src/hooks/useAuth.ts`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/hooks/useAuth.ts):
   - Detect `employee.isGuest`.
   - Match `requiredRole` against `employee.guestViewRole`.
   - Provide `isGuest: boolean` in the hook's return state.
2. In all portal layouts (`AdminLayout`, `HRLayout`, `ManagerLayout`, `EmployeeLayout`):
   - Render the persistent `<GuestBanner />` above the topbar when `employee?.isGuest === true`.

---

## 7. Practical Implementation Plan (Step-by-Step)

> **Important**: No code modifications will be made until explicit user approval is received.

### Milestone 1: Backend Guest Authentication & Security Guard
- **Task 1.1**: Create `guestGuard.middleware.ts` in `backend/src/shared/middleware/`. Intercepts non-safe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) when `req.user.isGuest === true`.
- **Task 1.2**: Update `backend/src/shared/middleware/auth.middleware.ts` to decode guest tokens without requiring a database record.
- **Task 1.3**: Add `POST /api/auth/guest-login` and `POST /api/auth/guest-view` routes in `backend/src/modules/auth/auth.controller.ts` and `auth.routes.ts`.
- **Task 1.4**: Update `backend/src/app.ts` to mount `guestGuard` immediately after `authenticate`.

### Milestone 2: Frontend Edge Proxy & Auth Guard Integration
- **Task 2.1**: Update `frontend/src/hooks/useAuth.ts` to support guest mode claims and return `isGuest: boolean`.
- **Task 2.2**: Update `frontend/src/proxy.ts` (Next.js Edge Proxy) to allow guest navigation across all portal routes (`/(admin)`, `/hr`, `/manager`, `/(employee)`).
- **Task 2.3**: Update `frontend/src/app/api/auth/` route handlers if token relaying requires guest awareness.

### Milestone 3: UI/UX Implementation (Banner & Role Switcher)
- **Task 3.1**: Create `frontend/src/components/layout/shared/GuestBanner.tsx` featuring:
  - Persistent status indicator.
  - Role switcher dropdown/tabs (`Admin`, `HR`, `Manager`, `Employee`).
  - "Exit Guest Mode" button that calls `/api/auth/logout` and routes to `/login`.
- **Task 3.2**: Mount `GuestBanner` across the four portal layouts:
  - `AdminLayout.tsx`
  - `hr-layout.tsx`
  - `manager-layout.tsx`
  - `employee-layout.tsx`
- **Task 3.3**: Add the **"Explore as Guest"** button to `frontend/src/features/auth/components/LoginForm.tsx`.
- **Task 3.4**: Create a global toast/modal interceptor for disabled actions when guest visitors attempt to submit forms.

### Milestone 4: Security Verification & Regression Testing
- **Task 4.1**: Negative Authorization Tests:
  - Send direct cURL requests with a guest token: `POST /api/employees`, `DELETE /api/devices/1`, `POST /api/attendance/adjustments`, `POST /api/employees/1/profile-picture`. Verify all return `403 Forbidden`.
- **Task 4.2**: Regression Tests:
  - Verify real `ADMIN`, `HR`, `MANAGER`, and `USER` logins work normally with full read/write privileges.
- **Task 4.3**: Navigation Tests:
  - Verify seamless switching between all 4 dashboard views in guest mode without session loss.

---

## 8. Open Questions & Decisions Requiring User Approval

1. **Demo Data Strategy**:
   - *Question*: Should the guest mode run against the current local database using masked PII, or would you prefer a dedicated synthetic seed profile (such as the 5 fictitious employees seeded by the ZKTeco simulator)?
   - *Recommendation*: Use a dedicated synthetic seed profile or data masking so real contact details and emails are never displayed in demo mode.
2. **Session Expiry**:
   - *Question*: How long should a guest session remain active before expiring?
   - *Recommendation*: 30 to 60 minutes with auto-renewal on active exploration, cleared immediately if the browser tab closes.
3. **Role Switcher UI Location**:
   - *Question*: Should the role switcher live exclusively in the top persistent banner, or also be accessible in the top-right user profile menu?
   - *Recommendation*: Include it primarily in the top persistent banner for maximum visibility, with a secondary indicator in the top-right profile avatar.

---

## 9. Acceptance Criteria for Implementation

1. **Security**:
   - Any HTTP request with `method != 'GET'` sent by a guest token receives a `403 Forbidden` with `{ error: 'guest_read_only' }`.
   - File uploads via Multer are rejected before writing to disk.
   - Real user sessions remain 100% unaffected.
2. **User Experience**:
   - Visitors can enter guest mode with one click from the login screen.
   - Visitors can switch between Admin, HR, Manager, and Employee dashboards without logging out.
   - A persistent banner clearly identifies Guest Mode on both desktop and mobile viewports.
   - Clicking "Exit Demo" cleanly invalidates cookies and returns to `/login`.
