"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What news topics should we post about this week?",
  "Generate a post about biochar and African farmers",
  "How are our recent posts performing?",
  "What tone should we use for sustainability content?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm bizpando AG's AI social media assistant. I can help you generate LinkedIn posts, discuss content strategy, analyze performance, and answer questions about your social media presence. What would you like to do?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await api.chat(
        messages.map((m) => ({ role: m.role, content: m.content })),
        text
      );
      setMessages([...updatedMessages, { role: "assistant", content: response.response }]);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Bot className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900">AI Social Media Agent</p>
            <p className="text-xs text-green-500">Online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                message.role === "assistant" ? "bg-green-100" : "bg-gray-200"
              }`}
            >
              {message.role === "assistant" ? (
                <Bot className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <User className="w-3.5 h-3.5 text-gray-600" />
              )}
            </div>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                message.role === "assistant"
                  ? "bg-white border border-gray-200 text-gray-800"
                  : "bg-green-600 text-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5">
              <div className="flex gap-1 items-center h-4">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (shown when only initial message) */}
      {messages.length === 1 && (
        <div className="px-6 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-green-400 hover:text-green-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI agent anything... (Enter to send, Shift+Enter for new line)"
            className="flex-1 resize-none min-h-[44px] max-h-32 text-sm"
            rows={1}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="bg-green-600 hover:bg-green-700 text-white h-11 w-11 p-0 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
