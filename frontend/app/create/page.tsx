"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Sparkles, CheckCircle2, ArrowRight, ClipboardCopy, Check,
  Image as ImageIcon, ShieldCheck, ImagePlus, X, Upload, MapPin, Users,
} from "lucide-react";
import Link from "next/link";

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";

interface ImagePreview {
  file: File;
  url: string;
}

export default function CreatePostPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newsRef = useRef<HTMLTextAreaElement>(null);

  const [news, setNews] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [location, setLocation] = useState("");
  const [people, setPeople] = useState("");
  const [generateImage, setGenerateImage] = useState(true);
  const [dragging, setDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ post_id: string; text: string; image_url: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const hasPhotos = images.length > 0;

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newPreviews: ImagePreview[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (images.length + newPreviews.length >= 3) break;
      newPreviews.push({ file, url: URL.createObjectURL(file) });
    }
    setImages((prev) => [...prev, ...newPreviews].slice(0, 3));
  }, [images]);

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleGenerate = async () => {
    const trimmed = news.trim();
    if (trimmed.length < 20) {
      setError("Please describe what happened in a bit more detail — a couple of sentences is enough.");
      newsRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (hasPhotos) {
        const formData = new FormData();
        formData.append("context", trimmed);
        if (location.trim()) formData.append("location", location.trim());
        if (people.trim()) formData.append("people", people.trim());
        for (const img of images) formData.append("images", img.file, img.file.name);
        const data = await api.createPostFromImage(formData);
        setResult(data);
      } else {
        const data = await api.createPostFromNews(trimmed, generateImage);
        setResult(data);
      }
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
    setImages((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
    setLocation("");
    setPeople("");
    setResult(null);
    setError(null);
    setTimeout(() => newsRef.current?.focus(), 50);
  };

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Post</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe what happened at the company — optionally add your own photos.
          The agent writes a LinkedIn post using only your information.
        </p>
      </div>

      {/* Input card */}
      <Card className="border-gray-200">
        <CardContent className="pt-5 space-y-4">
          {/* News / context text */}
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

          {/* Optional photos */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Photos <span className="text-xs text-gray-400 font-normal">(optional, up to 3 — e.g. from the event)</span>
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => !loading && !result && images.length < 3 && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl transition-all cursor-pointer ${
                dragging
                  ? "border-green-400 bg-green-50"
                  : images.length >= 3
                  ? "border-gray-100 bg-gray-50 cursor-not-allowed"
                  : "border-gray-200 hover:border-green-300 hover:bg-green-50/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              {images.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-4 px-4 text-center">
                  <Upload className="w-4 h-4 text-gray-300" />
                  <p className="text-xs text-gray-400">
                    Drop photos here or click — without photos, an AI image can be generated instead
                  </p>
                </div>
              ) : (
                <div className="p-3">
                  <div className="grid grid-cols-3 gap-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-square group">
                        <img src={img.url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover rounded-xl" />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {images.length < 3 && (
                      <div className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-green-300 transition-colors">
                        <ImagePlus className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Photo-specific hints */}
          {hasPhotos && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  Location <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Zurich, Switzerland"
                  disabled={loading || !!result}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  People in photo <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={people}
                  onChange={(e) => setPeople(e.target.value)}
                  placeholder="e.g. Mark Li (CEO)"
                  disabled={loading || !!result}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Grounding guarantee */}
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <span>
              The post will use <span className="font-semibold">only the information you provide here</span>
              {hasPhotos ? " and what is visible in your photos" : ""} — the agent adds no external facts,
              numbers, or names. Review it before approving, as always.
            </span>
          </div>

          {/* AI image toggle — only when no real photos are attached */}
          {!hasPhotos && (
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
          )}

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
                  {hasPhotos
                    ? "Reading your photos and writing the post..."
                    : generateImage
                    ? "Writing post and generating image..."
                    : "Writing your post..."}
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
              Create another post
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Loading hint */}
      {loading && (
        <p className="text-xs text-center text-gray-400 animate-pulse">
          {hasPhotos
            ? "Analyzing your photos and writing the post — usually 10–20 seconds..."
            : generateImage
            ? "Writing the post and generating a matching image — usually 30–60 seconds..."
            : "Writing your post — usually takes ~10 seconds..."}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">Post created and saved for review.</p>
          </div>

          {result.image_url && (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <img
                src={result.image_url.startsWith("http") ? result.image_url : `${BACKEND}/${result.image_url}`}
                alt="Post visual"
                className="w-full max-h-72 object-cover"
              />
            </div>
          )}

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
            </CardContent>
          </Card>

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
