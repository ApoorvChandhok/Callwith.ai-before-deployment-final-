"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bot, X, Send, Loader2, MessageCircle, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCopilotContext } from "./CopilotContext";
import { motion, AnimatePresence } from "framer-motion";

// TODO: [REMOVE BEFORE GO-LIVE] Token usage tracking for dev/testing only
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokenUsage?: TokenUsage;
}

export default function CopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { pageName, metadata } = useCopilotContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading) return;

      const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
      const assistantId = (Date.now() + 1).toString();

      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
      setInputValue("");
      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      // Auto-abort after 30s
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
            context: { pageName, metadata },
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Check for token metadata marker (may arrive mid-buffer)
          const markerIdx = buffer.indexOf("\n__TOKENS__");
          if (markerIdx !== -1) {
            const textPart = buffer.substring(0, markerIdx);
            const tokenPart = buffer.substring(markerIdx + "\n__TOKENS__".length);
            buffer = textPart; // strip metadata from displayed content
            try {
              const usage: TokenUsage = JSON.parse(tokenPart);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: textPart, tokenUsage: usage } : m
                )
              );
            } catch (_) {}
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: buffer } : m))
            );
          }
        }
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, something went wrong. Please try again." }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [inputValue, isLoading, messages, pageName, metadata]
  );

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl px-4 py-2 rounded-full shadow-lg border border-gray-200/50 dark:border-white/8 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:shadow-xl transition-shadow duration-200"
              onClick={() => setIsOpen(true)}
            >
              Confused? Ask me! 👋
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          suppressHydrationWarning
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all duration-300 ${
            isOpen
              ? "bg-gray-700 dark:bg-[#21262d] shadow-gray-700/20"
              : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30 hover:shadow-indigo-500/50"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Sparkles className="w-6 h-6" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Chat Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-24 right-6 w-[380px] h-[550px] bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 border border-gray-200/50 dark:border-white/8 flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center gap-3 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/20 blur-xl" />
                <div className="absolute bottom-0 left-8 w-16 h-16 rounded-full bg-white/10 blur-lg" />
              </div>
              <div className="relative flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">CallWith.ai Copilot</h3>
                  <p className="text-[11px] text-white/70">I know you&apos;re on {pageName}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-hide">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 dark:text-gray-500 my-auto flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-indigo-400 opacity-60" />
                  </div>
                  <p className="text-sm">How can I help you today?</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600">
                    Ask about workflows, leads, or anything in the dashboard
                  </p>
                </div>
              )}

              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-indigo-500 text-white ml-auto rounded-br-md shadow-sm shadow-indigo-500/20"
                      : "bg-gray-100/80 dark:bg-white/5 text-gray-800 dark:text-gray-200 mr-auto rounded-bl-md border border-gray-200/30 dark:border-white/5"
                  }`}
                >
                  {m.role === "assistant" && m.content === "" ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a {...props} className="text-indigo-300 underline hover:text-indigo-200" target="_blank" />
                        ),
                        p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                        code: ({ node, ...props }) => (
                          <code {...props} className="bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded text-xs font-mono" />
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  )}
                  {/* TODO: [REMOVE BEFORE GO-LIVE] Token usage badge for testing */}
                  {m.role === "assistant" && m.tokenUsage && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200/20 dark:border-white/5 flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-600 font-mono">
                      <span title="Prompt tokens" className="flex items-center gap-0.5">
                        <span className="text-indigo-400/60">↑</span>{m.tokenUsage.promptTokens}
                      </span>
                      <span title="Completion tokens" className="flex items-center gap-0.5">
                        <span className="text-emerald-400/60">↓</span>{m.tokenUsage.completionTokens}
                      </span>
                      <span title="Total tokens" className="text-gray-500 dark:text-gray-700">
                        = {m.tokenUsage.totalTokens} tok
                      </span>
                    </div>
                  )}
                </motion.div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 border-t border-gray-200/50 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.02]">
              <div className="relative">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isLoading ? "Generating..." : "Ask me anything..."}
                  className="w-full bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/8 rounded-xl py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60 transition-all duration-200"
                  disabled={isLoading}
                  autoComplete="off"
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="Stop generation"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-red-500/90 text-white rounded-lg hover:bg-red-600 transition-colors duration-150"
                  >
                    <span className="w-3 h-3 rounded-sm bg-white" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-indigo-500 text-white rounded-lg disabled:opacity-30 hover:bg-indigo-600 transition-colors duration-150"
                  >
                    <Send className="w-4 h-4 -ml-0.5" />
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
