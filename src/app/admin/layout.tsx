"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ClipboardList, LayoutDashboard, Users } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Resultados", icon: LayoutDashboard },
  { href: "/admin/users", label: "Usuários", icon: Users },
  { href: "/admin/notifications", label: "Avisos", icon: Bell },
  { href: "/admin/requests", label: "Pedidos", icon: ClipboardList },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/accounts");
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-[#f0f0f1] text-[#1d2327] lg:pl-56">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col bg-[#1d2327] text-[#f0f0f1] lg:flex">
        <div className="border-b border-white/10 px-4 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e10c8c]">Malybo</p>
          <p className="mt-1 text-sm font-semibold">Administração</p>
        </div>
        <nav className="flex-1 py-3" aria-label="Administração da plataforma">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex items-center gap-3 border-l-4 border-[#e10c8c] bg-[#2271b1]/20 px-4 py-2.5 text-sm font-medium text-white"
                    : "flex items-center gap-3 border-l-4 border-transparent px-4 py-2.5 text-sm text-[#c3c4c7] hover:bg-white/5 hover:text-white"
                }
              >
                <Icon className="size-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/dashboard" className="border-t border-white/10 px-4 py-4 text-sm text-[#c3c4c7] hover:text-white">
          Voltar ao CRM
        </Link>
      </aside>

      <div className="border-b border-[#dcdcde] bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Administração</p>
          <Link href="/dashboard" className="text-sm text-[#2271b1]">CRM</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Administração da plataforma">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                isActive(tab.href)
                  ? "rounded-full bg-[#1d2327] px-3 py-1.5 text-sm text-white"
                  : "rounded-full px-3 py-1.5 text-sm text-[#50575e]"
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <main className="px-4 py-6 sm:px-8">
        <header className="mb-5 flex items-center gap-2 text-[#1d2327]">
          <Building2 className="size-5 text-[#e10c8c]" />
          <div>
            <h1 className="text-2xl font-normal">Administração da plataforma</h1>
            <p className="text-sm text-[#646970]">Resultados das contas, usuários e permissões.</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
