"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ImagePlus,
  X,
  CheckCircle,
  ArrowRight,
  Upload,
  MapPin,
  Users,
  FileText,
} from "lucide-react";

interface ImagePreview {
  file: File;
  url: string;
}

export default function CreateFromPhotoPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [images, setImages] = useState<ImagePreview[]>([]);
  const [location, setLocation] = useState("");
  const [people, setPeople] = useState("");
  const [context, setContext] = useState("");
  const [dragging, setDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ post_id: string; text: string; image_url: string | null } | null>(null);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleSubmit = async () => {
    if (!context.trim()) {
      setError("Please provide context/caption for the post.");
      return;
    }
    if (images.length === 0) {
      setError("Please upload at least one image.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("context", context.trim());
      if (location.trim()) formData.append("location", location.trim());
      if (people.trim()) formData.append("people", people.trim());
      for (const img of images) {
        formData.append("images", img.file, img.file.name);
      }
      const data = await api.createPostFromImage(formData);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToContent = () => {
    router.push("/content");
  };

  // Success screen
  if (result) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Post Created!</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your post has been saved and submitted for review.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
          {result.image_url && (
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000"}/${result.image_url}`}
              alt="Uploaded"
              className="w-full max-h-64 object-cover"
            />
          )}
          <div className="p-5">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{result.text}</p>
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleGoToContent}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            Go to Content Calendar <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setImages([]);
              setLocation("");
              setPeople("");
              setContext("");
            }}
          >
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create Post from Photo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload photos and provide context - the AI will write a post using only your information.
        </p>
      </div>

      <div className="space-y-5">
        {/* Image upload zone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photos <span className="text-gray-400 font-normal">(up to 3)</span>
          </label>
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => images.length < 3 && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
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
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Upload className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-600">
                  Drop images here or click to upload
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPEG, PNG, WebP - up to 3 photos
                </p>
              </div>
            ) : (
              <div className="p-3">
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative aspect-square group">
                      <img
                        src={img.url}
                        alt={`Upload ${i + 1}`}
                        className="w-full h-full object-cover rounded-xl"
                      />
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

        {/* Context fields */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Post context / caption
            <span className="text-red-400">*</span>
          </label>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Describe what is happening in the photo, key messages, or what you want to communicate. The AI will use ONLY this information."
            className="min-h-[120px] text-sm resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            Be specific - the AI will not add information beyond what you provide here.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              Location
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Zurich, Switzerland"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 text-gray-400" />
              People in photo
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              placeholder="e.g. Mark Li (CEO), Sarah Mwangi"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={loading || !context.trim() || images.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white gap-2 px-8"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating post…</>
            ) : (
              <><ImagePlus className="w-4 h-4" /> Generate Post</>
            )}
          </Button>
          {loading && (
            <p className="text-xs text-gray-400">
              Analyzing images and writing post... this takes a few seconds.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
