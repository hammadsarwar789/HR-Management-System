# Maxenius HRMS - End-to-End System Workflows

## 1. Authentication & 2FA Lifecycle Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as React SPA
    participant Auth as Auth Blueprint
    participant Security as Security Engine
    participant DB as Database

    User->>Client: Enters Work Email & Password
    Client->>Auth: POST /api/v1/auth/login
    Auth->>DB: Query User by Email
    DB-->>Auth: User Record (totp_enabled=True)
    Auth-->>Client: HTTP 200 { requires_2fa: true, temp_token: "..." }
    Client->>User: Displays Step 2 TOTP Challenge (5:00 Timer)
    User->>Client: Enters 6-Digit Authenticator PIN
    Client->>Auth: POST /api/v1/auth/2fa/verify-login
    Auth->>Security: Verify TOTP Secret against Code
    Security-->>Auth: Validated
    Auth-->>Client: HTTP 200 { access_token: "...", user: {...} }
    Client->>Client: Save JWT in localStorage
    Client->>User: Navigate to /dashboard
```

---

## 2. Document Upload & Cross-User Sharing Flow

```mermaid
sequenceDiagram
    autonumber
    actor Sender
    participant Client as React SPA
    participant DocBP as Documents Blueprint
    participant Storage as File Vault (/uploads/)
    participant DB as Database
    actor Recipient

    Sender->>Client: Selects file, title, category, recipient
    Client->>DocBP: POST /api/v1/documents/share (Multipart FormData)
    DocBP->>Storage: Save file stream as doc_{uuid}.{ext}
    DocBP->>DB: Insert EmployeeDocument & DocumentShare
    DB-->>DocBP: Share Record Created (status='PENDING')
    DocBP-->>Client: HTTP 201 Success
    
    Note over Recipient: Recipient logs in or checks header Bell icon
    Recipient->>Client: Clicks "VIEW & DOWNLOAD" button
    Client->>DocBP: PATCH /api/v1/documents/shares/{id}/view
    DocBP->>DB: Update viewed_at=now(), status='ACKNOWLEDGED'
    Client->>DocBP: GET /api/v1/documents/{doc_id}/download?token={jwt}
    DocBP->>Storage: Read binary stream
    Storage-->>Recipient: Stream File Bytes to Browser Tab
```

---

## 3. Real-Time Notification & Read-State Synchronization Flow
1. **Trigger Event**: Uploader shares document or employee submits leave request.
2. **Database Write**: `DocumentShare` or `LeaveRequest` record inserted into database.
3. **Notification Polling / Fetch**: Frontend `DashboardLayout.tsx` calls `GET /api/v1/notifications` on layout mount or periodic intervals.
4. **Dynamic Aggregation**: Backend queries unviewed items where `viewed_at is Null` and recipient matches current user identity or role.
5. **Badge Render**: Header Bell icon displays red/teal unread dot or badge count (`unreadCount > 0`).
6. **State Sync**: Clicking document notification navigates to `/documents` and marks item as viewed upon download.

---

## 4. Profile Avatar Upload & Global Cache Update Flow
1. **File Selection**: User selects profile photo on `/profile`.
2. **Upload**: Client sends `POST /api/v1/employees/<emp_id>/avatar` with file payload.
3. **Sanitization**: Backend validates MIME type (`image/jpeg`, `image/png`), resizes image if needed, and saves file to `uploads/avatars/avatar_<uuid>.jpg`.
4. **State Refresh**: Backend returns updated relative URL `/uploads/avatars/avatar_<uuid>.jpg`.
5. **Global Sync**: React updates Zustand `authStore` user object and broadcasts avatar update to `DashboardLayout.tsx` header immediately.
