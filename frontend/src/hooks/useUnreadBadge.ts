"use client";

import { useState, useEffect, useRef } from "react";
import type { Message } from "./useChat";

/**
 * Tracks unread messages count.
 * Increments when new messages arrive from others while user is not at bottom or tab is hidden.
 * Resets when user reads (at bottom and tab visible).
 */
export function useUnreadBadge(messages: Message[], isAtBottom: boolean, initialCount: number = 0) {
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessageCountRef = useRef(messages.length);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current && initialCount > 0) {
      setUnreadCount(initialCount);
      initializedRef.current = true;
    }
  }, [initialCount]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const isTabHidden = document.visibilityState !== "visible";
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (currentCount > prevCount) {
      const newMessages = messages.slice(prevCount);
      const otherNewMessages = newMessages.filter(m => m.sender === "other");

      if (otherNewMessages.length > 0) {
        // If not at bottom OR tab is hidden, we have unread messages
        if (!isAtBottom || isTabHidden) {
          setUnreadCount(prev => prev + otherNewMessages.length);
        }
      }
    }

    // If user is at bottom and tab is visible, clear unread
    if (isAtBottom && !isTabHidden) {
      setUnreadCount(0);
    }

    prevMessageCountRef.current = currentCount;
  }, [messages, isAtBottom]);

  // Reset when tab becomes visible if at bottom
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isAtBottom) {
        setUnreadCount(0);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isAtBottom]);

  return unreadCount;
}
