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

## 3. Persistent Read Receipts
*   **Database Integration**: Added `last_read_message_id` and `last_read_at` to the backend schema in PostgreSQL.
*   **Real-time Sync**: `message:read` events are broadcast via WebSocket and persisted to the database.
*   **UI Status**: Sent messages display a "Read" label once confirmed by other members, even after a page refresh.
*   **Group Support**: Read status is calculated based on the collective read progress of room members.

## 4. Notifications & Unread Tracking
*   **Persistent Unread Count**: Unread messages are calculated by the backend and fetched on initialization, ensuring the badge survives browser restarts.
*   **In-App Badges**: A green unread count badge appears in the sidebar.
*   **Tab Title Alerts**: The browser tab title updates (e.g., `(3) LINE Clone`) when new messages arrive while the user is in another tab.
*   **Intelligent Reset**: Unread counts clear automatically when the user views the latest messages or returns to a visible tab.

## 5. Production Readiness & Stability
*   **Full Type Safety**: Resolved all TypeScript errors and enforced strict literal types for `sender` and `type`.
*   **Clean Linting**: Fixed React Hook linting errors and ensured efficient rendering cycles.
*   **Robust Time Handling**: Implemented safe date parsing with fallbacks to prevent "Invalid Date" errors.
*   **Duplicate Prevention**: Frontend logic to ignore duplicate message IDs during broadcast or reconnection.
*   **API Stability**: Added `/unread` and `/rooms` endpoints to support persistent state synchronization.

## 6. Architecture (Custom Hooks)
The system is built on a modular hook-based architecture:
*   `useChat`: WebSocket messaging, read status syncing, and initial state fetching.
*   `useReadReceipt`: Logic for sending read events based on scroll position and tab focus.
*   `useUnreadBadge`: Manages persistent unread state and reset triggers.
*   `useDocumentTitleUnread`: Updates browser tab title alerts.
*   `useChatAutoScroll`: Handles viewport-aware scrolling and bottom detection.
*   `useIsMobile` & `useVisualViewportResize`: Mobile environment detection and keyboard management.

---
*Last Updated: 2026-05-01*
