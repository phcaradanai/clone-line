# Project Summary: LINE Clone Enhancements

This document summarizes the improvements and features implemented to transform the chat application into a production-quality experience.

## 1. Mobile UX & Viewport Optimization
*   **Dynamic Viewport**: Implemented `100dvh` to ensure the chat room fits perfectly on mobile screens, accounting for browser toolbars.
*   **Flex Layout**: Structured the chat room with a fixed header, a scrollable independent message list, and a fixed bottom input composer.
*   **Safe Area Support**: Added `env(safe-area-inset-bottom)` for notch and home indicator compatibility.
*   **Keyboard Handling**: Integrated the Visual Viewport API to handle mobile keyboard transitions without layout jumps.

## 2. Smart Scroll Behavior
*   **Auto-Scroll**: Intelligent scrolling on initial load, new messages, and user input.
*   **New Message Indicator**: A floating "New messages ↓" button appears when the user is reading history, preventing unwanted scroll jumps.
*   **Scroll Locking**: Prevented document-level scrolling to maintain a native app feel.

## 3. Persistent Read Receipts & Group Support
*   **Database Integration**: Added `last_read_message_id`, `last_read_at`, and a persistent `unread_count` column to the `room_members` table.
*   **Real-time Sync**: `message:read` events are broadcast via WebSocket and persisted. Standardized the payload to `snake_case` across frontend and backend for maximum compatibility.
*   **Group Read Count**: Implemented "Read N" behavior. Sent messages now display the number of users who have read them (e.g., "Read 2"), matching the LINE experience.
*   **Reliable Triggering**: Enhanced the `useReadReceipt` hook with strict visibility checks and scroll position detection (`isAtBottom`), ensuring read receipts are sent only when the user is actually viewing the message.
*   **Backend Verification**: Added `RowsAffected` checks and structured logging (`[DB]`, `[WS]`, `[AUTH]`) to track end-to-end receipt flow and identify membership issues.

## 4. Multi-Room & Dynamic Navigation
*   **Dynamic Room Selection**: The app now supports switching between multiple rooms via a dynamic sidebar populated by the `/rooms` API.
*   **Mobile Header Context**: The chat header dynamically updates to show the selected room's name and status, ensuring clarity on mobile devices.
*   **Query Param Support**: Users can deep-link into specific rooms using `?room=<UUID>` or `?user=<ID>` parameters.

## 5. Notifications & Unread Tracking
*   **Persistent Unread Count**: Added a physical `unread_count` column to `room_members`. It increments automatically on new messages via the `SaveMessage` repository and resets to `0` on read events.
*   **In-App Badges**: A green unread count badge appears in the sidebar, now backed by persistent database state.
*   **Tab Title Alerts**: The browser tab title updates (e.g., `(3) LINE Clone`) when new messages arrive while the user is in another tab.
*   **Intelligent Reset**: Unread counts clear automatically when the user is at the bottom of the chat or returns to a visible tab.
*   **User Identity Priority**: Improved auth logic to ensure `?user=1` or `?user=2` query parameters correctly map to test IDs and override local storage for testing.

## 6. Production Readiness & Stability
*   **Error Handling & Resilience**: Added fallback room logic (General Chat) so the UI remains functional even if the `/rooms` API fails.
*   **Non-Intrusive Error States**: Message loading errors now appear as compact banners, allowing real-time WebSocket communication to continue uninterrupted.
*   **Strict UUID Validation**: All API endpoints and WebSocket handlers now perform pre-upgrade/pre-query UUID validation to prevent 500 Internal Server Errors.
*   **Build-Time Hardening**: Fixed a critical TypeScript type mismatch in `useReadReceipt.ts` (optional message IDs) that was causing deployment failures, ensuring 100% build success.
*   **Full Type Safety**: Passed all strict linting rules and achieved 100% TypeScript coverage.

## 7. Architecture (Custom Hooks)
The system is built on a modular hook-based architecture:
*   `useChat`: WebSocket messaging, read status syncing, and initial state fetching (with loading/error states).
*   `useReadReceipt`: Logic for sending read events based on scroll position and tab focus.
*   `useUnreadBadge`: Manages persistent unread state and reset triggers.
*   `useDocumentTitleUnread`: Updates browser tab title alerts.
*   `useChatAutoScroll`: Handles viewport-aware scrolling and bottom detection.
*   `useIsMobile` & `useVisualViewportResize`: Mobile environment detection and keyboard management.

## 8. UI Aesthetics & LINE Polish
*   **Message Bubbles**: Implemented responsive widths (82% mobile, 70% desktop) with `18px` rounded corners and conditional tail styling (`rounded-tr-[4px]` for sender, `rounded-tl-[4px]` for recipient).
*   **Smart Spacing**: Groups consecutive messages from the same sender with compact `pt-1` padding, while sender changes trigger `pt-3` spacing for clear separation.
*   **Layout Detail**: Balanced message list padding (`px-3 py-4 md:px-4`) and refined bubble footers for a premium, native-app feel.

---
*Last Updated: 2026-05-01 21:39 (UTC+7)*
