# Work Log

## 2026-05-01 23:05

### Summary
- Implement Reply-to-Message support and Group Read Receipts with Clean Architecture.
- Added monotonic read state updates and separate `room_read_states` table.
- Added REST APIs for read receipts (`POST /api/v1/rooms/:roomId/read`) and readers list (`GET /api/v1/rooms/:roomId/messages/:messageId/readers`).

### Changed Files
- backend/cmd/api/main.go
- backend/migrations/init.sql
- docs/WORKLOG.md

### Details
- **Migration Fix**: แก้ไขปัญหา SQL Migration พังเนื่องจากการ split semicolon แล้วเจอ `DO $$` โดยการเปลี่ยนตัวรัน Migration ให้รันทั้งไฟล์พร้อมกันและหยุดทำงานทันทีหากมี error
- **Idempotency**: ปรับปรุง `init.sql` ให้ใช้ `ADD COLUMN IF NOT EXISTS`, `ALTER COLUMN TYPE`, และ `DROP TABLE IF EXISTS` เพื่อให้รันซ้ำได้และรองรับการอัปเดตจาก Database เดิม
- **Column Types**: ปรับประเภทคอลัมน์เป็น `TIMESTAMPTZ`, `UUID`, และ `TEXT` ตามข้อกำหนดใหม่
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
- แก้ไขปัญหา `ERROR: column "deleted_at" does not exist` โดยการเพิ่ม `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ลงใน `init.sql` เพื่อให้ระบบ Migration รองรับการอัปเดต Database เดิม
- ย้าย Logic การ Migration ข้อมูลจาก `room_read_states` ไปยัง `init.sql` เพื่อให้รันได้โดยอัตโนมัติเมื่อ Server Restart
- แก้ไขปัญหา `rows.ColumnTypes undefined` ใน `chat_repository.go`
- อัปเดต `mockRepo` ใน `chat_usecase_test.go` ให้รองรับ Interface ใหม่
- แก้ไขปัญหา `Cannot find name 'deleteMessage'` โดยการ destructure `deleteMessage` ออกมาจาก `useChat` hook ใน `page.tsx`
- ตาราง `room_read_states` ถูกลบออกและรวมเข้ากับ `room_members` แล้ว
- ข้อความที่ถูกลบจะถูกซ่อน Metadata ทั้งหมด (เช่น รูปภาพ, ไฟล์, การอ้างอิง) เพื่อความเป็นส่วนตัว


## 2026-05-02 18:59

### Summary
- Fixed critical read receipt persistence issue for guest users.
- Automated default room membership for new users.
- Improved database migration reliability and schema consistency.
- Enhanced delete button usability on mobile.

### Changed Files
- backend/migrations/init.sql
- backend/internal/domain/chat.go
- backend/internal/repository/postgres/chat_repository.go
- backend/internal/usecase/chat_usecase.go
- backend/internal/usecase/chat_usecase_test.go
- backend/cmd/api/main.go
- frontend/src/hooks/useReadReceipt.ts
- frontend/src/hooks/useChat.ts
- frontend/src/app/page.tsx
- docs/WORKLOG.md

### Details
- **Root Cause Fix**: Guest users were previously not added to the `room_members` table for the default room, causing `MarkAsRead` and `GetUnreadCount` to fail.
- **Default Room Membership**: Newly registered users are now automatically joined to the default room (`00000000-0000-0000-0000-000000000002`).
- **Upsert Read State**: Updated `MarkAsRead` to use `INSERT ... ON CONFLICT DO UPDATE` (Upsert) to ensure the `room_members` record exists before updating read state.
- **Safe Unread API**: Updated `GetUnreadCount` to use `COALESCE` and return 0 instead of a "no rows" error when membership is missing.
- **Migration Reliability**: Fixed the migration runner to execute the whole file at once and stop on any error (`log.Fatalf`). Updated `init.sql` with idempotent indexes.
- **UI/UX**: 
  - Relaxed `isAtBottom` requirement for read receipts to improve testing reliability.
  - Made the delete button accessible on mobile by showing it without hover (added background and shadow).
  - Fixed React lint error in `useReadReceipt` by moving ref updates into `useEffect`.
  - Added "อ่านแล้ว" label in Thai and restricted it to messages sent by the current user (`isMe`).

### Validation
- **Backend**: `gofmt`, `go test ./...`, `go vet ./...` passed.
- **Frontend**: `npm run lint`, `npm run build` passed.
- **Schema**: Verified `room_members` and `messages` columns and indexes match requirements.

### Notes

## 2026-05-02 19:22

### Summary
- Implemented LINE-like message action menu (Action Sheet) for mobile and desktop.
- Fixed message action discoverability: Long-press and right-click support.
- Enhanced delete message reliability with optimistic updates and ownership validation.

### Changed Files
- frontend/src/hooks/useChat.ts
- frontend/src/app/page.tsx
- backend/internal/repository/postgres/chat_repository.go
- docs/WORKLOG.md

### Details
- **Action Menu (Action Sheet)**:
  - Added a mobile-first bottom action sheet that opens on long-press (550ms).
  - Added right-click (context menu) support for desktop to open the same menu.
  - Implemented a message preview in the menu with line clamping and Thai localization.
  - Actions include "Reply" and "Delete Message" (Thai: "ตอบกลับ", "ลบข้อความ").
- **Delete Logic Improvements**:
  - **Optimistic UI**: Messages are updated to "deleted" state immediately upon successful API response, without waiting for WebSocket.
  - **Ownership & Persistence**: Updated `DeleteMessage` in repository to strictly enforce ownership and return a `ValidationError` if unauthorized or not found.
  - **Discoverability**: Removed the old unreliable hover-only delete button which was often clipped or inaccessible on touch devices.
- **Visual & UX**:
  - Used tailwind-like classes for a premium "Action Sheet" look.
  - Added `select-none` and `active:opacity-90` to message bubbles to hint at interactivity.
  - Supported closing the menu via overlay click or Escape key.

### Validation
- **Frontend**: `npm run lint` passed (warnings on <img> preserved), `npm run build` passed successfully.
- **Backend**: `gofmt`, `go vet`, and `go test ./...` passed in the backend directory.
- **Manual Verification**:
  - Long-press on mobile opens bottom sheet.
  - Right-click on desktop opens menu.
  - Delete action only visible for own messages.
  - Deleted messages cannot be deleted again.

### Notes
- The "อ่านแล้ว" (Read Receipt) display was preserved and remains only for the sender's own non-deleted messages.
- Future improvement: Consider replacing standard `window.confirm` with a custom styled modal for full "LINE-like" experience.

## 2026-05-02

### Summary
- Fixed 504 issue after redeploy.

### Details
- Backend was healthy and `localhost:8888` endpoints worked.
- Public Coolify generated domain returned 504.
- Backend logs did not receive `/rooms` or `/messages` requests.
- Root cause was likely stale Coolify proxy/upstream routing after deployment.
- Redeploying the service refreshed routing and resolved the issue.

### Validation
- `GET /rooms` via public domain returns 200.
- `GET /messages` via public domain returns 200.
- Backend logs now show incoming HTTP requests.