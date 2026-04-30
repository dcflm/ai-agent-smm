"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Globe, Sparkles, CheckCircle2, ArrowRight,
  ClipboardCopy, Check, Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";

export default function NewsToPostPage() {
  const [url, setUrl] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [generateImage, setGenerateImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    post_id: string;
    text: string;
    news_title: string;
    news_source: string;
    image_url: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const isValidUrl = (s: string) => {
    try {
      new URL(s.startsWith("http") ? s : `https://${s}`);
      return true;
    } catch {
      return false;
    }
  };

  const handleGenerate = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a news article URL.");
      urlRef.current?.focus();
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError("That doesn't look like a valid URL. Make sure to include the full address.");
      urlRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.createPostFromUrl(trimmed, extraContext.trim() || undefined, generateImage);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setUrl("");
    setExtraContext("");
    setResult(null);
    setError(null);
    setTimeout(() => urlRef.current?.focus(), 50);
  };

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">News to Post</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a news article link — Claude reads it and writes a LinkedIn post for bizpando AG.
        </p>
      </div>

      {/* Input card */}
      <Card className="border-gray-200">
        <CardContent className="pt-5 space-y-4">
          {/* URL field */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              News article URL <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={urlRef}
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
                placeholder="https://www.reuters.com/sustainability/..."
                disabled={loading || !!result}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                           placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500
                           focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* Extra context */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Your take <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Any specific angle, message, or context you want included in the post..."
              disabled={loading || !!result}
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                         placeholder-gray-400 resize-none focus:outline-none focus:ring-2
                         focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>

          {/* Image generation toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={generateImage}
              onChange={(e) => setGenerateImage(e.target.checked)}
              disabled={loading || !!result}
              className="rounded accent-green-600 w-4 h-4 cursor-pointer"
            />
            <ImageIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            <span className="text-sm text-gray-600">
              Generate AI image for this post
              <span className="text-xs text-gray-400 ml-1">(adds ~30s)</span>
            </span>
          </label>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Action */}
          {!result ? (
            <Button
              onClick={handleGenerate}
              disabled={loading || !url.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generateImage ? "Fetching article, writing post, generating image..." : "Fetching article and generating post..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Post
                </>
              )}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleReset} className="w-full gap-2 text-sm">
              Generate another post
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Loading hint */}
      {loading && (
        <p className="text-xs text-center text-gray-400 animate-pulse">
          {generateImage
            ? "Fetching the article, writing the post and generating an image — usually 30–60 seconds..."
            : "Fetching the article and writing your post — usually takes 10–20 seconds..."}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">
              Post generated from{" "}
              <span className="font-semibold">{result.news_source}</span>{" "}
              and saved for review.
            </p>
          </div>

          {/* Generated image */}
          {result.image_url && (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <img
                src={result.image_url.startsWith("http") ? result.image_url : `${BACKEND}/${result.image_url}`}
                alt="Generated visual"
                className="w-full max-h-72 object-cover"
              />
            </div>
          )}

          {/* Post preview */}
          <Card className="border-gray-200">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Generated post</p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                >
                  {copied
                    ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</>
                    : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy</>
                  }
                </button>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{result.text}</p>

              {/* Source */}
              <div className="border-t border-gray-100 pt-3 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline truncate"
                >
                  {url}
                </a>
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <Link href="/content">
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white gap-2">
              View in Content Calendar <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
