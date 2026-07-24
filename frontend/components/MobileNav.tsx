"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  ImagePlus,
  Newspaper,
  Clock4,
  CreditCard,
  Settings,
  Share2,
  Menu,
  ChevronRight,
} from "lucide-react";

const mainTabs = [
  { href: "/",        label: "Home",    icon: LayoutDashboard },
  { href: "/content", label: "Content", icon: Calendar },
  { href: "/create",  label: "Create",  icon: ImagePlus },
  { href: "/news",    label: "News",    icon: Newspaper },
];

const moreTabs = [
  { href: "/schedule", label: "Schedule",        icon: Clock4,     hint: "When posts are generated" },
  { href: "/linkedin", label: "Connect LinkedIn", icon: Share2,     hint: "Publishing setup" },
  { href: "/credits",  label: "Credits & Usage",  icon: CreditCard, hint: "Costs & API status" },
  { href: "/settings", label: "Settings",         icon: Settings,   hint: "Agent prompt & config" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isMoreActive = moreTabs.some((t) => t.href === pathname);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* "More" bottom sheet */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pt-1 pb-2">
          <p className="text-sm font-semibold text-gray-900">More</p>
        </div>
        <div className="px-3 pb-2">
          {moreTabs.map(({ href, label, icon: Icon, hint }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors ${
                  active ? "bg-green-50" : "active:bg-gray-100"
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${active ? "text-green-700" : "text-gray-900"}`}>
                    {label}
                  </span>
                  <span className="block text-xs text-gray-400 truncate">{hint}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-14">
          {mainTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-green-600" />}
                <Icon className={`w-5 h-5 ${active ? "text-green-600" : "text-gray-400"}`} />
                <span className={`text-[11px] font-medium ${active ? "text-green-600" : "text-gray-400"}`}>
                  {label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
          >
            {(isMoreActive || open) && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-green-600" />}
            <Menu className={`w-5 h-5 ${isMoreActive || open ? "text-green-600" : "text-gray-400"}`} />
            <span className={`text-[11px] font-medium ${isMoreActive || open ? "text-green-600" : "text-gray-400"}`}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
