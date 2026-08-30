"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { BookIcon, ClockIcon, HomeIcon, PlusIcon, ReportIcon, TractorIcon } from "./icons";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Everything, in the order it appears in the desktop header. */
const ITEMS: NavItem[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/transactions", label: "Books", Icon: BookIcon },
  { href: "/time", label: "Time", Icon: ClockIcon },
  { href: "/assets", label: "Assets", Icon: TractorIcon },
  { href: "/report", label: "Schedule F", Icon: ReportIcon },
];

/**
 * The phone bar carries the four things done repeatedly in the field, either
 * side of the add button. Assets is a few-times-a-year job, so it lives on the
 * dashboard and in the add sheet rather than taking a thumb position here.
 */
const BOTTOM_BAR: NavItem[] = ITEMS.filter((item) => item.href !== "/assets");

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Fixed bottom tab bar - the primary navigation on a phone in the field. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="no-print md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5 items-end">
        {BOTTOM_BAR.slice(0, 2).map((item) => (
          <NavTab key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        <li className="flex justify-center">
          <Link
            href="/new"
            aria-label="Add an entry"
            className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg dark:text-[#12140f]"
          >
            <PlusIcon className="h-7 w-7" />
          </Link>
        </li>

        {BOTTOM_BAR.slice(2).map((item) => (
          <NavTab key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </ul>
    </nav>
  );
}

function NavTab({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon, href, label } = item;
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
          active ? "text-accent font-medium" : "text-muted"
        }`}
      >
        <Icon className="h-6 w-6" />
        {label}
      </Link>
    </li>
  );
}

/** Horizontal nav shown in the header from md up, where there is room for all of it. */
export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print hidden md:flex items-center gap-1" aria-label="Primary">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-surface-muted"
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
