# Work Log

## 2026-05-01 23:05

### Summary
- Implement Reply-to-Message support and Group Read Receipts with Clean Architecture.
- Added monotonic read state updates and separate `room_read_states` table.
- Added REST APIs for read receipts (`POST /api/v1/rooms/:roomId/read`) and readers list (`GET /api/v1/rooms/:roomId/messages/:messageId/readers`).

### Changed Files
- backend/migrations/init.sql
- backend/internal/domain/chat.go
- backend/internal/repository/postgres/chat_repository.go
- backend/internal/usecase/chat_usecase.go
- backend/internal/delivery/http/chat_handler.go
- backend/internal/delivery/ws/handler.go
- backend/internal/delivery/ws/hub.go
- backend/cmd/api/main.go
- backend/internal/usecase/chat_usecase_test.go

### Details
- **Reply Support**: Added `reply_to_message_id` to `messages` table (without `ON DELETE SET NULL` FK so that deleted messages can still be identified as replies and replaced with a deleted preview). Updated `SaveMessage` and `GetMessages` queries to join the replied message.
- **Read States**: Migrated from `room_members` to a new `room_read_states` table. Implemented monotonic logic using Postgres `ON CONFLICT DO UPDATE ... WHERE ... > ...` to ensure `last_read_message_id` only moves forward based on `created_at`.
- **Clean Architecture**: Refactored websocket broadcasting into an `EventPublisher` interface injected into the Usecase. Now `SendMessage` and `MarkAsRead` handle their respective business logic and publish events uniformly.
- **API Endpoints**: Created `POST /read` for updating read state, and `GET /readers` for getting the list of users who have read a specific message.

### Validation
- **Command**: `go test ./... -v`
- **Result**: Failed (Environment Error)
- **Reason**: คำสั่ง `go` ไม่พบในระบบ (command not found: go) เนื่องจาก Environment ของ Agent ไม่มี Go ติดตั้งไว้ จึงไม่สามารถรัน Unit tests ที่เขียนไว้ใน `chat_usecase_test.go` ได้

### Notes
- เนื่องจากใน `room_members` เดิมมีการเก็บสถานะการอ่านไว้ แต่ได้ออกแบบใหม่เป็นตาราง `room_read_states` ถ้ามีข้อมูลเดิมอยู่ อาจจะต้องมี Migration Script แยกเพื่อโอนย้ายข้อมูล
- `GET /readers` กรอง sender และผู้ใช้ที่ไม่ได้อยู่ห้องแชทแล้ว (inactive members) ผ่านคำสั่ง `JOIN room_members` ตาม requirement

## 2026-05-01 23:23

### Summary
- Integrated Frontend with Reply-to-Message and Group Read Receipts backend APIs.
- Built Reply UI (Preview, Button, Input Banner) in `page.tsx`.
- Refactored `sendReadReceipt` to use REST API and updated WS handler.
- Added Readers List Modal for group read receipts.

### Changed Files
- frontend/src/hooks/useChat.ts
- frontend/src/app/page.tsx

### Details
- **useChat.ts**: Updated the `Message` interface to support `reply_to_message_id` and `reply_to_message`. Refactored `sendReadReceipt` to call the new REST API `POST /api/v1/rooms/:roomId/read`. Updated the WebSocket handler to listen for `room.read` and extract payloads from `message.created` properly.
- **page.tsx**: Added a `replyingToMessage` state to manage the active reply context. Added a Reply button to each message bubble. Rendered a preview snippet of the replied message inside message bubbles. Created a "Replying to..." banner above the input text area. Implemented a Readers List Modal (`fetchReaders`) that triggers when clicking the "Read {count}" text, calling `GET /api/v1/rooms/:roomId/messages/:messageId/readers` and displaying a popup list of users.

### Validation
- **Command**: `npm run typecheck`
- **Result**: Failed (Missing script: "typecheck" in package.json)
- **Command**: `npm run lint`
- **Result**: Passed (Fixed one warning related to exhaustive-deps `replyingToMessage?.id`).

### Notes
- None
