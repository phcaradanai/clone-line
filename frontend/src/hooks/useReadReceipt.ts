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
    const latestOtherMessage = [...messages].reverse().find(m => m.sender === "other");
    const shouldSend = !!(
      typeof document !== "undefined" && 
      document.visibilityState === "visible" && 
      isAtBottom && 
      messages.length > 0 && 
      latestOtherMessage && 
      latestOtherMessage.id && 
      latestOtherMessage.id !== lastReadIdRef.current
    );

    console.log("[READ] check:", {
      roomId: messages[0]?.room_id,
      userId,
      messagesCount: messages.length,
      latestMessageId: messages[messages.length - 1]?.id,
      latestOtherMessageId: latestOtherMessage?.id,
      isAtBottom,
      visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
      lastSentReadId: lastReadIdRef.current,
      shouldSend
    });

    if (shouldSend && latestOtherMessage) {
      console.log("[READ] sending payload for message:", latestOtherMessage.id);
      sendReadReceipt(latestOtherMessage.id);
      lastReadIdRef.current = latestOtherMessage.id;
    }
  }, [messages, isAtBottom, sendReadReceipt, userId]);

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
