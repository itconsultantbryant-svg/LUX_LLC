"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { siteNav } from "../lib/site";
import { authClient } from "../lib/auth-client";

export function Brand() {
  return (
    <Link href="/" className="lux-logo" aria-label="LUX HealthPay home">
      <span className="lux-logo-pill">
        <img
          src="/media/LUX_HealthPay.png"
          width="2016"
          height="672"
          alt="LUX AI"
        />
      </span>
      <span className="lux-logo-word">
        HealthPay
        <small>AI claims platform</small>
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
    <header className="lux-header">
      <div className="lux-wrap lux-nav">
        <Brand />
        <nav aria-label="Main navigation" className="lux-nav-links">
          {siteNav.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                !href.includes("#") && path === href ? "page" : undefined
              }
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="lux-nav-actions">
          <Link href={session ? "/app" : "/login"} className="lux-login">
            {session ? "Workspace" : "Log in"}
          </Link>
          <Link href="/get-started" className="lux-btn small">
            Register
          </Link>
        </div>
        <button
          className="lux-menu-toggle"
          disabled={!ready}
          ref={button}
          aria-expanded={open}
          aria-controls="lux-mobile-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="lux-mobile-menu"
          ref={menu}
          className="lux-mobile-nav"
          aria-label="Mobile navigation"
        >
          {[
            ...siteNav,
            [session ? "Workspace" : "Log in", session ? "/app" : "/login"],
            ["Register", "/get-started"],
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
    <footer className="lux-footer">
      <div className="lux-wrap lux-footer-grid">
        <div className="lux-footer-brand">
          <Brand />
          <p>
            A Liberia-first platform for verified claims, insurer-controlled
            decisions and traceable payment records.
          </p>
          <p className="lux-small">
            Team LUX PayHealth · Orange Fab, Orange Digital Center Liberia
          </p>
          <p className="lux-small">One Orange. One Customer. One Healthcare.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/how-it-works">For patients</Link>
          <Link href="/services">Platform</Link>
          <Link href="/about">AI and about</Link>
          <Link href="/partners">Partners</Link>
          <Link href="/team">Team</Link>
        </div>
        <div>
          <h2>Connect</h2>
          <Link href="/get-started?type=PATIENT">
            Register with LUX <ArrowUpRight size={14} />
          </Link>
          <Link href="/get-started?type=FACILITY">Health facility enquiry</Link>
          <Link href="/get-started?type=INSURER">Insurer enquiry</Link>
          <Link href="/contact">Contact LUX HealthPay</Link>
          <Link href="/login">Organization login</Link>
        </div>
        <div>
          <h2>Trust</h2>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/accessibility">Accessibility</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
      <div className="lux-wrap lux-footer-bottom">
        <span>© {new Date().getFullYear()} LUX HealthPay</span>
        <span>Built in Liberia for a clearer claims journey.</span>
        <span>One Orange. One Customer. One Healthcare.</span>
      </div>
    </footer>
  );
}
