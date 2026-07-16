const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface Post {
  id: string;
  text: string;
  image_url: string | null;
  news_source: string | null;
  news_title: string | null;
  status: "draft" | "pending_review" | "changes_requested" | "approved" | "scheduled" | "published" | "rejected";
  notion_page_id: string | null;
  linkedin_post_id: string | null;
  created_at: string;
  published_at: string | null;
}

export interface PostKPI {
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  fetched_at: string | null;
}

export interface PostWithKPI {
  id: string;
  text: string;
  news_title: string | null;
  published_at: string | null;
  kpi: PostKPI;
}

export interface CompanyStats {
  followers: number | null;
  total_generated: number;
  pending_review: number;
  published: number;
  generated_this_month: number;
  linkedin_connected: boolean;
}

export interface ScheduleSettings {
  enabled: boolean;
  days: string[];
  time: string;
  timezone: string;
  notify_email?: string;
}

export interface NextRun {
  day: string;
  next_run: string | null;
}

export interface CreditsUsage {
  last_updated: string | null;
  total_estimated_cost_usd: number;
  services: {
    anthropic: {
      total_calls: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_tokens: number;
      estimated_cost_usd: number;
      by_type: Record<string, { calls: number; input_tokens: number; output_tokens: number }>;
      dashboard_url: string;
    };
    openai: {
      total_calls: number;
      total_tokens: number;
      estimated_cost_usd: number;
      dashboard_url: string;
    };
    tavily: {
      total_searches: number;
      estimated_cost_usd: number;
      dashboard_url: string;
    };
    nano_banana: {
      total_attempted: number;
      total_succeeded: number;
      total_failed: number;
      estimated_cost_usd: number;
      dashboard_url: string;
    };
  };
}

export interface ServiceStatus {
  status: "ok" | "no_credits" | "invalid_key" | "error";
  detail: string;
  model?: string;
  dashboard_url?: string;
}

export interface ApiStatus {
  anthropic: ServiceStatus;
  openai: ServiceStatus;
  tavily: ServiceStatus;
  nano_banana: ServiceStatus;
}

export interface AnalyticsOverview {
  total_published: number;
  recent_posts_30d: number;
  total_impressions: number;
  total_reactions: number;
  total_comments: number;
  total_shares: number;
  avg_engagement_rate: number;
}

export interface TimeseriesPoint {
  date: string;
  impressions: number;
  reactions: number;
  engagement_rate: number;
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Posts
  getPosts: (status?: string) =>
    fetchAPI<Post[]>(`/posts/${status ? `?status=${status}` : ""}`),
  getPost: (id: string) => fetchAPI<Post>(`/posts/${id}`),
  generatePost: (topic?: string, generate_image?: boolean) =>
    fetchAPI<{ message: string; post_id: string }>("/posts/generate", {
      method: "POST",
      body: JSON.stringify({ topic, generate_image: generate_image ?? true }),
    }),
  updatePost: (id: string, text: string, image_url?: string | null) =>
    fetchAPI<Post>(`/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text, image_url }),
    }),

  // Analytics
  getOverview: () => fetchAPI<AnalyticsOverview>("/analytics/overview"),
  getPostsWithKPIs: () => fetchAPI<PostWithKPI[]>("/analytics/posts"),
  getTimeseries: (days?: number) =>
    fetchAPI<TimeseriesPoint[]>(`/analytics/timeseries${days ? `?days=${days}` : ""}`),
  refreshKPIs: (postId: string) =>
    fetchAPI(`/analytics/refresh/${postId}`, { method: "POST" }),

  // Post actions
  approvePost: (id: string) =>
    fetchAPI<{ message: string }>(`/posts/${id}/approve`, { method: "POST" }),
  rejectPost: (id: string) =>
    fetchAPI<{ message: string }>(`/posts/${id}/reject`, { method: "POST" }),
  revisePost: (id: string, feedback: string) =>
    fetchAPI<{ message: string }>(`/posts/${id}/revise`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
  deletePost: (id: string) =>
    fetchAPI<{ message: string }>(`/posts/${id}`, { method: "DELETE" }),
  reopenPost: (id: string) =>
    fetchAPI<{ message: string }>(`/posts/${id}/reopen`, { method: "POST" }),
  getPostEdits: (id: string) =>
    fetchAPI<{ id: string; original_text: string; edited_text: string; diff_summary: string; created_at: string }[]>(
      `/posts/${id}/edits`
    ),

  // Company stats
  getCompanyStats: () => fetchAPI<CompanyStats>("/analytics/company-stats"),

  // Schedule
  getScheduleSettings: () => fetchAPI<ScheduleSettings>("/schedule/settings"),
  saveScheduleSettings: (s: ScheduleSettings) =>
    fetchAPI<ScheduleSettings & { message: string }>("/schedule/settings", {
      method: "POST",
      body: JSON.stringify(s),
    }),
  getNextRuns: () => fetchAPI<NextRun[]>("/schedule/next-runs"),
  triggerScheduleNow: () =>
    fetchAPI<{ message: string }>("/schedule/trigger-now", { method: "POST" }),
  sendTestEmail: (email: string) =>
    fetchAPI<{ ok: boolean; detail: string }>("/schedule/test-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  // Settings - System Prompt
  getPrompt: () => fetchAPI<{ prompt: string; is_custom: boolean }>("/settings/prompt"),
  savePrompt: (prompt: string) =>
    fetchAPI<{ message: string; prompt: string }>("/settings/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  resetPrompt: () =>
    fetchAPI<{ message: string; prompt: string }>("/settings/prompt", { method: "DELETE" }),
  refinePrompt: (current_prompt: string, instruction: string) =>
    fetchAPI<{ prompt: string }>("/settings/prompt/refine", {
      method: "POST",
      body: JSON.stringify({ current_prompt, instruction }),
    }),

  // Create from news URL
  createPostFromUrl: (url: string, extra_context?: string, generate_image?: boolean) =>
    fetchAPI<{ post_id: string; text: string; news_title: string; news_source: string; image_url: string | null }>(
      "/create/from-url",
      {
        method: "POST",
        body: JSON.stringify({ url, extra_context, generate_image: generate_image ?? false }),
      }
    ),

  // Create from image (multipart/form-data - no JSON content-type)
  createPostFromImage: (formData: FormData) => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    return fetch(`${base}/create/from-image`, {
      method: "POST",
      body: formData,
      // No Content-Type header - browser sets it with boundary for multipart
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ post_id: string; text: string; image_url: string | null }>;
    });
  },

  // Chat
  chat: (messages: { role: string; content: string }[], message: string) =>
    fetchAPI<{ response: string }>("/chat/", {
      method: "POST",
      body: JSON.stringify({ messages, message }),
    }),

  // Credits & Usage
  getCreditsUsage: () => fetchAPI<CreditsUsage>("/credits/usage"),
  resetCreditsUsage: () => fetchAPI<{ message: string }>("/credits/usage/reset", { method: "DELETE" }),
  getApiStatus: () => fetchAPI<ApiStatus>("/credits/status"),

  // LinkedIn
  getLinkedInStatus: () =>
    fetchAPI<{ connected: boolean; configured: boolean; detail: string; organization_id: string | null }>(
      "/linkedin/status"
    ),

  // Knowledge Base
  searchKB: (query: string) =>
    fetchAPI<{ chunk_text: string; doc_name: string; similarity: number }[]>(
      `/kb/search?query=${encodeURIComponent(query)}`
    ),
};
