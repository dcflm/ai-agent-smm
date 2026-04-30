"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle,
  RotateCcw,
  Sparkles,
  Send,
  Copy,
  Check,
} from "lucide-react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function SettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // AI refine chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applyFlash, setApplyFlash] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getPrompt()
      .then((data) => {
        setPrompt(data.prompt);
        setIsCustom(data.is_custom);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.savePrompt(prompt);
      setIsCustom(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to the default system prompt? Your custom prompt will be deleted.")) return;
    setResetting(true);
    try {
      const data = await api.resetPrompt();
      setPrompt(data.prompt);
      setIsCustom(false);
      setSaved(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: userMsg }]);
    setChatLoading(true);
    setRefinedPrompt(null);
    try {
      const data = await api.refinePrompt(prompt, userMsg);
      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Here is the rewritten prompt based on your instruction. Click Apply to use it.",
        },
      ]);
      setRefinedPrompt(data.prompt);
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Refinement failed"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleApplyRefined = useCallback(() => {
    if (!refinedPrompt) return;
    setPrompt(refinedPrompt);
    setRefinedPrompt(null);
    setSaved(false);
    setApplyFlash(true);
    setTimeout(() => setApplyFlash(false), 2500);
    setChatMessages((m) => [
      ...m,
      { role: "assistant", content: "✓ Applied to the editor above. Click Save to keep it." },
    ]);
    // Scroll the textarea into view on mobile (stacked layout)
    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      editorRef.current?.focus();
    }, 100);
  }, [refinedPrompt]);

  const handleCopyRefined = async () => {
    if (!refinedPrompt) return;
    await navigator.clipboard.writeText(refinedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customize the system prompt that controls how the AI agent writes LinkedIn posts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel - Prompt editor */}
        <div className="space-y-4">
          <div className={`bg-white border rounded-2xl overflow-hidden transition-colors duration-300 ${applyFlash ? "border-green-400 ring-2 ring-green-200" : "border-gray-200"}`}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  System Prompt
                  {applyFlash && <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Updated — save now!</span>}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isCustom ? "Using your custom prompt" : "Using default prompt"}
                </p>
              </div>
              {isCustom && (
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="Reset to default"
                >
                  {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setSaved(false); }}
              ref={editorRef}
              className="w-full h-[260px] sm:h-[500px] px-5 py-4 text-sm font-mono text-gray-800 bg-gray-50 resize-none focus:outline-none focus:bg-white transition-colors"
              placeholder="Enter system prompt..."
              spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving || !prompt.trim()}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : saved ? (
                <><CheckCircle className="w-4 h-4" /> Saved!</>
              ) : (
                "Save Prompt"
              )}
            </Button>
            <span className="text-xs text-gray-400">{prompt.length} characters</span>
          </div>
          {saveError && <p className="text-sm text-red-500">{saveError}</p>}
        </div>

        {/* Right panel - AI chat helper */}
        <div className="flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden h-[420px] sm:h-[620px]">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-green-600" />
              AI Prompt Assistant
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Describe what you want changed and the AI will rewrite the prompt for you.
            </p>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Try asking:</p>
                {[
                  "Make the tone more casual and friendly",
                  "Add a rule to always mention our Swiss roots",
                  "Remove image generation instructions",
                  "Make posts shorter, max 150 words",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setChatInput(s)}
                    className="block w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-green-50 hover:text-green-700 px-3 py-2 rounded-lg transition-colors border border-gray-100 hover:border-green-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  m.role === "user"
                    ? "bg-green-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            {refinedPrompt && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-green-800">Rewritten prompt preview:</p>
                <pre className="text-xs text-green-900 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">{refinedPrompt.slice(0, 400)}{refinedPrompt.length > 400 ? "…" : ""}</pre>
                <div className="flex gap-2">
                  <button
                    onClick={handleApplyRefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Apply to Editor
                  </button>
                  <button
                    onClick={handleCopyRefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-600 text-xs font-medium rounded-lg border border-gray-200 hover:border-green-300 hover:text-green-600 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !chatLoading) { e.preventDefault(); handleRefine(); } }}
                placeholder="e.g. Make the tone more casual..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400"
                disabled={chatLoading}
              />
              <button
                onClick={handleRefine}
                disabled={chatLoading || !chatInput.trim()}
                className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
