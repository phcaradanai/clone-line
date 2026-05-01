"use client";

import React, {
  useState,
  useRef,
  useCallback,
  Suspense,
  useEffect,
} from "react";
import {
  Send,
  Image as ImageIcon,
  Smile,
  MoreVertical,
  Search,
  ChevronDown,
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVisualViewportResize } from "@/hooks/useVisualViewportResize";
import { useSearchParams } from "next/navigation";

const USER1_ID = "00000000-0000-0000-0000-000000000001";
const USER2_ID = "00000000-0000-0000-0000-000000000003";

function ChatContent() {
  const [inputValue, setInputValue] = useState("");
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const roomId = "00000000-0000-0000-0000-000000000002";

  useEffect(() => {
    const initUser = async () => {
      const userParam = searchParams.get("user");

      if (userParam === "2") {
        setCurrentUser({
          id: USER2_ID,
          username: "Test User 2",
        });
        return;
      }

      const savedUser = localStorage.getItem("chat_user");

      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem("chat_user");
        }
        return;
      }

      try {
        let baseUrl = `http://${window.location.hostname}:8888`;

        if (process.env.NEXT_PUBLIC_BACKEND_URL) {
          baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        }

        const response = await fetch(`${baseUrl}/register`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Failed to register guest");
        }

        const newUser = await response.json();

        localStorage.setItem("chat_user", JSON.stringify(newUser));
        setCurrentUser(newUser);
      } catch (error) {
        console.error("Failed to register guest", error);
      }
    };

    initUser();
  }, [searchParams]);

  const userId = currentUser?.id || USER1_ID;

  const { messages, sendMessage, isConnected, lastMessageSource } = useChat(
    roomId,
    userId
  );

  const {
    scrollContainerRef,
    bottomSentinelRef,
    showNewMessageIndicator,
    scrollToBottom,
    handleScroll,
  } = useChatAutoScroll(messages, lastMessageSource);

  const handleViewportResize = useCallback(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  useVisualViewportResize(handleViewportResize);

  useEffect(() => {
    if (!isMobile) {
      inputRef.current?.focus();
    }
  }, [isMobile]);

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [inputValue, resizeTextarea]);

  const handleSend = useCallback(() => {
    const value = inputValue.trim();

    if (!value || !isConnected) return;

    sendMessage(value);
    setInputValue("");

    requestAnimationFrame(() => {
      scrollToBottom("smooth");

      if (!isMobile) {
        inputRef.current?.focus();
      }
    });
  }, [inputValue, isConnected, sendMessage, scrollToBottom, isMobile]);

  const handleInputFocus = useCallback(() => {
    if (!isMobile) return;

    window.setTimeout(() => {
      scrollToBottom("instant");
    }, 250);
  }, [isMobile, scrollToBottom]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
      let baseUrl = `http://${window.location.hostname}:8888`;

      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      }

      const response = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();

      if (data.url) {
        sendMessage("Sent an image", "image", data.url);

        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[#F0F2F5] font-sans antialiased text-gray-900">
      {/* Sidebar - Desktop Only */}
      <aside className="hidden w-80 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-[#f7f9fa] p-4">
          <div>
            <h1 className="text-xl font-bold text-[#06C755]">LINE Clone</h1>
            <p className="text-[10px] text-gray-400">
              Logged in as: {currentUser?.username || "Guest"}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <div
              className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"
                }`}
            />
            <MoreVertical
              className="cursor-pointer text-gray-500"
              size={20}
            />
          </div>
        </div>

        <div className="shrink-0 p-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="ค้นหาแชท..."
              className="w-full rounded-full bg-gray-100 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#06C755]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex cursor-pointer items-center border-b border-gray-50 bg-green-50 p-3 transition-colors">
            <div className="mr-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] font-bold text-white">
              GC
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">
                  Group Chat (Test)
                </span>
                <span className="text-xs text-gray-400">Now</span>
              </div>
              <p className="truncate text-sm text-[#06C755]">Connected</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="relative flex min-h-0 flex-1 flex-col bg-white">
        {/* Chat Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center">
            <div className="mr-3 h-10 w-10 rounded-2xl bg-[#06C755]" />
            <div>
              <h2 className="text-base font-bold text-gray-800">Group Chat</h2>
              <p className="text-xs text-gray-400">
                {isConnected ? "Online" : "Offline"}
              </p>
            </div>
          </div>

          <div className="flex text-gray-500">
            <Search
              size={20}
              className="mr-4 cursor-pointer hover:text-[#06C755]"
            />
            <MoreVertical
              size={20}
              className="cursor-pointer hover:text-[#06C755]"
            />
          </div>
        </header>

        {/* Messages List */}
        <section
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 space-y-4 overflow-y-auto bg-[#f7f9fa] p-4"
          style={{
            overscrollBehaviorY: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"
                }`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm md:max-w-[70%] ${msg.sender === "me"
                    ? "rounded-tr-none bg-[#06C755] text-white"
                    : "rounded-tl-none border border-gray-100 bg-white text-gray-800"
                  }`}
              >
                {msg.type === "image" ? (
                  <img
                    src={msg.file_url}
                    alt="Uploaded"
                    className="mb-1 h-auto max-w-full rounded-lg"
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-5">
                    {msg.content}
                  </p>
                )}

                <span
                  className={`mt-1 block text-[10px] ${msg.sender === "me"
                      ? "text-right text-green-100"
                      : "text-gray-400"
                    }`}
                >
                  {msg.time}
                </span>
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center space-y-2 text-gray-400">
              <Smile size={48} />
              <p>ยังไม่มีข้อความ เริ่มแชทเลย!</p>
            </div>
          )}

          <div ref={bottomSentinelRef} aria-hidden="true" className="h-px" />
        </section>

        {/* New Message Indicator */}
        {showNewMessageIndicator && (
          <button
            onClick={() => scrollToBottom("smooth")}
            className="new-message-indicator absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-1.5 text-xs font-medium text-white shadow-lg transition-colors hover:bg-[#05b34c]"
          >
            <ChevronDown size={14} />
            New messages
          </button>
        )}

        {/* Input Area */}
        <footer
          className="shrink-0 border-t border-gray-100 bg-white px-3 py-3 md:px-4 md:py-4"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 transition-all focus-within:border-[#06C755] md:gap-3 md:px-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
              accept="image/*"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 py-1 text-gray-400 hover:text-[#06C755]"
              aria-label="Upload image"
            >
              <ImageIcon size={20} />
            </button>

            <button
              type="button"
              className="hidden shrink-0 py-1 text-gray-400 hover:text-[#06C755] sm:block"
              aria-label="Emoji"
            >
              <Smile size={20} />
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={handleInputFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isConnected ? "พิมพ์ข้อความ..." : "กำลังเชื่อมต่อ..."}
              disabled={!isConnected}
              enterKeyHint="send"
              className="max-h-28 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-400"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected}
              className={`shrink-0 rounded-full p-2 transition-all ${inputValue.trim() && isConnected
                  ? "bg-[#06C755] text-white active:scale-95"
                  : "cursor-not-allowed text-gray-300"
                }`}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-white">
          Loading Chat...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}