import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatExperience } from './ChatExperience';
import { Icon } from './icons/Icon';
import './ChatWidget.css';

/**
 * Floating assistant available on every screen. It shares the same engine as the
 * full assistant page, so anything the customer starts here continues there.
 */
export function ChatWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (location.pathname === '/assistant') return null;

  return (
    <div className={`chat-widget${open ? ' is-open' : ''}`}>
      {open && (
        <div className="chat-widget__panel" role="dialog" aria-label="LUX assistant" ref={panelRef}>
          <header className="chat-widget__head">
            <div>
              <p className="chat-widget__title">
                <Icon name="sparkles" size={16} /> LUX assistant
              </p>
              <p className="chat-widget__subtitle">Ask, dictate, or upload a bill</p>
            </div>
            <button
              type="button"
              className="btn btn--ghost chat-widget__close"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
            >
              <Icon name="x" size={18} />
            </button>
          </header>
          <div className="chat-widget__body">
            <ChatExperience variant="widget" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="chat-widget__fab"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Hide the LUX assistant' : 'Open the LUX assistant'}
      >
        <Icon name={open ? 'x' : 'message-circle'} size={22} />
        {!open && <span className="chat-widget__fab-label">Ask LUX</span>}
      </button>
    </div>
  );
}
