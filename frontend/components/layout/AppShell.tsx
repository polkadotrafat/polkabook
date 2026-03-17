import type { ReactNode } from "react";

import { TopNav } from "@/components/layout/TopNav";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="shell-grid">
        <TopNav />
        <main className="grid gap-6 px-3 pb-3 pt-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
