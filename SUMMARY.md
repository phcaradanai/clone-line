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
*   **Database Integration**: Added `last_read_message_id` and `last_read_at` to the backend schema in PostgreSQL.
*   **Real-time Sync**: `message:read` events are broadcast via WebSocket and persisted to the database.
*   **Group Read Count**: Implemented "Read N" behavior for group chats. Sent messages now display the number of users who have read them (e.g., "Read 2"), matching the LINE experience.
*   **Reliable Logic**: Fixed a critical bug where read status was calculated using random UUID sorting. Now uses robust `created_at` timestamp comparisons in SQL.

## 4. Multi-Room & Dynamic Navigation
*   **Dynamic Room Selection**: The app now supports switching between multiple rooms via a dynamic sidebar populated by the `/rooms` API.
*   **Mobile Header Context**: The chat header dynamically updates to show the selected room's name and status, ensuring clarity on mobile devices.
*   **Query Param Support**: Users can deep-link into specific rooms using `?room=<UUID>` or `?user=<ID>` parameters.

## 5. Notifications & Unread Tracking
*   **Persistent Unread Count**: Unread messages are calculated by the backend and fetched on initialization, ensuring the badge survives browser restarts.
*   **In-App Badges**: A green unread count badge appears in the sidebar for each room.
*   **Tab Title Alerts**: The browser tab title updates (e.g., `(3) LINE Clone`) when new messages arrive while the user is in another tab.
*   **Intelligent Reset**: Unread counts clear automatically when the user views the latest messages or returns to a visible tab.

## 6. Production Readiness & Stability
*   **Error Handling & Resilience**: Added loading/error states for message history loading in the frontend. The backend now performs strict UUID validation to prevent 500 errors.
*   **Audit Fixes**: Resolved UUID comparison bugs in both backend (SQL) and frontend (Array index logic).
*   **API Enhancements**: The `/messages` endpoint now returns data in correct chronological order with tie-breaking ID sorting.
*   **Full Type Safety**: Achieved 100% TypeScript coverage and passed all strict linting rules.

## 7. Architecture (Custom Hooks)
The system is built on a modular hook-based architecture:
*   `useChat`: WebSocket messaging, read status syncing, and initial state fetching (with loading/error states).
*   `useReadReceipt`: Logic for sending read events based on scroll position and tab focus.
*   `useUnreadBadge`: Manages persistent unread state and reset triggers.
*   `useDocumentTitleUnread`: Updates browser tab title alerts.
*   `useChatAutoScroll`: Handles viewport-aware scrolling and bottom detection.
*   `useIsMobile` & `useVisualViewportResize`: Mobile environment detection and keyboard management.

---
*Last Updated: 2026-05-01*
