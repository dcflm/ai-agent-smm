"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, withRetry, Post } from "@/lib/api";
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
  Check,
  CheckSquare,
  Globe,
  Camera,
  Link2,
  Megaphone,
  Bot,
  Pencil,
  Save,
} from "lucide-react";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";

// Poll interval for background sync with the backend
const POLL_INTERVAL_IDLE = 8000;
const POLL_INTERVAL_GENERATING = 2000;

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
  if (post.news_source === "source:company-news") {
    return { label: "Company News", colorClass: "bg-teal-100 text-teal-700", Icon: Megaphone };
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
  selectMode,
  selected,
  onToggleSelect,
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
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (p: Post) => void;
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
    <div
      onClick={selectMode ? () => onToggleSelect(post) : undefined}
      className={`bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col transition-shadow ${
        selected
          ? "border-green-600 ring-2 ring-green-600/60"
          : "border-gray-200"
      } ${selectMode ? "cursor-pointer hover:shadow-md" : ""}`}
    >
      {/* LinkedIn-style card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => { if (!selectMode) onOpen(post); }}
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
            {selectMode ? (
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected ? "bg-green-600 border-green-600" : "border-gray-300 bg-white"
                }`}
              >
                {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </span>
            ) : (
              <button className="text-gray-400 hover:text-gray-600">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Post text - fixed height, click opens modal */}
        <div className="mt-3 cursor-pointer" onClick={() => { if (!selectMode) onOpen(post); }}>
          <p className="text-sm text-gray-800 leading-relaxed line-clamp-4">
            {post.text}
          </p>
          {post.text.length > 220 && (
            <span className="text-xs text-gray-400 mt-1 block">Click to read more</span>
          )}
        </div>
      </div>

      {/* Image — 16:9 landscape on mobile (saves space), 3:4 portrait on desktop */}
      {img && (
        <div
          className="overflow-hidden cursor-pointer aspect-video sm:aspect-[3/4]"
          onClick={() => { if (!selectMode) onOpen(post); }}
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

      {/* Action buttons (hidden while selecting — use the bulk bar instead) */}
      <div className="border-t border-gray-100 mt-auto">
        {selectMode ? (
          <div className="flex items-center justify-center py-2.5">
            <span className={`text-xs font-medium px-4 py-1 ${selected ? "text-green-600" : "text-gray-400"}`}>
              {selected ? "Selected ✓" : "Tap to select"}
            </span>
          </div>
        ) : canAct ? (
          <div className="flex items-center gap-2 px-3 pb-3 pt-2">
            <button onClick={() => onApprove(post)} disabled={!!actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 active:scale-95 transition-all disabled:opacity-40">
              {actionLoading === `approve-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Approve
            </button>
            <button onClick={() => onRevise(post)} disabled={!!actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 active:scale-95 transition-all disabled:opacity-40">
              <Bot className="w-3.5 h-3.5" />
              AI Revise
            </button>
            <button onClick={() => onReject(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-gray-50 text-gray-400 border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 active:scale-95 transition-all disabled:opacity-40">
              {actionLoading === `reject-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : canReopen ? (
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <button onClick={() => onReopen(post)} disabled={!!actionLoading}
              className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-blue-500 hover:bg-blue-50 transition-colors">
              {actionLoading === `reopen-${post.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-open
            </button>
            <button onClick={() => onOpen(post)}
              className="flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-gray-400 hover:bg-gray-50 transition-colors">
              View Details
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-2.5">
            <button onClick={() => onOpen(post)}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors px-4 py-1">
              View post →
            </button>
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genWithImage, setGenWithImage] = useState(true);
  const [hasGenerating, setHasGenerating] = useState(false);
  const [showGenBanner, setShowGenBanner] = useState(false);
  const [genBannerDone, setGenBannerDone] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Modal state
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showEdits, setShowEdits] = useState(false);
  const [edits, setEdits] = useState<{ id: string; diff_summary: string; created_at: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Manual text editing (detail modal)
  const [editingText, setEditingText] = useState(false);
  const [editDraft, setEditDraft] = useState("");

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
      // Initial/user loads retry through backend cold-starts; background polls fail silently.
      const data = silent
        ? await api.getPosts(status === "all" || !status ? undefined : status)
        : await withRetry(() => api.getPosts(status === "all" || !status ? undefined : status));
      if (!silent) setLoadFailed(false);

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

      // Detect status changes since the last poll
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
      // Background polls fail silently; a failed initial/user load shows a retry state
      // (so a backend cold-start looks like "couldn't load", not "no posts").
      if (!silent) setLoadFailed(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, generating]);

  // Initial load
  useEffect(() => {
    fetchPosts(statusFilter);
  }, [statusFilter]); // eslint-disable-line

  // LinkedIn connection state — used for honest approve toasts
  const [linkedInConnected, setLinkedInConnected] = useState<boolean | null>(null);
  useEffect(() => {
    api.getLinkedInStatus()
      .then((s) => setLinkedInConnected(s.connected))
      .catch(() => setLinkedInConnected(null));
  }, []);

  // Publish outcome for the post open in the detail modal (approved/published only)
  const [publishStatus, setPublishStatus] = useState<{ ok: boolean; detail: string; at: string } | null>(null);

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
    setShowGenBanner(true);
    setGenBannerDone(false);
    try {
      const res = await api.generatePost(undefined, genWithImage);
      // Optimistically insert a placeholder card immediately so the skeleton
      // appears at 0ms. It uses the REAL post_id the backend just created, so
      // the next poll reconciles by id with no duplicate.
      if (res?.post_id) {
        const placeholder: Post = {
          id: res.post_id,
          text: "__generating__",
          image_url: null,
          news_source: null,
          news_title: "Generating new post…",
          status: "draft",
          linkedin_post_id: null,
          created_at: new Date().toISOString(),
          published_at: null,
        };
        setPosts((prev) =>
          prev.some((p) => p.id === placeholder.id) ? prev : [placeholder, ...prev]
        );
      }
    } catch {
      addToast("Failed to start generation", "error");
      setShowGenBanner(false);
    } finally {
      // Reset immediately - background polling tracks the real progress
      setGenerating(false);
    }
  };

  // ── Multi-select / bulk actions ─────────────────────────────────────────────
  const toggleSelectMode = () => {
    setSelectMode((m) => !m);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const toggleSelect = (post: Post) => {
    if (post.text === "__generating__") return;
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(post.id)) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
  };

  const selectablePosts = posts.filter((p) => p.text !== "__generating__");
  const selectedPosts = selectablePosts.filter((p) => selectedIds.has(p.id));
  const bulkApprovable = selectedPosts.filter((p) =>
    ["pending_review", "changes_requested", "draft"].includes(p.status)
  );

  const selectAll = () => {
    setSelectedIds(new Set(selectablePosts.map((p) => p.id)));
    setConfirmBulkDelete(false);
  };

  const runBulk = async (action: "approve" | "reject" | "delete") => {
    const targets = action === "delete" ? selectedPosts : bulkApprovable;
    if (targets.length === 0 || bulkLoading) return;
    setBulkLoading(action);
    const call =
      action === "approve" ? api.approvePost : action === "reject" ? api.rejectPost : api.deletePost;
    const results = await Promise.allSettled(targets.map((p) => call(p.id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    const verb = action === "approve" ? "approved" : action === "reject" ? "rejected" : "deleted";
    addToast(
      failed
        ? `${ok} post${ok !== 1 ? "s" : ""} ${verb}, ${failed} failed`
        : `${ok} post${ok !== 1 ? "s" : ""} ${verb}`,
      failed ? "error" : "success"
    );
    setBulkLoading(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    fetchPosts(statusFilter, true);
  };

  // ── Card quick actions ──────────────────────────────────────────────────────
  // Optimistically set a post's status in local state; returns the previous status for revert.
  const setPostStatusLocal = (id: string, status: Post["status"]) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const handleCardApprove = async (post: Post) => {
    setActionLoading(`approve-${post.id}`);
    const prevStatus = post.status;
    setPostStatusLocal(post.id, "approved"); // instant feedback; poll reconciles to published/approved
    try {
      await api.approvePost(post.id);
      addToast(
        linkedInConnected
          ? "Approved — publishing to LinkedIn…"
          : linkedInConnected === false
          ? "Approved (LinkedIn not connected — not published)"
          : "Post approved!",
        linkedInConnected === false ? "info" : "success"
      );
      fetchPosts(statusFilter, true);
    } catch (e: unknown) {
      setPostStatusLocal(post.id, prevStatus); // revert on failure
      addToast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCardReject = async (post: Post) => {
    setActionLoading(`reject-${post.id}`);
    const prevStatus = post.status;
    setPostStatusLocal(post.id, "rejected"); // instant feedback
    try {
      await api.rejectPost(post.id);
      addToast("Post rejected.");
      fetchPosts(statusFilter, true);
    } catch {
      setPostStatusLocal(post.id, prevStatus); // revert on failure
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
    setEditingText(false);
    setEditDraft("");
    // Load the LinkedIn publish outcome for approved/published posts
    setPublishStatus(null);
    if (post.status === "approved" || post.status === "published") {
      api.getPublishStatus(post.id)
        .then((r) => setPublishStatus(r.result))
        .catch(() => setPublishStatus(null));
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedPost) return;
    const text = editDraft.trim();
    if (!text) { addToast("Text cannot be empty", "error"); return; }
    if (text === selectedPost.text) { setEditingText(false); return; }
    setActionLoading("modal-edit");
    try {
      const updated = await api.updatePost(selectedPost.id, text);
      setSelectedPost(updated);
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingText(false);
      addToast("Post updated.");
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setActionLoading(null);
    }
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
      addToast(
        linkedInConnected
          ? "Approved — publishing to LinkedIn…"
          : linkedInConnected === false
          ? "Approved (LinkedIn not connected — not published)"
          : "Post approved and queued!",
        linkedInConnected === false ? "info" : "success"
      );
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

  // Manual text editing allowed until the post is live on LinkedIn.
  const canEditSelected = selectedPost
    ? ["pending_review", "changes_requested", "draft", "approved"].includes(selectedPost.status)
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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Toast stack — below mobile top bar (h-14) on small screens */}
      <div className="fixed top-16 sm:top-5 right-3 sm:right-5 z-50 flex flex-col gap-2 pointer-events-none">
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
        <div className={`fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-medium transition-all max-w-md w-[calc(100%-2rem)] ${
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {posts.filter((p) => p.text !== "__generating__").length} posts
            {hasGenerating && " · 1 generating…"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={toggleSelectMode}
            variant="outline"
            className={`gap-2 ${selectMode ? "border-green-600 text-green-700 bg-green-50" : ""}`}
          >
            <CheckSquare className="w-4 h-4" />
            {selectMode ? "Done" : "Select"}
          </Button>
          <div className="flex items-center justify-between gap-2 sm:contents">
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
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-96 animate-pulse" />
          ))}
        </div>
      ) : loadFailed && posts.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-sm font-medium text-amber-700">Couldn&apos;t load your posts</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
            The server didn&apos;t respond (it may have been waking up). Your posts are safe — this is just a loading hiccup.
          </p>
          <Button onClick={() => fetchPosts(statusFilter)} className="mt-4 bg-green-600 hover:bg-green-700 text-white gap-2" size="sm">
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </Button>
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
              selectMode={selectMode}
              selected={selectedIds.has(post.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* ── Bulk action bar (select mode) ── */}
      {selectMode && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl">
          <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-sm font-semibold whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-gray-300 hover:text-white underline underline-offset-2 whitespace-nowrap"
            >
              Select all ({selectablePosts.length})
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => runBulk("approve")}
                disabled={bulkApprovable.length === 0 || !!bulkLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {bulkLoading === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Approve{bulkApprovable.length > 0 ? ` (${bulkApprovable.length})` : ""}
              </button>
              <button
                onClick={() => runBulk("reject")}
                disabled={bulkApprovable.length === 0 || !!bulkLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {bulkLoading === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Reject{bulkApprovable.length > 0 ? ` (${bulkApprovable.length})` : ""}
              </button>
              {confirmBulkDelete ? (
                <button
                  onClick={() => runBulk("delete")}
                  disabled={!!bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-colors"
                >
                  {bulkLoading === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Really delete {selectedPosts.length}?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={selectedPosts.length === 0 || !!bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete{selectedPosts.length > 0 ? ` (${selectedPosts.length})` : ""}
                </button>
              )}
              <button
                onClick={toggleSelectMode}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Exit selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-1.5">
            Approve/Reject applies to posts awaiting review · Delete works for any selected post
          </p>
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
        <div className="fixed inset-0 z-40 flex items-end p-0 sm:items-center sm:p-4 justify-center bg-black/50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl h-[92dvh] sm:h-auto sm:max-h-[92vh] flex flex-col sm:flex-row overflow-hidden">

            {/* TOP on mobile / LEFT on desktop - image */}
            <div className="h-44 shrink-0 sm:h-auto w-full sm:w-72 sm:shrink-0 bg-gray-50 flex flex-col">
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
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
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
                {/* LinkedIn publish outcome (approved/published posts) */}
                {publishStatus && (selectedPost.status === "approved" || selectedPost.status === "published") && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
                      publishStatus.ok
                        ? "bg-green-50 border-green-200 text-green-700"
                        : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}
                  >
                    {publishStatus.ok ? "✓ Published to LinkedIn" : publishStatus.detail}
                  </div>
                )}
                {/* Post text */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  {editingText ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="min-h-[220px] text-sm leading-relaxed resize-y bg-white"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => setEditingText(false)}
                          variant="outline" size="sm" className="gap-1.5"
                          disabled={actionLoading === "modal-edit"}
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                        <Button
                          onClick={handleSaveEdit}
                          size="sm"
                          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          disabled={actionLoading === "modal-edit" || !editDraft.trim()}
                        >
                          {actionLoading === "modal-edit"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Save className="w-3.5 h-3.5" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {selectedPost.text}
                      </p>
                      {canEditSelected && (
                        <button
                          onClick={() => { setEditDraft(selectedPost.text); setEditingText(true); }}
                          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit text
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* News source — only show real URLs, not internal source tags */}
                {selectedPost.news_source &&
                  !selectedPost.news_source.startsWith("source:") &&
                  selectedPost.news_source.startsWith("http") && (
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
