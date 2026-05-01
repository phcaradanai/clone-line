"use client";

import React, { useState, useRef, useCallback, Suspense } from 'react';
import { Send, Image as ImageIcon, Smile, MoreVertical, Search, ChevronDown } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useChatAutoScroll } from '@/hooks/useChatAutoScroll';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useVisualViewportResize } from '@/hooks/useVisualViewportResize';
import { useSearchParams } from 'next/navigation';

const USER1_ID = "00000000-0000-0000-0000-000000000001";
const USER2_ID = "00000000-0000-0000-0000-000000000003";

function ChatContent() {
  const [inputValue, setInputValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  
  // State สำหรับเก็บข้อมูล User ปัจจุบัน
  const [currentUser, setCurrentUser] = useState<{id: string, username: string} | null>(null);
  
  const roomId = "00000000-0000-0000-0000-000000000002";

  React.useEffect(() => {
    const initUser = async () => {
      // 1. เช็คจาก URL ก่อน (สำหรับ Testing)
      const userParam = searchParams.get('user');
      if (userParam === '2') {
        setCurrentUser({ id: USER2_ID, username: "Test User 2" });
        return;
      }

      // 2. เช็คจาก localStorage
      const savedUser = localStorage.getItem('chat_user');
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
      } else {
        // 3. ถ้าไม่มีเลย ให้ลงทะเบียนใหม่
        try {
          let baseUrl = `http://${window.location.hostname}:8888`;
          if (process.env.NEXT_PUBLIC_BACKEND_URL) {
            baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
          }
          const response = await fetch(`${baseUrl}/register`, { method: 'POST' });
          const newUser = await response.json();
          localStorage.setItem('chat_user', JSON.stringify(newUser));
          setCurrentUser(newUser);
        } catch (error) {
          console.error("Failed to register guest", error);
        }
      }
    };

    initUser();
  }, [searchParams]);

  // ใช้ ID จาก currentUser ถ้ามี
  const userId = currentUser?.id || USER1_ID;
  
  const { messages, sendMessage, isConnected, lastMessageSource } = useChat(roomId, userId);

  // Auto-scroll hook
  const {
    scrollContainerRef,
    bottomSentinelRef,
    showNewMessageIndicator,
    scrollToBottom,
    handleScroll,
  } = useChatAutoScroll(messages, lastMessageSource);

  // Visual viewport resize — keep input visible when keyboard opens
  const handleViewportResize = useCallback(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  useVisualViewportResize(handleViewportResize);

  // Auto-focus input on desktop only
  React.useEffect(() => {
    if (!isMobile && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobile]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
    // Re-focus input after sending (both mobile and desktop)
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      let baseUrl = `http://${window.location.hostname}:8888`;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      }
      
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.url) {
        sendMessage("Sent an image", "image", data.url);
      }
    } catch (error) {
      console.error('Upload failed', error);
    }
  };

  return (
    <div className="flex bg-[#F0F2F5] font-sans antialiased text-gray-900" style={{ height: '100dvh' }}>
      {/* Sidebar - Desktop Only */}
      <div className="hidden md:flex w-80 flex-col bg-white border-r border-gray-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#f7f9fa] shrink-0">
          <div>
            <h1 className="font-bold text-xl text-[#06C755]">LINE Clone</h1>
            <p className="text-[10px] text-gray-400">Logged in as: {currentUser?.username || 'Guest'}</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <MoreVertical className="text-gray-500 cursor-pointer" size={20} />
          </div>
        </div>
        <div className="p-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="ค้นหาแชท..." 
              className="w-full bg-gray-100 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#06C755]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center p-3 bg-green-50 cursor-pointer transition-colors border-b border-gray-50">
            <div className="w-12 h-12 rounded-2xl bg-[#06C755] mr-3 flex-shrink-0 flex items-center justify-center text-white font-bold">GC</div>
            <div className="flex-1 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-800">Group Chat (Test)</span>
                <span className="text-xs text-gray-400">Now</span>
              </div>
              <p className="text-sm text-[#06C755] truncate">Connected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-white">
        {/* Chat Header — shrink-0 keeps it fixed height */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center shadow-sm shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-2xl bg-[#06C755] mr-3" />
            <div>
              <h2 className="font-bold text-gray-800 text-base">Group Chat</h2>
              <p className="text-xs text-gray-400">{isConnected ? 'Online' : 'Offline'}</p>
            </div>
          </div>
          <div className="flex text-gray-500">
            <Search size={20} className="mr-4 cursor-pointer hover:text-[#06C755]" />
            <MoreVertical size={20} className="cursor-pointer hover:text-[#06C755]" />
          </div>
        </div>

        {/* Messages List — flex-1 + min-h-0 + overflow-y-auto = independent scroll */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-[#f7f9fa]"
          style={{ overscrollBehaviorY: 'contain' }}
        >
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                msg.sender === 'me' 
                  ? 'bg-[#06C755] text-white rounded-tr-none' 
                  : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                {msg.type === 'image' ? (
                  <img src={msg.file_url} alt="Uploaded" className="rounded-lg max-w-full h-auto mb-1" />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
                <span className={`text-[10px] block mt-1 ${msg.sender === 'me' ? 'text-green-100 text-right' : 'text-gray-400'}`}>
                  {msg.time}
                </span>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
              <Smile size={48} />
              <p>ยังไม่มีข้อความ เริ่มแชทเลย!</p>
            </div>
          )}
          {/* Bottom sentinel for reliable scrollIntoView */}
          <div ref={bottomSentinelRef} aria-hidden="true" className="h-px" />
        </div>

        {/* New Message Indicator — floating above input */}
        {showNewMessageIndicator && (
          <div className="relative shrink-0">
            <button
              onClick={() => scrollToBottom("smooth")}
              className="new-message-indicator absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 bg-[#06C755] text-white text-xs font-medium rounded-full shadow-lg hover:bg-[#05b34c] transition-colors z-10"
            >
              <ChevronDown size={14} />
              New messages
            </button>
          </div>
        )}

        {/* Input Area — shrink-0 + safe area padding keeps it fixed at bottom */}
        <div
          className="p-4 border-t border-gray-100 bg-white shrink-0"
          style={{ paddingBottom: `max(1rem, env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="flex items-center space-x-3 bg-gray-50 rounded-2xl px-4 py-2 border border-gray-200 focus-within:border-[#06C755] transition-all">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              className="hidden" 
              accept="image/*" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-[#06C755]"
            >
              <ImageIcon size={20} />
            </button>
            <button className="text-gray-400 hover:text-[#06C755]"><Smile size={20} /></button>
            <input 
              ref={inputRef}
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isConnected ? "พิมพ์ข้อความ..." : "กำลังเชื่อมต่อ..."}
              disabled={!isConnected}
              className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-800 py-1"
              enterKeyHint="send"
            />
            <button 
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected}
              className={`p-2 rounded-full transition-all ${inputValue.trim() && isConnected ? 'bg-[#06C755] text-white' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center" style={{ height: '100dvh' }}>Loading Chat...</div>}>
      <ChatContent />
    </Suspense>
  );
}
