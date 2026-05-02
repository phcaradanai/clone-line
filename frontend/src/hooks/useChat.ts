"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export type Message = {
  id?: string;
  room_id: string;
  user_id: string;
  reply_to_message_id?: string;
  reply_to_message?: Message;
  content: string;
  type: 'text' | 'image' | 'file' | 'deleted';
  file_url?: string;
  time?: string;
  sender?: 'me' | 'other';
  read_count?: number;
  created_at?: string;
  preview?: string;
  is_deleted?: boolean;
  user?: {
    id: string;
    username?: string;
    display_name?: string;
  };
};

export type MessageSource = 'sent' | 'received' | null;

export function useChat(roomId: string, userId: string, onNewMessage?: (msg: Message) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [lastMessageSource, setLastMessageSource] = useState<MessageSource>(null);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);

  useEffect(() => {
    // Reset state when roomId changes - using functional updates or allowing async flow
    // 1. Load History & Unread Count
    const loadInitialData = async () => {
      setMessages([]);
      setMessagesError(null);
      setIsLoadingMessages(true);
      try {
        let baseUrl = `http://${window.location.hostname}:8888`;
        const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (envBackendUrl) {
          baseUrl = envBackendUrl;
        }
        
        // Load messages
        const response = await fetch(`${baseUrl}/messages?room_id=${roomId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const formattedMessages: Message[] = data.map((msg: Message & { created_at: string, read_count: number }) => ({
            ...msg,
            sender: (msg.user_id === userId ? 'me' : 'other') as 'me' | 'other',
            time: new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read_count: msg.read_count || 0
          }));

          setMessages((prev) => {
            // Merge history with any real-time messages that arrived while loading
            const merged = [...formattedMessages];
            prev.forEach(pMsg => {
               if (pMsg.id && !merged.some(m => m.id === pMsg.id)) {
                 merged.push(pMsg);
               }
            });
            // Re-sort by ID or index if needed, but history is already ASC and WS appends to end
            return merged;
          });
        }
        setIsLoadingMessages(false);

        // Load unread count
        const unreadResponse = await fetch(`${baseUrl}/unread?room_id=${roomId}&user_id=${userId}`);
        if (unreadResponse.ok) {
          const unreadData = await unreadResponse.json();
          if (unreadData && typeof unreadData.count === 'number') {
            setInitialUnreadCount(unreadData.count);
          }
        }
      } catch (error: unknown) {
        console.error("Failed to load initial data:", error);
        setMessagesError(error instanceof Error ? error.message : "Failed to load messages");
        setIsLoadingMessages(false);
      }
    };

    loadInitialData();


    // 2. Setup WebSocket
    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'wss:' : 'ws:';
    let host = window.location.hostname;
    
    // ถ้ามีการระบุ Backend URL ภายนอก (สำหรับ Tunnel) ให้ตัดโปรโตคอลออกเอาแต่ hostname
    const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envBackendUrl) {
      host = envBackendUrl.replace(/^https?:\/\//, '');
    }

    const wsUrl = `${protocol}//${host}:8888/ws?user_id=${userId}`;
    
    // ถ้ามีการระบุ Backend URL ภายนอก ให้พยายามสร้าง WebSocket URL จากค่านั้น
    let finalWsUrl = wsUrl;
    if (envBackendUrl) {
      const wsProtocol = envBackendUrl.startsWith('https') ? 'wss:' : 'ws:';
      const wsHost = envBackendUrl.replace(/^https?:\/\//, '');
      finalWsUrl = `${wsProtocol}//${wsHost}/ws?user_id=${userId}`;
    }
    
    const socket = new WebSocket(finalWsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'room.read') {
          const { last_read_message_id: lastReadMessageId, user_id: readerId, room_id: eventRoomId } = data.payload;
          
          if (eventRoomId === roomId && readerId !== userId) {
            setMessages((prev) => {
              const readIndex = prev.findIndex(m => m.id === lastReadMessageId);
              if (readIndex === -1) return prev;
              
              return prev.map((msg, index) => {
                if (msg.sender === 'me' && index <= readIndex) {
                  return { ...msg, read_count: Math.max(msg.read_count || 0, 1) };
                }
                return msg;
              });
            });
          }
          return;
        }

        if (data.type === 'message.deleted') {
          const { message_id: deletedId, room_id: eventRoomId } = data.payload;
          if (eventRoomId === roomId) {
            setMessages((prev) => prev.map(m => {
              if (m.id === deletedId) {
                return { 
                  ...m, 
                  is_deleted: true, 
                  content: "ลบข้อความนี้แล้ว", 
                  type: 'deleted',
                  file_url: undefined,
                  reply_to_message: undefined
                };
              }
              return m;
            }));
          }
          return;
        }

        let msgData = data;
        if (data.type === 'message.created') {
          msgData = data.payload;
        }

        // Transform incoming message
        const incomingMsg: Message = {
          ...msgData,
          sender: msgData.user_id === userId ? 'me' : 'other',
          time: new Date(msgData.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // Global callback for all incoming messages (useful for sidebar unread counts)
        if (onNewMessage) {
          onNewMessage(incomingMsg);
        }
        
        // Only add to message list if it's for the current room
        if (incomingMsg.room_id === roomId) {
          setMessages((prev) => {
            // Prevent duplicates
            if (incomingMsg.id && prev.some(m => m.id === incomingMsg.id)) {
              return prev;
            }
            setLastMessageSource(incomingMsg.sender === 'me' ? 'sent' : 'received');
            return [...prev, incomingMsg];
          });
        }
      } catch (e) {
        console.error('Failed to parse message', e);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from WebSocket');
      setIsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [roomId, userId, onNewMessage]);

  const sendMessage = useCallback((content: string, type: 'text' | 'image' = 'text', fileUrl?: string, replyToMessageId?: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const msg = {
        room_id: roomId,
        user_id: userId,
        content: content,
        type: type,
        file_url: fileUrl,
        reply_to_message_id: replyToMessageId || undefined,
      };
      setLastMessageSource('sent');
      socketRef.current.send(JSON.stringify(msg));
    }
  }, [roomId, userId]);

  const sendReadReceipt = useCallback(async (lastReadMessageId: string) => {
    try {
      let baseUrl = `http://${window.location.hostname}:8888`;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      }

      console.log("[READ] sending REST payload for message:", lastReadMessageId);
      
      await fetch(`${baseUrl}/api/v1/rooms/${roomId}/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          last_read_message_id: lastReadMessageId
        })
      });
    } catch (error) {
      console.error("[READ] failed to mark as read via REST:", error);
    }
  }, [roomId, userId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      let baseUrl = `http://${window.location.hostname}:8888`;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      }

      const response = await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          scope: "everyone"
        })
      });

      if (!response.ok) {
        throw new Error("Failed to delete message");
      }
    } catch (error) {
      console.error("[DELETE] failed to delete message:", error);
    }
  }, [userId]);

  return { 
    messages, 
    isConnected, 
    sendMessage, 
    sendReadReceipt, 
    deleteMessage,
    lastMessageSource, 
    initialUnreadCount,
    isLoadingMessages,
    messagesError
  };
}


