"use client";

import { useEffect, useState } from "react";
import { api, AnalyticsOverview, PostWithKPI, TimeseriesPoint } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { RefreshCw, Eye, Heart, MessageCircle, Share2, TrendingUp } from "lucide-react";

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [posts, setPosts] = useState<PostWithKPI[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOverview(),
      api.getPostsWithKPIs(),
      api.getTimeseries(30),
    ])
      .then(([ov, ps, ts]) => {
        setOverview(ov);
        setPosts(ps);
        setTimeseries(ts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async (postId: string) => {
    setRefreshing(postId);
    try {
      await api.refreshKPIs(postId);
      const updated = await api.getPostsWithKPIs();
      setPosts(updated);
    } catch {
      alert("Failed to refresh KPIs");
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h1>

      {/* Summary cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Published", value: overview.total_published, icon: TrendingUp },
            { label: "Total Impressions", value: overview.total_impressions.toLocaleString(), icon: Eye },
            { label: "Total Reactions", value: overview.total_reactions, icon: Heart },
            { label: "Avg Engagement", value: `${overview.avg_engagement_rate}%`, icon: Share2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-gray-500 font-medium flex items-center gap-1">
                  <Icon className="w-3 h-3" /> {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Timeseries chart */}
      {timeseries.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Impressions over time (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="impressions" fill="#16a34a" name="Impressions" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reactions" fill="#86efac" name="Reactions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {timeseries.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Engagement rate % (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line
                  type="monotone"
                  dataKey="engagement_rate"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                  name="Engagement Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-post KPI table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Post Performance</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {posts.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">No published posts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">Post</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">
                      <span className="flex items-center justify-end gap-1">
                        <Eye className="w-3 h-3" /> Impressions
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">
                      <span className="flex items-center justify-end gap-1">
                        <Heart className="w-3 h-3" /> Reactions
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">
                      <span className="flex items-center justify-end gap-1">
                        <MessageCircle className="w-3 h-3" /> Comments
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">
                      <span className="flex items-center justify-end gap-1">
                        <Share2 className="w-3 h-3" /> Shares
                      </span>
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Engagement</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {posts.map((post) => (
                    <tr key={post.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <p className="text-gray-800 truncate max-w-xs">{post.text}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {post.published_at
                            ? new Date(post.published_at).toLocaleDateString("en-DE", {
                                day: "numeric",
                                month: "short",
                              })
                            : "-"}
                        </p>
                      </td>
                      <td className="text-right px-4 py-3 font-medium">
                        {post.kpi.impressions.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3">{post.kpi.reactions}</td>
                      <td className="text-right px-4 py-3">{post.kpi.comments}</td>
                      <td className="text-right px-4 py-3">{post.kpi.shares}</td>
                      <td className="text-right px-4 py-3">
                        <span
                          className={`font-medium ${
                            post.kpi.engagement_rate > 2
                              ? "text-green-600"
                              : post.kpi.engagement_rate > 1
                              ? "text-yellow-600"
                              : "text-gray-500"
                          }`}
                        >
                          {post.kpi.engagement_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefresh(post.id)}
                          disabled={refreshing === post.id}
                          className="h-7 text-xs"
                        >
                          {refreshing === post.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
