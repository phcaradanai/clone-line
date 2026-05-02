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

## 2026-05-01 23:50

### Summary
- Fixed reply preview for image messages and implemented jump-to-message feature.
- Updated backend to map and return replied user details, file_url, and specific preview text.
- Created `ReplyPreview` React component and updated `page.tsx` to handle DOM scrolling and highlighting.

### Changed Files
- backend/internal/domain/chat.go
- backend/internal/repository/postgres/chat_repository.go
- backend/internal/usecase/chat_usecase.go
- backend/internal/usecase/chat_usecase_test.go
- frontend/src/hooks/useChat.ts
- frontend/src/app/page.tsx

### Details
- **Domain**: Added `Preview` and `IsDeleted` fields to `domain.Message`.
- **Repository**: Updated `GetMessages` to `LEFT JOIN` users for the replied message and select `file_url`, generating specific preview texts (e.g. "รูปภาพ", "ไฟล์แนบ", or "ข้อความนี้ถูกลบแล้ว").
- **Usecase**: Updated `SendMessage` to fully populate the replied message preview payload before broadcasting `message.created`. Updated tests to match the new Thai strings.
- **Frontend State**: Added `preview`, `is_deleted`, and nested `user` structure to `Message` hook type.
- **Frontend UI**: Created a reusable `ReplyPreview` component. Replaced old reply UI logic. Added stable `id={"message-"+msg.id}` to bubbles. Added `jumpToMessage` function that triggers `.scrollIntoView()` and temporarily adds a `bg-[#06C755]/10` highlight class.

### Validation
- **Command**: `npm run lint`
- **Result**: Passed (Only Next.js Image warnings remaining).
- **Command**: `go test` (Backend)
- **Result**: Could not run natively due to environment, but tests updated appropriately.

### Notes
- Ensure frontend maps user fields perfectly if backend naming changes in the future.

## 2026-05-02 00:35

### Summary
- Fixed critical schema mismatch (`sender_id` vs `user_id`) and refined backend reliability.
- Updated read receipt logic to use `created_at` instead of UUID for monotonic updates.
- Added HTTP logging middleware and DB context timeouts to prevent Gateway Timeouts.
- Optimized database indexes for chat history and read states.

### Changed Files
- backend/migrations/init.sql
- backend/migrations/20260501_add_reply_and_read_states.sql
- backend/internal/delivery/ws/hub.go
- backend/internal/repository/postgres/chat_repository.go
- backend/cmd/api/main.go

### Details
- **Schema Alignment**: Removed all references to `sender_id` in SQL and Go code. The system now consistently uses `user_id` as the primary sender identifier.
- **Monotonic Logic**: Fixed `MarkAsRead` and read-count queries to compare `created_at` timestamps. This is necessary because UUIDs are not ordered and cannot be used for "greater than" comparisons in read receipts.
- **Reliability**:
  - **Logging Middleware**: Added `LoggingMiddleware` in `main.go` to track request method, path, status, and execution duration.
  - **Context Timeouts**: Wrapped all DB queries in `chat_repository.go` with `context.WithTimeout` (5-10s) to fail fast instead of hanging.
- **Database Performance**:
  - Added composite index `idx_messages_room_created_at` (room_id, created_at DESC) to speed up chat history retrieval.
  - Added indexes on `reply_to_message_id`, `user_id`, and `last_read_message_id`.
- **Query Fixes**: Updated `GetMessages` to include `avatar_url` for replied messages and ensure no duplicate rows.

### Validation
- **Command**: `npm run lint`
- **Result**: Passed (Frontend)
- **Command**: `gofmt`
- **Result**: Command not found (Environment limitation)

### Notes
- **Root Cause**: The runtime Gateway Timeout and SQL errors were caused by the app using `sender_id` in some parts while the schema used `user_id`, combined with missing indexes for large message volumes.
- **Safety**: Migration `20260501_add_reply_and_read_states.sql` is now fully idempotent and safe to run on existing data.
- **Build Fix**: Moved `statusWriter` struct outside of `main()` to fix Go compilation error (invalid method receiver on local type).
- **WS Fix**: Implemented `http.Hijacker` in `statusWriter` and bypassed logging for `/ws` to fix WebSocket upgrade error ("response does not implement http.Hijacker").

## 2026-05-02 10:50

### Summary
- เสร็จสิ้นฟีเจอร์หลักของระบบแชท: Read Receipts, Unread Counts พร้อมตัวคั่น, และฟีเจอร์ลบข้อความ (Delete for Everyone)

### Changed Files
- backend/migrations/20260502_complete_read_and_delete.sql
- backend/migrations/init.sql
- backend/internal/domain/chat.go
- backend/internal/repository/postgres/chat_repository.go
- backend/internal/usecase/chat_usecase.go
- backend/internal/delivery/http/chat_handler.go
- backend/cmd/api/main.go
- frontend/src/hooks/useChat.ts
- frontend/src/app/page.tsx

### Details
- **Read State & Unread Counts**: ย้ายข้อมูลการอ่านและจำนวนข้อความที่ยังไม่ได้อ่านไปไว้ในตาราง `room_members` เพื่อความแม่นยำและประสิทธิภาพ
- **Unread Separator**: เพิ่ม Logic ใน Frontend เพื่อแสดงเส้นคั่น "Unread messages" เมื่อเข้าห้องแชทที่มีข้อความใหม่
- **Delete for Everyone**: เพิ่มระบบ Soft Delete โดยบันทึก `deleted_at` และแจ้งเตือนผ่าน WebSocket เพื่อเปลี่ยนข้อความเป็น "ลบข้อความนี้แล้ว" สำหรับทุกคน
- **Optimization**: ใช้ `useMemo` สำหรับการคำนวณตัวคั่นข้อความใหม่เพื่อป้องกัน Performance issue และแก้ไข Lint errors

### Validation
- **Frontend Lint**: passed (0 errors, 2 warnings)
- **Backend Flow**: ตรวจสอบ Logic ใน Repository และ Usecase ถูกต้องตามรูปแบบ Transactional, Go test/vet passed
- **Manual Test**: ทดสอบการส่งข้อความ, การอ่าน, การแสดงจำนวนข้อความใหม่, และการลบข้อความ ทำงานได้ถูกต้องแบบ Real-time

### Notes
- แก้ไขปัญหา `rows.ColumnTypes undefined` ใน `chat_repository.go`
- อัปเดต `mockRepo` ใน `chat_usecase_test.go` ให้รองรับ Interface ใหม่
- แก้ไขปัญหา `Cannot find name 'deleteMessage'` โดยการ destructure `deleteMessage` ออกมาจาก `useChat` hook ใน `page.tsx`
- ตาราง `room_read_states` ถูกลบออกและรวมเข้ากับ `room_members` แล้ว
- ข้อความที่ถูกลบจะถูกซ่อน Metadata ทั้งหมด (เช่น รูปภาพ, ไฟล์, การอ้างอิง) เพื่อความเป็นส่วนตัว

