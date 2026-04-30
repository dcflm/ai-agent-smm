"use client";

import { useEffect, useState } from "react";
import { api, AnalyticsOverview, CompanyStats, Post } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye, Heart, Share2, TrendingUp, Plus, Loader2,
  Users, FileText, Clock, CheckCircle2,
} from "lucide-react";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-700",
  changes_requested: "bg-orange-100 text-orange-700",
  approved: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  changes_requested: "Changes Requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    Promise.all([api.getOverview(), api.getCompanyStats(), api.getPosts()])
      .then(([ov, cs, posts]) => {
        setOverview(ov);
        setCompanyStats(cs);
        setRecentPosts(posts.filter((p) => p.text !== "__generating__").slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.generatePost();
      showToast("Generation started! Check Content for your new post.");
    } catch {
      showToast("Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">bizpando AG - LinkedIn AI Manager</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-green-600 hover:bg-green-700 text-white gap-2"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Plus className="w-4 h-4" /> Generate Post</>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Company / content stats row */}
          {companyStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Card className="border-green-100">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Users className="w-3 h-3 text-green-600" /> LinkedIn Followers
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {companyStats.linkedin_connected ? (
                    <>
                      <p className="text-3xl font-bold text-gray-900">
                        {companyStats.followers?.toLocaleString() ?? "-"}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Connected
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold text-gray-300">-</p>
                      <p className="text-xs text-gray-400 mt-1">Not connected</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Total Generated
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{companyStats.total_generated}</p>
                  <p className="text-xs text-gray-500 mt-1">{companyStats.generated_this_month} this month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-yellow-500" /> Pending Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{companyStats.pending_review}</p>
                  {companyStats.pending_review > 0 && (
                    <Link href="/content?status=pending_review"
                      className="text-xs text-yellow-600 mt-1 hover:underline block">
                      Review now →
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600" /> Published
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{companyStats.published}</p>
                  <p className="text-xs text-gray-500 mt-1">approved + live</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* LinkedIn KPI stats row */}
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Impressions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">
                    {(overview.total_impressions ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">all time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Reactions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{overview.total_reactions}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Share2 className="w-3 h-3" /> Shares
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{overview.total_shares ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Avg Engagement
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-3xl font-bold text-gray-900">{overview.avg_engagement_rate}%</p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Recent posts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recent Posts</CardTitle>
          <Link href="/content" className="text-sm text-green-600 hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent className="px-0">
          {recentPosts.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-400">No posts yet. Generate your first!</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentPosts.map((post) => (
                <div key={post.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate font-medium">
                      {post.news_title || post.text.slice(0, 80)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(post.created_at).toLocaleDateString("en-DE", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[post.status] ?? ""}`}>
                    {STATUS_LABELS[post.status] ?? post.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
