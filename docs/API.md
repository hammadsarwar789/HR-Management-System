# Maxenius HRMS - API Reference Documentation

## Base URL
All API requests are prefixed with `/api/v1`.

---

## 1. Authentication & Security Module (`/api/v1/auth`)

### 1.1 `POST /auth/login`
Authenticates user credentials and checks 2FA status.
- **Request Body** (`application/json`):
  ```json
  {
    "email": "user@maxenius.com",
    "password": "Password123"
  }
  ```
- **Response 200 (2FA Required)**:
  ```json
  {
    "requires_2fa": true,
    "temp_token": "eyJhbGciOi..."
  }
  ```
- **Response 200 (Success)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "user": {
      "id": "usr_123",
      "email": "user@maxenius.com",
      "role": "Super Admin"
    }
  }
  ```

### 1.2 `POST /auth/2fa/verify-login`
Verifies TOTP 6-digit PIN or 8-character recovery code.
- **Request Body** (`application/json`):
  ```json
  {
    "temp_token": "eyJhbGciOi...",
    "code": "123456"
  }
  ```
- **Response 200**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "user": { ... }
  }
  ```

---

## 2. Employee Profile & Directory Module (`/api/v1/employees`)

### 2.1 `GET /employees`
Retrieves employee directory list with filtering and search options.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "employees": [
      {
        "id": "emp_01",
        "first_name": "Ali",
        "last_name": "Khan",
        "work_email": "ali@maxenius.com",
        "department": "Engineering",
        "designation": "Senior Developer",
        "profile_picture": "/uploads/avatars/avatar_123.jpg"
      }
    ]
  }
  ```

### 2.2 `POST /employees/<emp_id>/avatar`
Uploads or updates an employee avatar photo.
- **Headers**: `Authorization: Bearer <access_token>`
- **Payload** (`multipart/form-data`):
  - `file` or `avatar`: `image/jpeg` or `image/png`
- **Response 200**:
  ```json
  {
    "message": "Avatar updated successfully",
    "profile_picture": "/uploads/avatars/avatar_123.jpg"
  }
  ```

---

## 3. Dedicated Document Hub Module (`/api/v1/documents`)

### 3.1 `POST /documents/share`
Uploads a binary document file and creates access shares for targeted users or roles.
- **Headers**: `Authorization: Bearer <access_token>`
- **Payload** (`multipart/form-data`):
  - `file` or `document`: File object (PDF, JPG, PNG, DOCX)
  - `title`: `string`
  - `category`: `HANDOVER | MEDICAL | EXPENSE_RECEIPT | CONTRACT | GENERAL`
  - `permission`: `VIEW | DOWNLOAD`
  - `recipient_id` (optional): `string`
  - `target_role` (optional): `LINE_MANAGER | HR_ADMIN | ALL`
  - `note` (optional): `string`
- **Response 201**:
  ```json
  {
    "message": "Document uploaded and shared successfully",
    "share": {
      "id": "sh_123",
      "document_id": "doc_456",
      "permission": "VIEW",
      "shared_at": "2026-08-15 01:20"
    }
  }
  ```

### 3.2 `GET /documents/shared-with-me`
Retrieves documents shared with the authenticated user.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "shared_documents": [
      {
        "share_id": "sh_123",
        "document_id": "doc_456",
        "title": "Q3 Performance Breakdown",
        "category": "HANDOVER",
        "file_url": "/uploads/documents/doc_123.pdf",
        "uploader_name": "Ali Khan",
        "permission": "VIEW",
        "status": "ACKNOWLEDGED",
        "shared_at": "2026-08-15 01:20",
        "viewed_at": "2026-08-15 01:22"
      }
    ]
  }
  ```

### 3.3 `GET /documents/<doc_id>/download`
Streams the binary document content. Supports JWT header or `?token=<access_token>` parameter.
- **Query Parameter**: `token` (optional if Authorization header is supplied)
- **Response 200**: Binary File Stream (`application/pdf`, `image/jpeg`, etc.)

### 3.4 `PATCH /documents/shares/<share_id>/view`
Marks a document share as viewed/acknowledged.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "message": "Document share acknowledged",
    "share_id": "sh_123",
    "status": "ACKNOWLEDGED",
    "viewed_at": "2026-08-15 01:22"
  }
  ```

---

## 4. Notification Center Module (`/api/v1/notifications`)

### 4.1 `GET /notifications`
Retrieves all real-time in-app notifications for the authenticated user.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "notifications": [
      {
        "id": "doc-share-sh_123",
        "type": "document_share",
        "title": "📄 New Document Shared",
        "message": "Ali Khan shared a document with you: 'Q3 Performance Breakdown'",
        "url": "/documents",
        "timestamp": "2026-08-15 01:20",
        "unread": true,
        "badge_color": "amber"
      }
    ],
    "unread_count": 1
  }
  ```

---

## 5. Real-Time Chat, Pre-Signed Files & HR AI Chatbot Module (`/api/v1/chat`)

### 5.1 `GET /chat/channels`
Fetch list of group channels and 1-on-1 direct messages for the authenticated user.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "channels": [
      {
        "id": "ch_uuid",
        "name": "general",
        "is_direct_message": false,
        "is_private": false,
        "member_count": 5,
        "last_message": {
          "content": "Welcome to #general!",
          "sender_type": "bot",
          "created_at": "2026-08-18T12:00:00Z"
        }
      }
    ]
  }
  ```

### 5.2 `POST /chat/channels`
Create a group channel or 1-on-1 Direct Message.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body** (`application/json`):
  ```json
  {
    "name": "project-launch",
    "is_private": false,
    "member_ids": ["usr_123", "usr_456"]
  }
  ```
- **Response 201**:
  ```json
  {
    "channel_id": "ch_uuid",
    "created": true
  }
  ```

### 5.3 `POST /chat/files/presigned-url`
Request a time-limited AWS S3 / MinIO pre-signed upload URL for direct client binary upload.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body** (`application/json`):
  ```json
  {
    "channel_id": "ch_uuid",
    "file_name": "quarterly_report.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 1048576
  }
  ```
- **Response 200**:
  ```json
  {
    "attachment_id": "att_uuid",
    "mode": "s3",
    "upload_url": "https://s3.amazonaws.com/bucket/channels/...",
    "storage_path": "channels/ch_uuid/1723980000_quarterly_report.pdf",
    "expires_in": 900
  }
  ```

### 5.4 `GET /chat/files/download/<attachment_id>`
Generates a time-limited pre-signed download URL after verifying channel membership.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response 200**:
  ```json
  {
    "download_url": "https://s3.amazonaws.com/bucket/...",
    "file_name": "quarterly_report.pdf",
    "mime_type": "application/pdf"
  }
  ```

### 5.5 WebSocket Event Specification (Socket.IO)
- **`chat:join_channel`**: `{ "channel_id": "ch_uuid" }` — Subscribes socket to channel room.
- **`chat:send_message`**: `{ "channel_id": "ch_uuid", "sender_id": "usr_id", "content": "Hello @HRBot", "attachment_ids": [] }` — Broadcasts message to room and triggers async RAG bot pipeline if `@HRBot` is mentioned.
- **`chat:message_received`**: Emitted by server when new message or AI bot chunk completes.
- **`chat:typing`**: `{ "channel_id": "ch_uuid", "user_name": "Alice", "is_typing": true }` — Ephemeral typing indicator.
- **`chat:presence_changed`**: `{ "user_id": "usr_id", "status": "online" | "offline" }` — Online presence event.

