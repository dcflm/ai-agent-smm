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
  MoreHorizontal,
  X,
} from "lucide-react";

const mainTabs = [
  { href: "/",        label: "Home",    icon: LayoutDashboard },
  { href: "/content", label: "Content", icon: Calendar },
  { href: "/create",  label: "Create",  icon: ImagePlus },
  { href: "/news",    label: "News",    icon: Newspaper },
];

const moreTabs = [
  { href: "/schedule",  label: "Schedule",  icon: Clock4 },
  { href: "/linkedin",  label: "LinkedIn",  icon: Share2 },
  { href: "/credits",   label: "Credits",   icon: CreditCard },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isMoreActive = moreTabs.some((t) => t.href === pathname);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* "More" slide-up drawer — sits just above the tab bar */}
      <div
        className={`md:hidden fixed left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ bottom: 56 }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            More pages
          </span>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 py-4">
          {moreTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl text-xs font-medium transition-colors ${
                  active
                    ? "text-green-600 bg-green-50"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 h-14">
        <div className="flex h-full">
          {mainTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-green-600" : "text-gray-400"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              isMoreActive || open ? "text-green-600" : "text-gray-400"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
