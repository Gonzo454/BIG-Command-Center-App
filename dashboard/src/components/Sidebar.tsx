"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const financialNav = [
  { href: "/", label: "Executive Dashboard", icon: "📊" },
  { href: "/properties", label: "Properties", icon: "🏢" },
  { href: "/financials", label: "Financial Reports", icon: "💰" },
  { href: "/aged-receivables", label: "Aged Receivables", icon: "⏰" },
  { href: "/lease-expirations", label: "Lease Expirations", icon: "📅" },
  { href: "/rent-roll", label: "Rent Roll", icon: "🏠" },
  { href: "/vendors", label: "Vendors", icon: "🔧" },
  { href: "/banking", label: "Banking", icon: "🏦" },
];

const salesNav = [
  { href: "/prospects", label: "Prospect Dashboard", icon: "🎯" },
  { href: "/prospects/search", label: "Search Prospects", icon: "🔍" },
  { href: "/prospects/pipeline", label: "Sales Pipeline", icon: "📈" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 text-white flex flex-col z-50">
      <div className="p-3 border-b border-gray-700">
        <div className="bg-white rounded-lg p-3">
          <Image
            src="/logo-big-text.png"
            alt="Blackdeer Investment Group"
            width={860}
            height={200}
            className="w-full h-auto"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 mb-2">
          Financials
        </p>
        {financialNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <div className="my-4 border-t border-gray-700" />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 mb-2">
          Sales &amp; Marketing
        </p>
        {salesNav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/prospects" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
        Data refreshes every 5 min
      </div>
    </aside>
  );
}
