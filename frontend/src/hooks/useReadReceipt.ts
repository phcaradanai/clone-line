"use client";

import { useEffect, useRef } from "react";
import type { Message } from "./useChat";

/**
 * Hook to send read receipts when the user is at the bottom of the chat
 * and viewing a message not sent by themselves.
 */
export function useReadReceipt(
  messages: Message[],
  userId: string,
  sendReadReceipt: (lastReadMessageId: string) => void,
  isAtBottom: boolean
) {
  const lastReadIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only send read receipt if:
    // 1. Tab is visible
    // 2. User is near the bottom
    // 3. There are messages
    
    if (typeof document === "undefined" || document.visibilityState !== "visible" || !isAtBottom || messages.length === 0) {
      return;
    }

    const latestOtherMessage = [...messages].reverse().find(m => m.sender === "other");
    
    if (latestOtherMessage && latestOtherMessage.id && latestOtherMessage.id !== lastReadIdRef.current) {
      sendReadReceipt(latestOtherMessage.id);
      lastReadIdRef.current = latestOtherMessage.id;
    }
  }, [messages, isAtBottom, sendReadReceipt]);

  // Handle tab visibility change
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isAtBottom && messages.length > 0) {
        const latestOtherMessage = [...messages].reverse().find(m => m.sender === "other");
        if (latestOtherMessage && latestOtherMessage.id && latestOtherMessage.id !== lastReadIdRef.current) {
          sendReadReceipt(latestOtherMessage.id);
          lastReadIdRef.current = latestOtherMessage.id;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [messages, isAtBottom, sendReadReceipt]);
}
