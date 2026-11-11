"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { nav } from "../lib/content";
import { authClient } from "../lib/auth-client";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="LUX HealthPay home">
      <span className="brand-art">
        <img
          src="/media/LUX_HealthPay.png"
          width="2016"
          height="672"
          alt="Original LUX AI artwork"
        />
      </span>
      <span className="brand-name">
        LUX <b>HealthPay</b>
        <small>Connected claims. Clear records.</small>
      </span>
    </Link>
  );
}
export function Header() {
  const { data: session } = authClient.useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  useEffect(() => {
    setReady(true);
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const first = menu.current?.querySelector<HTMLElement>("a");
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      if (e.key === "Tab") {
        const items = [
          ...(menu.current?.querySelectorAll<HTMLElement>("a,button") || []),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation" className="desktop-nav">
          {nav.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href={session ? "/app" : "/login"} className="login-link">
            {session ? "Workspace" : "Log In"}
          </Link>
          <Link href="/get-started" className="button small">
            Get Started <ArrowUpRight size={16} />
          </Link>
        </div>
        <button
          className="menu-toggle"
          disabled={!ready}
          ref={button}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          ref={menu}
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
          {[
            ...nav,
            [session ? "Workspace" : "Log In", session ? "/app" : "/login"],
            ["Get Started", "/get-started"],
          ].map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {name}
              <ArrowUpRight size={18} />
            </Link>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              button.current?.focus();
            }}
          >
            Close menu
          </button>
        </nav>
      )}
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Brand />
          <p>
            A clearer path from care delivered
            <br />
            to claims reviewed and payments traced.
          </p>
          <span className="eyebrow">Built for a Liberian starting point.</span>
        </div>
        <div>
          <h2>Explore</h2>
          {nav.slice(1).map(([n, h]) => (
            <Link key={h} href={h}>
              {n}
            </Link>
          ))}
        </div>
        <div>
          <h2>Let’s connect</h2>
          <Link href="/get-started">
            Discuss the pilot <ArrowUpRight size={15} />
          </Link>
          <Link href="/contact">Contact LUX HealthPay</Link>
          <Link href="/login">Organization login</Link>
          <p>No patient information on public forms.</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} LUX HealthPay</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/accessibility">Accessibility</Link>
        </div>
        <span>Software & records. Not a custodial wallet.</span>
      </div>
    </footer>
  );
}
