"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Contas" },
  { href: "/admin/requests", label: "Pedidos de criação" },
  { href: "/admin/users", label: "Usuários" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/accounts");
    return pathname.startsWith(href);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="pb-5">
          <p className="text-xs font-semibold uppercase text-primary">CRM Malybo</p>
          <h1 className="mt-2 text-2xl font-semibold">Administração da plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie contas, permissões de módulos, pedidos de criação e usuários.
          </p>
        </header>

        <nav className="flex gap-5 border-b border-border text-sm" aria-label="Administração da plataforma">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(tab.href) ? "page" : undefined}
              className={
                isActive(tab.href)
                  ? "border-b-2 border-primary py-3 font-medium text-foreground"
                  : "py-3 text-muted-foreground hover:text-foreground"
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="pt-6">{children}</div>
      </div>
    </main>
  );
}
