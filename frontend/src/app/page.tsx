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
  Menu,
  X,
  Reply,
  FileText,
} from "lucide-react";
import { useChat, type Message } from "@/hooks/useChat";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVisualViewportResize } from "@/hooks/useVisualViewportResize";
import { useReadReceipt } from "@/hooks/useReadReceipt";
import { useUnreadBadge } from "@/hooks/useUnreadBadge";
import { useDocumentTitleUnread } from "@/hooks/useDocumentTitleUnread";
import { useSearchParams, useRouter } from "next/navigation";

const USER1_ID = "00000000-0000-0000-0000-000000000001";
const USER2_ID = "00000000-0000-0000-0000-000000000003";

const DEFAULT_ROOM_ID = "00000000-0000-0000-0000-000000000002";

const FALLBACK_ROOM = {
  id: DEFAULT_ROOM_ID,
  name: "General Chat",
  is_group: true,
  unread_count: 0,
};

const ReplyPreview = ({
  message,
  onClick,
  onCancel,
  isBanner = false,
  isMe = false,
}: {
  message: Message;
  onClick?: () => void;
  onCancel?: () => void;
  isBanner?: boolean;
  isMe?: boolean;
}) => {
  const senderName =
    message.user?.display_name ||
    message.user?.username ||
    (message.sender === "me" ? "You" : "User");

  const previewText = message.is_deleted
    ? "ข้อความนี้ถูกลบแล้ว"
    : message.type === "image"
      ? message.preview || "รูปภาพ"
      : message.type === "file"
        ? message.preview || "ไฟล์แนบ"
        : message.preview || message.content || "";

  return (
    <div
      onClick={onClick}
      className={`relative flex max-w-full min-w-0 items-start gap-2 overflow-hidden ${onClick ? "cursor-pointer" : ""
        } ${isBanner
          ? "mb-2 rounded-t-lg border-l-4 border-[#06C755] bg-gray-50 px-3 py-2 text-sm"
          : `mb-1.5 rounded border-l-2 bg-black/5 p-1.5 text-xs ${isMe
            ? "border-white/50 text-white/90"
            : "border-[#06C755] text-gray-600"
          }`
        }`}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <span
          className={`block max-w-full truncate font-semibold ${isBanner
            ? "text-[#06C755]"
            : isMe
              ? "text-white/90"
              : "text-[#06C755]"
            }`}
        >
          {isBanner ? `Replying to ${senderName}` : senderName}
        </span>

        <div className="mt-0.5 flex min-w-0 items-start gap-1 opacity-80">
          {message.type === "image" && !message.is_deleted && (
            <ImageIcon size={12} className="mt-0.5 shrink-0" />
          )}

          {message.type === "file" && !message.is_deleted && (
            <FileText size={12} className="mt-0.5 shrink-0" />
          )}

          <span className="line-clamp-2 min-w-0 flex-1 break-anywhere leading-4">
            {previewText}
          </span>
        </div>
      </div>

      {message.type === "image" && message.file_url && !message.is_deleted && (
        <img
          src={message.file_url}
          alt="preview"
          className="h-8 w-8 shrink-0 rounded object-cover"
        />
      )}

      {isBanner && onCancel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Cancel reply"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

function ChatContent() {
  const [inputValue, setInputValue] = useState("");
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
  } | null>(null);

  const [rooms, setRooms] = useState<
    {
      id: string;
      name: string;
      is_group: boolean;
      unread_count: number;
      last_message?: {
        content: string;
        created_at: string;
      };
    }[]
  >([]);

  const [selectedRoomId, setSelectedRoomId] = useState<string>(DEFAULT_ROOM_ID);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null,
  );

  const [readersModal, setReadersModal] = useState<{
    isOpen: boolean;
    messageId: string | null;
    readers: { id: string; username: string }[];
    loading: boolean;
  }>({
    isOpen: false,
    messageId: null,
    readers: [],
    loading: false,
  });

  const [messageAction, setMessageAction] = useState<{
    isOpen: boolean;
    message: Message | null;
  }>({
    isOpen: false,
    message: null,
  });

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchRooms = async () => {
      setIsLoadingRooms(true);
      setRoomsError(null);

      try {
        let baseUrl = `http://${window.location.hostname}:8888`;
        const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

        if (envBackendUrl) {
          baseUrl = envBackendUrl;
        }

        const response = await fetch(
          `${baseUrl}/rooms?user_id=${currentUser?.id || USER1_ID}`,
        );

        if (response.ok) {
          const data = await response.json();

          if (Array.isArray(data)) {
            setRooms(data);

            const roomParam = searchParams.get("room");

            if (roomParam) {
              setSelectedRoomId(roomParam);
            } else if (data.length > 0) {
              setSelectedRoomId(data[0].id);
            }
          }
        } else {
          setRoomsError("ไม่สามารถโหลดรายการห้องได้");
        }
      } catch (error) {
        console.error("Failed to fetch rooms", error);
        setRoomsError("การเชื่อมต่อขัดข้อง");
      } finally {
        setIsLoadingRooms(false);
      }
    };

    fetchRooms();
  }, [currentUser, searchParams]);

  const handleRoomSelect = useCallback(
    (roomId: string) => {
      setSelectedRoomId(roomId);
      setIsSidebarOpen(false);
      setReplyingToMessage(null);

      const params = new URLSearchParams(searchParams.toString());
      params.set("room", roomId);
      router.push(`?${params.toString()}`);
    },
    [searchParams, router],
  );

  const roomId = selectedRoomId;

  const selectedRoom =
    rooms.find((room) => room.id === roomId) ||
    (roomId === DEFAULT_ROOM_ID ? FALLBACK_ROOM : null);

  const fetchReaders = async (messageId: string) => {
    setReadersModal((prev) => ({
      ...prev,
      isOpen: true,
      messageId,
      loading: true,
    }));

    try {
      let baseUrl = `http://${window.location.hostname}:8888`;

      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      }

      const res = await fetch(
        `${baseUrl}/api/v1/rooms/${roomId}/messages/${messageId}/readers`,
      );

      if (res.ok) {
        const readers = await res.json();

        setReadersModal({
          isOpen: true,
          messageId,
          readers: readers || [],
          loading: false,
        });
      } else {
        setReadersModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error("Failed to fetch readers", error);
      setReadersModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const jumpToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add(
        "bg-[#06C755]/10",
        "transition-colors",
        "duration-500",
        "rounded-lg",
      );

      setTimeout(() => {
        element.classList.remove("bg-[#06C755]/10");
      }, 1500);
    } else {
      console.warn("Message not found in DOM for jump.");
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openMessageAction = useCallback((msg: Message) => {
    if (!msg || msg.is_deleted) return;

    setMessageAction({
      isOpen: true,
      message: msg,
    });
  }, []);

  const closeMessageAction = useCallback(() => {
    setMessageAction({
      isOpen: false,
      message: null,
    });
  }, []);

  const getMessagePreviewText = useCallback((msg: Message | null) => {
    if (!msg) return "";
    if (msg.is_deleted) return "ลบข้อความนี้แล้ว";
    if (msg.type === "image") return msg.preview || "รูปภาพ";
    if (msg.type === "file") return msg.preview || "ไฟล์แนบ";
    return msg.preview || msg.content || "ข้อความ";
  }, []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  useEffect(() => {
    if (!messageAction.isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMessageAction();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [messageAction.isOpen, closeMessageAction]);

  useEffect(() => {
    const initUser = async () => {
      const userParam = searchParams.get("user");

      if (userParam === "1") {
        const user = { id: USER1_ID, username: "Test User 1" };
        setCurrentUser(user);
        console.log("[AUTH] currentUser (from ?user=1):", user);
        return;
      }

      if (userParam === "2") {
        const user = { id: USER2_ID, username: "Test User 2" };
        setCurrentUser(user);
        console.log("[AUTH] currentUser (from ?user=2):", user);
        return;
      }

      const savedUser = localStorage.getItem("chat_user");

      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          console.log("[AUTH] currentUser (from localStorage):", user);
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

  const handleGlobalMessage = useCallback(
    (msg: Message) => {
      setRooms((prev) =>
        prev.map((room) => {
          if (room.id !== msg.room_id) {
            return room;
          }

          return {
            ...room,
            last_message: {
              content: msg.is_deleted ? "ลบข้อความนี้แล้ว" : msg.content,
              created_at: msg.created_at || new Date().toISOString(),
            },
            unread_count:
              room.id === roomId ? room.unread_count : room.unread_count + 1,
          };
        }),
      );
    },
    [roomId],
  );

  const {
    messages,
    sendMessage,
    sendReadReceipt,
    deleteMessage,
    isConnected,
    lastMessageSource,
    initialUnreadCount,
    isLoadingMessages,
    messagesError,
  } = useChat(roomId, userId, handleGlobalMessage);

  const {
    scrollContainerRef,
    bottomSentinelRef,
    showNewMessageIndicator,
    isNearBottom,
    scrollToBottom,
    handleScroll,
  } = useChatAutoScroll(messages, lastMessageSource);

  useReadReceipt(messages, userId, sendReadReceipt, isNearBottom);

  const unreadCount = useUnreadBadge(
    messages,
    isNearBottom,
    initialUnreadCount,
  );

  useDocumentTitleUnread(unreadCount);

  const handleViewportResize = useCallback(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  useVisualViewportResize(handleViewportResize);

  const unreadSeparatorMessageId = React.useMemo(() => {
    if (!isLoadingMessages && initialUnreadCount > 0 && messages.length > 0) {
      const unreadMsgs = messages.filter((message) => message.sender === "other");

      if (unreadMsgs.length >= initialUnreadCount) {
        const firstUnread = unreadMsgs[unreadMsgs.length - initialUnreadCount];
        return firstUnread?.id || null;
      }
    }

    return null;
  }, [isLoadingMessages, initialUnreadCount, messages]);

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

    sendMessage(value, "text", undefined, replyingToMessage?.id);
    setInputValue("");
    setReplyingToMessage(null);

    requestAnimationFrame(() => {
      scrollToBottom("smooth");

      if (!isMobile) {
        inputRef.current?.focus();
      }
    });
  }, [
    inputValue,
    isConnected,
    sendMessage,
    scrollToBottom,
    isMobile,
    replyingToMessage?.id,
  ]);

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
        sendMessage("Sent an image", "image", data.url, replyingToMessage?.id);
        setReplyingToMessage(null);

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

  const renderRoomList = () => (
    <div className="flex-1 overflow-y-auto">
      {isLoadingRooms ? (
        <div className="p-4 text-center text-sm text-gray-400">
          กำลังโหลดห้อง...
        </div>
      ) : roomsError ? (
        <div className="m-2 rounded-lg border border-red-100 bg-red-50 p-4 text-center text-sm text-red-400">
          {roomsError}
        </div>
      ) : rooms.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-400">
          ไม่มีห้องแชท
        </div>
      ) : (
        rooms.map((room) => (
          <div
            key={room.id}
            onClick={() => handleRoomSelect(room.id)}
            className={`flex cursor-pointer items-center border-b border-gray-50 p-3 transition-colors ${room.id === roomId ? "bg-green-50" : "hover:bg-gray-50"
              }`}
          >
            <div className="mr-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] font-bold uppercase text-white">
              {room.name?.substring(0, 2) || "RM"}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span
                  className={`min-w-0 truncate font-semibold ${room.id === roomId ? "text-[#06C755]" : "text-gray-800"
                    }`}
                >
                  {room.name}
                </span>

                <span className="shrink-0 text-[10px] text-gray-400">
                  {room.last_message
                    ? new Date(room.last_message.created_at).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )
                    : ""}
                </span>
              </div>

              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-gray-500">
                  {room.last_message
                    ? room.last_message.content
                    : room.id === roomId && isConnected
                      ? "Connected"
                      : ""}
                </p>

                {room.unread_count > 0 && (
                  <span className="ml-2 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#06C755] px-1.5 text-[10px] font-bold text-white">
                    {room.unread_count}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 flex max-w-full overflow-hidden bg-[#F0F2F5] font-sans text-gray-900 antialiased">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-[#f7f9fa] p-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-[#06C755]">
              LINE Clone
            </h1>
            <p className="truncate text-[10px] text-gray-400">
              Logged in as: {currentUser?.username || "Guest"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="shrink-0 md:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="shrink-0 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="ค้นหาแชท..."
              className="w-full rounded-full bg-gray-100 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#06C755]"
            />
          </div>
        </div>

        {renderRoomList()}
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="mr-3 shrink-0 md:hidden"
              aria-label="Open sidebar"
            >
              <Menu size={24} className="text-gray-500" />
            </button>

            <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] text-xs font-bold uppercase text-white">
              {selectedRoom?.name?.substring(0, 2) ||
                (isLoadingRooms ? ".." : "RM")}
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-gray-800">
                {isLoadingRooms
                  ? "กำลังโหลดห้อง..."
                  : selectedRoom?.name || "เลือกห้องแชท"}
              </h2>

              <p className="text-xs text-gray-400">
                {isConnected ? "Online" : "Offline"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 text-gray-500">
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

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#F0F2F5] px-3 py-4 md:px-4"
          style={{
            overscrollBehaviorY: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {isLoadingMessages && messages.length === 0 && (
            <div className="flex h-10 items-center justify-center">
              <p className="text-xs italic text-gray-400">
                กำลังโหลดข้อความ...
              </p>
            </div>
          )}

          {messagesError && messages.length === 0 && (
            <div className="mx-auto max-w-sm rounded-xl border border-red-100 bg-red-50 p-3 text-center text-sm text-red-500">
              ไม่สามารถโหลดข้อความได้
            </div>
          )}

          {messages.map((msg, index) => {
            const isMe = msg.sender === "me";
            const isNewSender =
              index === 0 || messages[index - 1].sender !== msg.sender;
            const showUnreadSeparator = unreadSeparatorMessageId === msg.id;

            return (
              <React.Fragment key={msg.id || index}>
                {showUnreadSeparator && (
                  <div className="my-6 flex min-w-0 items-center justify-center">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="mx-4 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Unread messages / ข้อความใหม่
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}

                <div
                  id={msg.id ? `message-${msg.id}` : undefined}
                  data-message-id={msg.id}
                  className={`group flex w-full min-w-0 animate-in p-1 duration-300 fade-in slide-in-from-bottom-2 ${isMe ? "justify-end" : "justify-start"
                    } ${isNewSender ? "pt-3" : "pt-1"}`}
                >
                  <div
                    className={`relative flex max-w-[78vw] min-w-0 flex-col overflow-hidden md:max-w-[70%] ${isMe ? "items-end" : "items-start"
                      }`}
                  >
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openMessageAction(msg);
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        clearLongPressTimer();
                        longPressTimerRef.current = setTimeout(() => {
                          openMessageAction(msg);
                        }, 550);
                      }}
                      onMouseUp={clearLongPressTimer}
                      onMouseLeave={clearLongPressTimer}
                      onTouchStart={() => {
                        clearLongPressTimer();
                        longPressTimerRef.current = setTimeout(() => {
                          openMessageAction(msg);
                        }, 550);
                      }}
                      onTouchEnd={clearLongPressTimer}
                      onTouchCancel={clearLongPressTimer}
                      className={`relative max-w-full min-w-0 overflow-hidden rounded-[18px] px-3.5 py-2 text-[14px] shadow-sm transition-colors ${isMe
                        ? "rounded-tr-[4px] bg-[#06C755] text-white"
                        : "rounded-tl-[4px] border border-gray-100 bg-white text-gray-800"
                        } ${msg.is_deleted
                          ? "!border-gray-200 !bg-gray-100 !text-gray-400 italic"
                          : "cursor-pointer select-none active:opacity-90"
                        }`}
                    >
                      {msg.reply_to_message && !msg.is_deleted && (
                        <ReplyPreview
                          message={msg.reply_to_message}
                          isMe={isMe}
                          onClick={() =>
                            msg.reply_to_message?.id &&
                            jumpToMessage(msg.reply_to_message.id)
                          }
                        />
                      )}

                      {msg.is_deleted ? (
                        <p className="break-anywhere leading-5">
                          ลบข้อความนี้แล้ว
                        </p>
                      ) : msg.type === "image" ? (
                        <img
                          src={msg.file_url}
                          alt="Uploaded"
                          className="mb-1 h-auto max-w-full rounded-lg"
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-anywhere leading-5">
                          {msg.content}
                        </p>
                      )}
                    </div>

                    <div
                      className={`mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] ${isMe ? "flex-row-reverse" : "flex-row"
                        }`}
                    >
                      <span
                        className={
                          isMe ? "text-[#06C755]/70" : "text-gray-400"
                        }
                      >
                        {msg.time}
                      </span>

                      {isMe && (msg.read_count || 0) > 0 && !msg.is_deleted && (
                        <span
                          className="cursor-pointer font-medium text-[#06C755] hover:underline"
                          onClick={() => fetchReaders(msg.id!)}
                        >
                          อ่านแล้ว {(msg.read_count || 0) > 1 ? msg.read_count : ""}
                        </span>
                      )}

                      {!msg.is_deleted && (
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(msg)}
                          className="mx-1 text-gray-400 transition-colors hover:text-gray-600"
                          title="Reply"
                          aria-label="Reply message"
                        >
                          <Reply size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {!isLoadingMessages && !messagesError && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center space-y-2 text-gray-400">
              <Smile size={48} />
              <p>ยังไม่มีข้อความ เริ่มแชทเลย!</p>
            </div>
          )}

          <div ref={bottomSentinelRef} aria-hidden="true" className="h-px" />
        </div>

        {showNewMessageIndicator && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="new-message-indicator absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-1.5 text-xs font-medium text-white shadow-lg transition-colors hover:bg-[#05b34c]"
          >
            <ChevronDown size={14} />
            New messages
          </button>
        )}

        <footer
          className="flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-gray-100 bg-white px-3 py-3 md:px-4 md:py-4"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          {replyingToMessage && (
            <ReplyPreview
              message={replyingToMessage}
              isBanner
              onCancel={() => setReplyingToMessage(null)}
            />
          )}

          <div
            className={`flex min-w-0 max-w-full items-end gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 transition-all focus-within:border-[#06C755] md:gap-3 md:px-4 ${replyingToMessage
              ? "rounded-tl-none rounded-tr-none border-t-0"
              : ""
              }`}
          >
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
              className="max-h-28 min-h-[28px] min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-400"
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

      {readersModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm animate-in rounded-xl bg-white p-4 shadow-xl duration-200 fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-gray-800">Read by</h3>

              <button
                type="button"
                onClick={() =>
                  setReadersModal({
                    isOpen: false,
                    messageId: null,
                    readers: [],
                    loading: false,
                  })
                }
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close readers modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-3 max-h-60 overflow-y-auto">
              {readersModal.loading ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  Loading...
                </p>
              ) : readersModal.readers.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  No readers found.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {readersModal.readers.map((reader) => (
                    <div
                      key={reader.id}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium uppercase text-gray-600">
                        {reader.username.substring(0, 2)}
                      </div>

                      <span className="min-w-0 truncate text-sm font-medium text-gray-700">
                        {reader.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {messageAction.isOpen && messageAction.message && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-3 sm:items-center"
          onClick={closeMessageAction}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-gray-400">ตัวเลือกข้อความ</p>
              <p className="mt-1 line-clamp-2 break-anywhere text-sm text-gray-700">
                {getMessagePreviewText(messageAction.message)}
              </p>
            </div>

            <div className="mt-1 overflow-hidden rounded-xl border border-gray-100">
              {!messageAction.message.is_deleted && (
                <button
                  type="button"
                  onClick={() => {
                    if (!messageAction.message) return;
                    setReplyingToMessage(messageAction.message);
                    closeMessageAction();
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  aria-label="Reply to message"
                >
                  <span>ตอบกลับ</span>
                  <Reply size={16} className="text-gray-400" />
                </button>
              )}

              {messageAction.message.sender === "me" &&
                !messageAction.message.is_deleted &&
                messageAction.message.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const msg = messageAction.message;
                      closeMessageAction();

                      if (!msg?.id) return;

                      const ok = window.confirm("ลบข้อความนี้สำหรับทุกคน?");
                      if (ok) {
                        deleteMessage(msg.id);
                      }
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 active:bg-red-100"
                    aria-label="Delete message for everyone"
                  >
                    <span>ลบข้อความ</span>
                    <X size={16} />
                  </button>
                )}
            </div>

            <button
              type="button"
              onClick={closeMessageAction}
              className="mt-2 w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200 active:bg-gray-300"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
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