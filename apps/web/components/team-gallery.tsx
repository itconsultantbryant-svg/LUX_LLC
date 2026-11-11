"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  X,
  Mail,
  Phone,
  Linkedin,
  Facebook,
  Instagram,
  Globe,
  Link2,
} from "lucide-react";
export interface TeamMember {
  slug: string;
  name: string;
  role: string;
  bio: string | null;
  photo: string | null;
  alt?: string;
  contacts?: { kind: string; value: string; label?: string }[];
}
function contactLink(c: { kind: string; value: string }) {
  try {
    if (c.kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value))
      return "mailto:" + c.value;
    if (c.kind === "phone" && /^\+?[\d ()-]{7,25}$/.test(c.value))
      return "tel:" + c.value.replace(/[^+\d]/g, "");
    const u = new URL(c.value);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
const icons: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  website: Globe,
};
export function TeamGallery({ members }: { members: TeamMember[] }) {
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  function close() {
    dialog.current?.close();
    setSelected(null);
    opener.current?.focus();
  }
  return (
    <>
      <div className="team-grid">
        {members.map((m) => (
          <article className="team-card" key={m.slug}>
            <button
              className="team-open"
              aria-haspopup="dialog"
              aria-label={`View profile: ${m.name}`}
              onClick={(e) => {
                opener.current = e.currentTarget;
                setSelected(m);
              }}
            >
              <div className="team-photo">
                {m.photo ? (
                  <img
                    src={m.photo}
                    alt={m.alt || `Portrait of ${m.name}`}
                    width={480}
                    height={480}
                    loading="lazy"
                  />
                ) : (
                  <span>
                    {m.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                )}
                <span className="team-profile-affordance">
                  <ArrowUpRight size={20} />
                </span>
              </div>
              <div className="team-copy">
                <h3>{m.name}</h3>
                <p className="team-role">{m.role}</p>
                {m.bio && <p>{m.bio}</p>}
                <span className="profile-link">
                  View profile
                  <ArrowUpRight size={15} />
                </span>
              </div>
            </button>
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="team-dialog"
        aria-labelledby="team-dialog-name"
        aria-describedby="team-dialog-role"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const box = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < box.left ||
              e.clientX > box.right ||
              e.clientY < box.top ||
              e.clientY > box.bottom
            )
              close();
          }
        }}
      >
        {selected && (
          <>
            <button
              autoFocus
              className="dialog-close"
              aria-label="Close team profile"
              onClick={close}
            >
              <X size={22} />
            </button>
            <div className="team-dialog-grid">
              {selected.photo ? (
                <img
                  className="team-dialog-portrait"
                  src={selected.photo}
                  alt={selected.alt || `Portrait of ${selected.name}`}
                  width={480}
                  height={560}
                />
              ) : (
                <div className="team-dialog-initials">
                  {selected.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
              )}
              <div className="team-dialog-content">
                <span className="eyebrow">Meet the LUX HealthPay team</span>
                <h2 id="team-dialog-name">{selected.name}</h2>
                <p className="team-role" id="team-dialog-role">
                  {selected.role}
                </p>
                {selected.bio && <p>{selected.bio}</p>}
                <nav
                  className="team-contact-icons"
                  aria-label={`${selected.name} approved contact links`}
                >
                  {selected.contacts?.map((contact, i) => {
                    const href = contactLink(contact);
                    if (!href) return null;
                    const Icon = icons[contact.kind] || Link2;
                    return (
                      <a
                        key={i}
                        href={href}
                        target={
                          href.startsWith("https:") ? "_blank" : undefined
                        }
                        rel={
                          href.startsWith("https:")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        aria-label={
                          contact.label || `${selected.name}: ${contact.kind}`
                        }
                        title={contact.label || contact.kind}
                      >
                        <Icon size={20} />
                      </a>
                    );
                  })}
                </nav>
                {!selected.contacts?.length && (
                  <p className="subtle">
                    Direct contact and social links have not been approved for
                    publication.
                  </p>
                )}
                <a href="/contact" className="text-link">
                  Contact LUX HealthPay
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
