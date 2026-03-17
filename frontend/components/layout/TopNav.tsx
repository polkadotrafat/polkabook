import Link from "next/link";
import { WalletButton } from "@/components/wallet/WalletButton";

const links = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
];

export function TopNav() {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--edge)] px-3 pb-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <Link className="flex items-center gap-3" href="/">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--edge-strong)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--ink-strong)]">
          PB
        </span>
        <span className="space-y-1">
          <span className="block text-lg font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
            PolkaBook
          </span>
          <span className="block text-xs uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Bounded order book
          </span>
        </span>
      </Link>

      <nav className="flex flex-wrap items-center gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            className="rounded-full border border-[var(--edge)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:border-[var(--edge-strong)] hover:text-[var(--ink-strong)]"
            href={link.href}
          >
            {link.label}
          </Link>
        ))}
        <WalletButton />
      </nav>
    </header>
  );
}
