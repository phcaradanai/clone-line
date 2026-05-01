"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export type Message = {
  id?: string;
  room_id: string;
  user_id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  file_url?: string;
  time?: string;
  sender?: 'me' | 'other';
};

export type MessageSource = 'sent' | 'received' | null;

export function useChat(roomId: string, userId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [lastMessageSource, setLastMessageSource] = useState<MessageSource>(null);

  useEffect(() => {
    // 1. Load History
    const loadHistory = async () => {
      try {
        let baseUrl = `http://${window.location.hostname}:8888`;
        const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (envBackendUrl) {
          baseUrl = envBackendUrl;
        }
        
        const response = await fetch(`${baseUrl}/messages?room_id=${roomId}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const formattedMessages = data.reverse().map((msg: any) => ({
            ...msg,
            sender: msg.user_id === userId ? 'me' : 'other',
            time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setMessages(formattedMessages);
        }
      } catch (error) {
        console.error("Failed to load history", error);
      }
    };

    loadHistory();

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
        // Transform incoming message
        const incomingMsg: Message = {
          ...data,
          sender: data.user_id === userId ? 'me' : 'other',
          time: new Date(data.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setLastMessageSource(incomingMsg.sender === 'me' ? 'sent' : 'received');
        setMessages((prev) => [...prev, incomingMsg]);
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
  }, [roomId, userId]);

  const sendMessage = useCallback((content: string, type: 'text' | 'image' = 'text', fileUrl?: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const msg = {
        room_id: roomId,
        user_id: userId,
        content: content,
        type: type,
        file_url: fileUrl,
      };
      setLastMessageSource('sent');
      socketRef.current.send(JSON.stringify(msg));
    }
  }, [roomId, userId]);

  return { messages, isConnected, sendMessage, lastMessageSource };
}
