"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, Post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  MessageSquare,
  Download,
  Image as ImageIcon,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  X,
  Sparkles,
  ThumbsUp,
  MessageCircle,
  Share2,
  Send,
  MoreHorizontal,
  Globe,
  Camera,
  Link2,
  Bot,
} from "lucide-react";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";

// Poll interval for background sync (Notion → web app)
const POLL_INTERVAL_IDLE = 8000;
const POLL_INTERVAL_GENERATING = 3000;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  pending_review: "bg-yellow-100 text-yellow-700",
  changes_requested: "bg-orange-100 text-orange-700",
  approved: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  all: "All posts",
  pending_review: "Pending Review",
  changes_requested: "Changes Requested",
  draft: "Draft",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
};

const ALL_STATUSES = [
  "all",
  "pending_review",
  "changes_requested",
  "draft",
  "approved",
  "published",
  "rejected",
];

function resolveImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  return `${BACKEND}/${raw.replace(/^\//, "")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return "Just now";
}

interface Toast {
  id: number;
  msg: string;
  type: "success" | "error" | "info";
}
let toastSeq = 0;

// ─── Source tag helper ───────────────────────────────────────────────────────
function getSourceTag(post: Post): { label: string; colorClass: string; Icon: React.ElementType } | null {
  if (post.news_source === "source:photo") {
    return { label: "From Photo", colorClass: "bg-purple-100 text-purple-700", Icon: Camera };
  }
  if (post.news_source?.startsWith("source:url:")) {
    const domain = post.news_source.replace("source:url:", "");
    return { label: domain || "From URL", colorClass: "bg-blue-100 text-blue-700", Icon: Link2 };
  }
  if (post.news_source || post.news_title) {
    return { label: "Auto-generated", colorClass: "bg-orange-100 text-orange-700", Icon: Bot };
  }
  return null;
}

// ─── LinkedIn Post Card ──────────────────────────────────────────────────────
function PostCard({
  post,
  processingIds,
  onOpen,
  onApprove,
  onReject,
  onRevise,
  onReopen,
  onDelete,
  actionLoading,
}: {
  post: Post;
  processingIds: Set<string>;
  onOpen: (p: Post) => void;
  onApprove: (p: Post) => void;
  onReject: (p: Post) => void;
  onRevise: (p: Post) => void;
  onReopen: (p: Post) => void;
  onDelete: (p: Post) => void;
  actionLoading: string | null;
}) {
  const img = resolveImageUrl(post.image_url);
  const isGenerating = post.text === "__generating__";
  const isProcessing = isGenerating || processingIds.has(post.id);
  const canAct = ["pending_review", "changes_requested", "draft"].includes(post.status) && !isProcessing;
  const canReopen = ["rejected", "approved", "published"].includes(post.status) && !isProcessing;

  if (isProcessing) {
    const label = isGenerating ? "AI is writing your post…" : "AI is rewriting with your feedback…";
    return (
      <div className="bg-white border border-orange-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gray-200 animate-pulse" />
              <div className="space-y-1.5">
                <div className="w-32 h-3 bg-gray-200 rounded animate-pulse" />
                <div className="w-20 h-2.5 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            {isGenerating && (
              <button
                onClick={() => onDelete(post)}
                title="Cancel generation"
                className="text-gray-300 hover:text-red-400 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="space-y-2 mb-4">
            <div className="w-full h-3 bg-gray-100 rounded animate-pulse" />
            <div className="w-5/6 h-3 bg-gray-100 rounded animate-pulse" />
            <div className="w-4/6 h-3 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="w-full bg-gray-100 rounded-xl animate-pulse" style={{ aspectRatio: "3/4" }} />
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            {label}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* LinkedIn-style card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => onOpen(post)}
          >
            {/* Company avatar */}
            <div className="w-11 h-11 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              B
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                bizpando AG
              </p>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {timeAgo(post.created_at)}
                <span className="mx-0.5">·</span>
                <Globe className="w-3 h-3" />
              </p>
              {(() => {
                const tag = getSourceTag(post);
                if (!tag) return null;
                const { Icon } = tag;
                return (
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 ${tag.colorClass}`}>
                    <Icon className="w-3 h-3" />
                    {tag.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status] ?? ""}`}>
              {STATUS_LABELS[post.status] ?? post.status}
            </span>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Post text - fixed height, click opens modal */}
        <div className="mt-3 cursor-pointer" onClick={() => onOpen(post)}>
          <p className="text-sm text-gray-800 leading-relaxed line-clamp-4">
            {post.text}
          </p>
          {post.text.length > 220 && (
            <span className="text-xs text-gray-400 mt-1 block">Click to read more</span>
          )}
        </div>
      </div>

      {/* Image */}
      {img && (
        <div
          className="overflow-hidden cursor-pointer"
          style={{ aspectRatio: "3/4" }}
          onClick={() => onOpen(post)}
        >
          <img
            src={img}
            alt="Post visual"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* LinkedIn-style engagement row (decorative) */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-400">
        <span className="flex items-center gap-0.5">
          <span className="text-base">👍</span>
          <span className="text-blue-500">❤️</span>
        </span>
        <span className="ml-1">
          {post.status === "published" ? "-" : "Awaiting review"}
        </span>
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-100 mt-auto">
        {canAct ? (
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <button onClick={() => onApprove(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-600 hover:bg-green-50 transition-colors">
              {actionLoading === `approve-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Approve
            </button>
            <button onClick={() => onRevise(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-orange-500 hover:bg-orange-50 transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />
              Changes
            </button>
            <button onClick={() => onReject(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors">
              {actionLoading === `reject-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
          </div>
        ) : canReopen ? (
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <button onClick={() => onReopen(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-500 hover:bg-blue-50 transition-colors">
              {actionLoading === `reopen-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-open for Review
            </button>
            <button onClick={() => onOpen(post)}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-400 hover:bg-gray-50 transition-colors">
              View Details
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            {(["Like","Comment","Repost","Send"] as const).map((label, i) => {
              const icons = [ThumbsUp, MessageCircle, Share2, Send];
              const Icon = icons[i];
              return (
                <button key={label} className="flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-gray-400 hover:bg-gray-50 transition-colors">
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ContentPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genWithImage, setGenWithImage] = useState(true);
  const [hasGenerating, setHasGenerating] = useState(false);
  const [showGenBanner, setShowGenBanner] = useState(false);
  const [genBannerDone, setGenBannerDone] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Modal state
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showEdits, setShowEdits] = useState(false);
  const [edits, setEdits] = useState<{ id: string; diff_summary: string; created_at: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Revise modal (quick panel from card)
  const [revisePost, setRevisePost] = useState<Post | null>(null);
  const [reviseFeedback, setReviseFeedback] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);

  const postIdsRef = useRef<Set<string>>(new Set());
  const postStatusRef = useRef<Map<string, string>>(new Map());
  const selectedRef = useRef<Post | null>(null);
  selectedRef.current = selectedPost;

  const addToast = useCallback((msg: string, type: Toast["type"] = "success") => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const fetchPosts = useCallback(async (status?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getPosts(status === "all" || !status ? undefined : status);

      // Detect new posts
      const prevIds = postIdsRef.current;
      const newIds = new Set(data.map((p) => p.id));
      if (prevIds.size > 0) {
        const added = data.filter((p) => !prevIds.has(p.id) && p.text !== "__generating__");
        if (added.length > 0) {
          addToast(`${added.length} new post${added.length > 1 ? "s" : ""} ready for review!`, "info");
        }
      }
      postIdsRef.current = newIds;

      // Detect status changes (Notion → web app)
      data.forEach((p) => {
        const prev = postStatusRef.current.get(p.id);
        if (prev && prev !== p.status && p.text !== "__generating__") {
          addToast(
            `"${(p.news_title || "Post").slice(0, 40)}" → ${STATUS_LABELS[p.status] ?? p.status}`,
            "info"
          );
          if (selectedRef.current?.id === p.id) {
            setSelectedPost((sp) => sp ? { ...sp, ...p } : sp);
          }
          // Remove from processing set when revision completes
          if (prev === "changes_requested" && p.status === "pending_review") {
            setProcessingIds((ids) => { const n = new Set(ids); n.delete(p.id); return n; });
          }
        }
      });
      postStatusRef.current = new Map(data.map((p) => [p.id, p.status]));

      // Track generating state for faster polling
      const gen = data.some((p) => p.text === "__generating__");
      setHasGenerating(gen);
      if (gen === false && generating) {
        setGenerating(false);
      }

      setPosts(data);
    } catch {
      // silent fail on background polls
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, generating]);

  // Initial load
  useEffect(() => {
    fetchPosts(statusFilter);
  }, [statusFilter]); // eslint-disable-line

  // Background polling - faster when generation is active
  useEffect(() => {
    const interval = hasGenerating ? POLL_INTERVAL_GENERATING : POLL_INTERVAL_IDLE;
    const timer = setInterval(() => fetchPosts(statusFilter, true), interval);
    return () => clearInterval(timer);
  }, [statusFilter, hasGenerating, fetchPosts]);

  // Auto-dismiss generation banner when generation completes
  useEffect(() => {
    if (!hasGenerating && showGenBanner) {
      setGenBannerDone(true);
      const t = setTimeout(() => { setShowGenBanner(false); setGenBannerDone(false); }, 2500);
      return () => clearTimeout(t);
    }
  }, [hasGenerating, showGenBanner]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.generatePost(undefined, genWithImage);
      setShowGenBanner(true);
      setGenBannerDone(false);
      setTimeout(() => fetchPosts(statusFilter, true), 800);
    } catch {
      addToast("Failed to start generation", "error");
    } finally {
      // Reset immediately - background polling tracks the real progress
      setGenerating(false);
    }
  };

  // ── Card quick actions ──────────────────────────────────────────────────────
  const handleCardApprove = async (post: Post) => {
    setActionLoading(`approve-${post.id}`);
    try {
      await api.approvePost(post.id);
      addToast("Post approved!");
      fetchPosts(statusFilter, true);
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCardReject = async (post: Post) => {
    setActionLoading(`reject-${post.id}`);
    try {
      await api.rejectPost(post.id);
      addToast("Post rejected.");
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Rejection failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCardRevise = (post: Post) => {
    setRevisePost(post);
    setReviseFeedback("");
  };

  const handleCardReopen = async (post: Post) => {
    setActionLoading(`reopen-${post.id}`);
    try {
      await api.reopenPost(post.id);
      addToast("Post re-opened for review.");
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Failed to re-open post", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCardDelete = async (post: Post) => {
    setActionLoading(`delete-${post.id}`);
    try {
      await api.deletePost(post.id);
      addToast("Post deleted.");
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Delete failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitRevise = async () => {
    if (!revisePost || !reviseFeedback.trim()) return;
    setActionLoading(`revise-${revisePost.id}`);
    try {
      await api.revisePost(revisePost.id, reviseFeedback);
      addToast("Revision started! Agent is rewriting (~60s)…", "info");
      setProcessingIds((ids) => new Set([...ids, revisePost.id]));
      setRevisePost(null);
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Revision failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Modal actions ───────────────────────────────────────────────────────────
  const openPost = (post: Post) => {
    if (post.text === "__generating__") return;
    setSelectedPost(post);
    setFeedback("");
    setShowFeedback(false);
    setShowEdits(false);
    setEdits([]);
    setConfirmDelete(false);
  };

  const closePost = () => {
    setSelectedPost(null);
    fetchPosts(statusFilter, true);
  };

  const handleModalApprove = async () => {
    if (!selectedPost) return;
    setActionLoading("modal-approve");
    try {
      await api.approvePost(selectedPost.id);
      addToast("Post approved and queued!");
      setSelectedPost({ ...selectedPost, status: "approved" });
      fetchPosts(statusFilter, true);
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleModalReject = async () => {
    if (!selectedPost) return;
    setActionLoading("modal-reject");
    try {
      await api.rejectPost(selectedPost.id);
      addToast("Post rejected.");
      setSelectedPost({ ...selectedPost, status: "rejected" });
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Rejection failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleModalRevise = async () => {
    if (!selectedPost || !feedback.trim()) return;
    setActionLoading("modal-revise");
    try {
      await api.revisePost(selectedPost.id, feedback);
      addToast("Revision started! Check back in ~60s.", "info");
      setProcessingIds((ids) => new Set([...ids, selectedPost.id]));
      setSelectedPost({ ...selectedPost, status: "changes_requested" });
      setShowFeedback(false);
      setFeedback("");
      closePost();
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Revision failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedPost) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setActionLoading("delete");
    try {
      await api.deletePost(selectedPost.id);
      addToast("Post deleted.");
      closePost();
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Delete failed", "error");
    } finally {
      setActionLoading(null);
      setConfirmDelete(false);
    }
  };

  const handleLoadEdits = async () => {
    if (!selectedPost) return;
    if (showEdits) { setShowEdits(false); return; }
    try {
      const data = await api.getPostEdits(selectedPost.id);
      setEdits(data);
      setShowEdits(true);
    } catch {
      addToast("Could not load edit history", "error");
    }
  };

  const handleDownload = async (url: string, postId: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `post-image-${postId.slice(0, 8)}.png`;
      a.click();
    } catch {
      addToast("Download failed", "error");
    }
  };

  const canActOnSelected = selectedPost
    ? ["pending_review", "changes_requested", "draft"].includes(selectedPost.status)
    : false;

  const handleModalReopen = async () => {
    if (!selectedPost) return;
    setActionLoading("modal-reopen");
    try {
      await api.reopenPost(selectedPost.id);
      addToast("Post re-opened for review.");
      setSelectedPost({ ...selectedPost, status: "pending_review" });
      fetchPosts(statusFilter, true);
    } catch {
      addToast("Failed to re-open", "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Toast stack */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm pointer-events-auto ${
              t.type === "success" ? "bg-green-600 text-white"
              : t.type === "error" ? "bg-red-600 text-white"
              : "bg-gray-900 text-white"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Generation In-Progress Banner */}
      {showGenBanner && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-medium transition-all max-w-md w-[calc(100%-2rem)] ${
          genBannerDone ? "bg-green-600 text-white" : "bg-gray-900 text-white"
        }`}>
          {genBannerDone ? (
            <>
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span className="flex-1">Post generated! Check it in the grid above.</span>
            </>
          ) : (
            <>
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Generating your post...</p>
                <p className="text-xs text-gray-400 mt-0.5">This takes 1-3 minutes. You can keep working - we'll notify you when it's ready.</p>
              </div>
              <button
                onClick={() => setShowGenBanner(false)}
                className="ml-2 text-gray-400 hover:text-white transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {posts.filter((p) => p.text !== "__generating__").length} posts
            {hasGenerating && " · 1 generating…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={genWithImage}
              onChange={(e) => setGenWithImage(e.target.checked)}
              className="rounded accent-green-600"
            />
            <ImageIcon className="w-3.5 h-3.5" />
            Generate image
          </label>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Plus className="w-4 h-4" /> New Post</>
            }
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-96 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No posts found. Generate your first post!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              processingIds={processingIds}
              onOpen={openPost}
              onApprove={handleCardApprove}
              onReject={handleCardReject}
              onRevise={handleCardRevise}
              onReopen={handleCardReopen}
              onDelete={handleCardDelete}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* ── Quick Revise Modal (from card) ── */}
      {revisePost && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Request Changes</h3>
              <button onClick={() => setRevisePost(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Describe what to change - the AI agent will rewrite the post and generate a new image.
            </p>
            <Textarea
              value={reviseFeedback}
              onChange={(e) => setReviseFeedback(e.target.value)}
              placeholder="e.g. 'Make it shorter and add a surprising statistic at the start. Focus on European market.'"
              className="min-h-[120px] text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitRevise}
                disabled={!reviseFeedback.trim() || !!actionLoading}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white gap-2"
              >
                {actionLoading?.startsWith("revise-") ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Regenerate with Feedback</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setRevisePost(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full Post Detail Modal ── */}
      {selectedPost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex overflow-hidden">

            {/* LEFT - image */}
            <div className="w-72 shrink-0 bg-gray-50 flex flex-col">
              {(() => {
                const img = resolveImageUrl(selectedPost.image_url);
                return img ? (
                  <div className="flex-1 relative overflow-hidden">
                    <img
                      src={img}
                      alt="Generated visual"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleDownload(img, selectedPost.id)}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 hover:bg-white text-gray-700 text-xs font-medium px-3 py-2 rounded-lg shadow flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Image
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-300 p-8">
                    <ImageIcon className="w-12 h-12" />
                    <span className="text-xs text-center">No image</span>
                  </div>
                );
              })()}
            </div>

            {/* RIGHT - content */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">
                    {selectedPost.news_title || "Post Detail"}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedPost.status] ?? ""}`}>
                      {STATUS_LABELS[selectedPost.status] ?? selectedPost.status}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(selectedPost.created_at).toLocaleDateString("en-DE", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                    {selectedPost.published_at && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Published
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={closePost} className="text-gray-400 hover:text-gray-700 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Post text */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {selectedPost.text}
                  </p>
                </div>

                {/* News source */}
                {selectedPost.news_source && (
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <a href={selectedPost.news_source} target="_blank" rel="noopener noreferrer"
                      className="text-green-600 hover:underline truncate">
                      {selectedPost.news_source}
                    </a>
                  </div>
                )}

                {/* Review actions */}
                {canActOnSelected && (
                  <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Review Actions
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleModalApprove} disabled={!!actionLoading}
                        className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-1">
                        {actionLoading === "modal-approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve & Publish
                      </Button>
                      <Button onClick={handleModalReject} disabled={!!actionLoading}
                        variant="outline" className="gap-2 border-red-200 text-red-500 hover:bg-red-50">
                        {actionLoading === "modal-reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Reject
                      </Button>
                    </div>

                    <button
                      onClick={() => { setShowFeedback((v) => !v); setFeedback(""); }}
                      className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2 rounded-lg border transition ${
                        showFeedback
                          ? "border-orange-300 bg-orange-50 text-orange-600"
                          : "border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {showFeedback ? "Cancel feedback" : "Request Changes & Regenerate"}
                    </button>

                    {showFeedback && (
                      <div className="space-y-2">
                        <Textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Describe what to change - e.g. 'Make the tone more formal', 'Focus on EU market', 'Shorten to 3 paragraphs'…"
                          className="min-h-[100px] text-sm resize-none border-orange-200"
                          autoFocus
                        />
                        <Button
                          onClick={handleModalRevise}
                          disabled={!feedback.trim() || actionLoading === "modal-revise"}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
                        >
                          {actionLoading === "modal-revise"
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Agent rewriting… (~60s)</>
                            : <><Sparkles className="w-4 h-4" /> Regenerate with Feedback</>
                          }
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Re-open for rejected/approved */}
                {selectedPost && ["rejected", "approved", "published"].includes(selectedPost.status) && (
                  <div className="border border-blue-100 rounded-xl p-4 space-y-2 bg-blue-50/40">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Change Status</p>
                    <Button
                      onClick={handleModalReopen}
                      disabled={!!actionLoading}
                      variant="outline"
                      className="w-full gap-2 border-blue-200 text-blue-600 hover:bg-blue-50"
                    >
                      {actionLoading === "modal-reopen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Re-open for Review
                    </Button>
                  </div>
                )}

                {/* Edit history */}
                <div>
                  <button onClick={handleLoadEdits}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium py-1">
                    {showEdits ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Edit History
                    {edits.length > 0 && (
                      <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 text-xs">{edits.length}</span>
                    )}
                  </button>
                  {showEdits && (
                    <div className="mt-2 space-y-2">
                      {edits.length === 0 ? (
                        <p className="text-xs text-gray-400">No revisions yet.</p>
                      ) : edits.map((e) => (
                        <div key={e.id} className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-xs space-y-1">
                          <p className="font-medium text-orange-700">
                            Feedback: <span className="font-normal">{e.diff_summary}</span>
                          </p>
                          <p className="text-gray-400">{new Date(e.created_at).toLocaleString("en-DE")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <div />

                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-500 font-medium">Sure?</span>
                    <Button onClick={handleDelete} disabled={actionLoading === "delete"} size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-3">
                      {actionLoading === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
                    </Button>
                    <Button onClick={() => setConfirmDelete(false)} variant="ghost" size="sm" className="text-xs h-7 px-3">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Delete post
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
