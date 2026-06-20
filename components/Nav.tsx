"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/sessions", label: "Sessions" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/demo", label: "Demo" },
  { href: "/research", label: "Research" },
];

export default function Nav() {
  const pathname = usePathname();

  // The /sample route renders inside the demo iframe as a stand-in customer page — no
  // dashboard chrome there.
  if (pathname === "/sample") return null;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-baseline gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
          <span className="text-sm font-semibold tracking-tight text-ink">Analytics</span>
          <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
            cookieless
          </span>
        </Link>

        <ul className="flex items-center gap-1">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
                    (active
                      ? "bg-canvas-soft-2 text-ink"
                      : "text-body hover:text-ink")
                  }
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
