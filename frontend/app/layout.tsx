import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Calendar, BarChart2, Clock4, Settings, ImagePlus, CreditCard, Newspaper, MessageSquare } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "bizpando AG - AI Social Media Manager",
  description: "Autonomous AI agent for LinkedIn content management",
};

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/content", label: "Content", icon: Calendar },
  { href: "/create", label: "Create from Photo", icon: ImagePlus },
  { href: "/news", label: "News to Post", icon: Newspaper },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/schedule", label: "Schedule", icon: Clock4 },
  { href: "/credits", label: "Credits", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-50">
          {/* Sidebar */}
          <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
            <div className="p-5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm">
                  B
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">bizpando AG</p>
                  <p className="text-xs text-gray-500">AI Social Manager</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-gray-200">
              <p className="text-xs text-gray-400">Powered by Claude AI</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
