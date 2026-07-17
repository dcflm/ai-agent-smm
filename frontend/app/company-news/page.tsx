"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Megaphone, Sparkles, CheckCircle2, ArrowRight,
  ClipboardCopy, Check, Image as ImageIcon, ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";

export default function CompanyNewsPage() {
  const [news, setNews] = useState("");
  const [generateImage, setGenerateImage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    post_id: string;
    text: string;
    news_title: string;
    image_url: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const newsRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    const trimmed = news.trim();
    if (trimmed.length < 20) {
      setError("Please describe the news in a bit more detail — a couple of sentences is enough.");
      newsRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.createPostFromNews(trimmed, generateImage);
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
    setNews("");
    setResult(null);
    setError(null);
    setTimeout(() => newsRef.current?.focus(), 50);
  };

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company News → Post</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe what happened at the company — the agent writes a LinkedIn post about it,
          with a matching image.
        </p>
      </div>

      {/* Input card */}
      <Card className="border-gray-200">
        <CardContent className="pt-5 space-y-4">
          {/* News text */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              What happened? <span className="text-red-400">*</span>
            </label>
            <textarea
              ref={newsRef}
              value={news}
              onChange={(e) => { setNews(e.target.value); setError(null); }}
              placeholder="e.g. This week we signed a partnership with AgroServe Benin. Together we'll collect cotton stalks from 200 smallholder farms for our first pyrolysis facility, starting this September."
              disabled={loading || !!result}
              rows={5}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                         placeholder-gray-400 resize-none focus:outline-none focus:ring-2
                         focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>

          {/* Grounding guarantee */}
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <span>
              The post will use <span className="font-semibold">only the information you write here</span> —
              the agent adds no external facts, numbers, or names. Review it before approving, as always.
            </span>
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
              Generate AI image matched to the post
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
              disabled={loading || news.trim().length === 0}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generateImage ? "Writing post and generating image..." : "Writing your post..."}
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
              Write another news item
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Loading hint */}
      {loading && (
        <p className="text-xs text-center text-gray-400 animate-pulse">
          {generateImage
            ? "Writing the post and generating a matching image — usually 30–60 seconds..."
            : "Writing your post — usually takes ~10 seconds..."}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">
              Post created from your company news and saved for review.
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

              <div className="border-t border-gray-100 pt-3 flex items-center gap-2">
                <Megaphone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-400 truncate">Company news · {result.news_title}</span>
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
