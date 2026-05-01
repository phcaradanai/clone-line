"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { Message } from "./useChat";

const NEAR_BOTTOM_THRESHOLD = 150; // px from bottom to consider "near bottom"

type MessageSource = "sent" | "received" | null;

/**
 * Manages auto-scroll behavior for a chat message list.
 *
 * - Scrolls to bottom on initial load & history load
 * - Always scrolls to bottom when the user sends a message
 * - Auto-scrolls on incoming messages only if already near bottom
 * - Shows a "new messages" indicator when the user has scrolled up
 */
export function useChatAutoScroll(
  messages: Message[],
  lastMessageSource: MessageSource
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const hasInitialScrolled = useRef(false);

  /**
   * Scroll to the bottom of the message list.
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (bottomSentinelRef.current) {
      bottomSentinelRef.current.scrollIntoView({ behavior });
    }
    setShowNewMessageIndicator(false);
  }, []);

  /**
   * Check if the user is near the bottom of the scroll container.
   */
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  /**
   * Handle scroll events to track position.
   */
  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
    // Dismiss indicator if user scrolled to bottom manually
    if (isNearBottomRef.current) {
      setShowNewMessageIndicator(false);
    }
  }, [checkIfNearBottom]);

  // Initial scroll to bottom when messages first load
  useEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        scrollToBottom("instant");
      });
    }
  }, [messages.length, scrollToBottom]);

  // Handle new messages (after initial load)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currentCount = messages.length;

    if (currentCount > prevCount && hasInitialScrolled.current && prevCount > 0) {
      if (lastMessageSource === "sent") {
        // Always scroll when user sends a message
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else if (isNearBottomRef.current) {
        // Auto-scroll if near bottom
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else {
        // User is reading older messages — show indicator
        setShowNewMessageIndicator(true);
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messages.length, lastMessageSource, scrollToBottom]);

  return {
    scrollContainerRef,
    bottomSentinelRef,
    showNewMessageIndicator,
    scrollToBottom,
    handleScroll,
  };
}
