"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Upload" },
  { href: "/outlook-invoices", label: "Outlook Invoices" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex justify-center gap-1 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
              (active
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
