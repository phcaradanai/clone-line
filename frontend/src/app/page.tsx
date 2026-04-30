"use client";

import React, { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Smile, MoreVertical, Search } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useSearchParams } from 'next/navigation';

const USER1_ID = "00000000-0000-0000-0000-000000000001";
const USER2_ID = "00000000-0000-0000-0000-000000000003";

export default function ChatPage() {
  const [inputValue, setInputValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  
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
  
  const { messages, sendMessage, isConnected } = useChat(roomId, userId);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
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
    <div className="flex h-screen bg-[#F0F2F5] font-sans antialiased text-gray-900">
      {/* Sidebar - Desktop Only */}
      <div className="hidden md:flex w-80 flex-col bg-white border-r border-gray-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#f7f9fa]">
          <div>
            <h1 className="font-bold text-xl text-[#06C755]">LINE Clone</h1>
            <p className="text-[10px] text-gray-400">Logged in as: {currentUser?.username || 'Guest'}</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <MoreVertical className="text-gray-500 cursor-pointer" size={20} />
          </div>
        </div>
        <div className="p-3">
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
      <div className="flex-1 flex flex-col bg-white">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center shadow-sm">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-2xl bg-[#06C755] mr-3" />
            <div>
              <h2 className="font-bold text-gray-800 text-base">Group Chat</h2>
              <p className="text-xs text-gray-400">{isConnected ? 'Online' : 'Offline'}</p>
            </div>
          </div>
          <div className="flex space-edge-x-4 text-gray-500">
            <Search size={20} className="mr-4 cursor-pointer hover:text-[#06C755]" />
            <MoreVertical size={20} className="cursor-pointer hover:text-[#06C755]" />
          </div>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f7f9fa]">
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
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-100 bg-white">
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
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isConnected ? "พิมพ์ข้อความ..." : "กำลังเชื่อมต่อ..."}
              disabled={!isConnected}
              className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-800 py-1"
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
