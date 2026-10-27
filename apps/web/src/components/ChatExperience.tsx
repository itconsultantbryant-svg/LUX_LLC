import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  ChatBriefingResponse,
  ChatConfirmResponse,
  ChatDocumentReview,
  ChatHistoryResponse,
  ChatItem,
  ChatMessage,
  ChatSendResponse,
  NearbyProvider,
} from '@healthwallet/shared';
import { ApiError, apiGet, apiPost } from '../lib/api';
import { useAuth } from '../features/auth-context';
import { useVoiceInput } from '../features/voice';
import { useGeolocation } from '../features/location';
import { Icon } from './icons/Icon';
import '../pages/ChatPage.css';

const SUGGESTIONS = [
  'What should I do next?',
  'Add 5,000 from Orange Money',
  'Find a hospital near me',
  'What is my wallet balance?',
];

function formatMinor(minor: string | number, currency: string) {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

function readAloud(text: string) {
  if (!('speechSynthesis' in window)) return;
  const cleaned = text.replace(/SIMULATION[^\n.]*\./g, '').trim();
  if (!cleaned) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

// Keep well under the API's 700k base64 ceiling (≈512 KB).
const MAX_DOCUMENT_CHARS = 640_000;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('We could not read that file.'));
    };
    reader.onerror = () => reject(new Error('We could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File): Promise<string> {
  const value = await fileToDataUrl(file);
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('We could not read that image.'));
    image.src = src;
  });
}

/**
 * Phone cameras produce multi-megabyte photos that exceed the upload ceiling,
 * and iPhones often hand us HEIC. Re-encode (and downsample) any image to JPEG
 * in the browser so the bill always fits, then hand the server a small payload.
 */
async function shrinkImage(file: File): Promise<{ contentType: string; base64: string }> {
  const image = await loadImage(await fileToDataUrl(file));
  let maxSide = 1600;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('We could not process that image on this device.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', 0.72);
    const base64 = encoded.slice(encoded.indexOf(',') + 1);
    if (base64.length <= MAX_DOCUMENT_CHARS) return { contentType: 'image/jpeg', base64 };
    maxSide = Math.round(maxSide * 0.75);
  }
  throw new Error('That image is too large. Try a smaller photo or a PDF under 512 KB.');
}

function ProviderCards({ providers }: { providers: NearbyProvider[] }) {
  return (
    <ul className="chat__providers">
      {providers.map((provider) => (
        <li key={provider.id} className="chat__provider">
          <div className="chat__provider-head">
            <strong>{provider.legalName}</strong>
            {provider.emergencyReady && <span className="badge badge--pending">Emergency</span>}
          </div>
          <p className="chat__provider-meta">
            {provider.distanceKm != null && <span>{provider.distanceKm} km away</span>}
            {provider.etaMinutes != null && <span>· about {provider.etaMinutes} min</span>}
            {provider.services.length > 0 && <span>· {provider.services.join(', ')}</span>}
          </p>
          {provider.addressLine && <p className="muted">{provider.addressLine}</p>}
          <div className="chat__provider-actions">
            {provider.phone && (
              <a className="btn btn--ghost" href={`tel:${provider.phone}`}>
                <Icon name="smartphone" size={15} /> Call
              </a>
            )}
            <Link className="btn btn--ghost" to="/pay">
              Pay here <span aria-hidden="true">→</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

const VERDICT_META: Record<
  ChatDocumentReview['status'],
  { label: string; icon: 'check-circle' | 'clock' | 'alert-triangle' | 'help-circle' }
> = {
  verified: { label: 'Valid bill', icon: 'check-circle' },
  expired: { label: 'Expired verification', icon: 'clock' },
  unverified: { label: 'Not verified', icon: 'alert-triangle' },
  unknown: { label: 'Provider unrecognized', icon: 'help-circle' },
};

function DocumentVerdict({ review }: { review: ChatDocumentReview }) {
  const meta = VERDICT_META[review.status];
  const provider = review.matchedProviderName ?? review.providerName;
  return (
    <div className={`chat__verdict chat__verdict--${review.status}`} role="status">
      <span className="chat__verdict-badge">
        <Icon name={meta.icon} size={14} /> {meta.label}
      </span>
      <div className="chat__verdict-body">
        {provider && <strong>{provider}</strong>}
        <p>{review.notes}</p>
        {review.validUntil && <small>Valid until {review.validUntil.slice(0, 10)}</small>}
      </div>
    </div>
  );
}

export function ChatExperience({
  variant = 'page',
  onClose,
}: {
  variant?: 'page' | 'widget';
  onClose?: () => void;
}) {
  void variant;
  const navigate = useNavigate();
  const { signedIn, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [briefing, setBriefing] = useState<ChatItem[]>([]);
  const [simulationLabel, setSimulationLabel] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);
  const [aloud, setAloud] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { coords, status: geoStatus, request: requestLocation } = useGeolocation();

  const load = useCallback(async () => {
    try {
      const [history, brief] = await Promise.all([
        apiGet<ChatHistoryResponse>('/api/chat/history'),
        apiGet<ChatBriefingResponse>('/api/chat/briefing'),
      ]);
      setMessages(history.messages);
      setSimulationLabel(history.simulationLabel);
      setBriefing(brief.items);
      setNotSignedIn(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setNotSignedIn(true);
      else setError(caught instanceof Error ? caught.message : 'The assistant is unavailable.');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && signedIn) void load();
    else if (!authLoading && !signedIn) setNotSignedIn(true);
  }, [authLoading, signedIn, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const send = useCallback(
    async (payload: { text?: string; document?: { contentType: string; base64: string } }) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const response = await apiPost<ChatSendResponse>('/api/chat/send', {
          ...payload,
          ...(coords ? { location: coords } : {}),
        });
        setMessages((previous) => [...previous, response.user, response.assistant]);
        setSimulationLabel(response.simulationLabel);
        setAttachment(null);
        // Always read document findings aloud, even when the toggle is off, so
        // the bill verdict is spoken back to the customer.
        if (aloud || payload.document) readAloud(response.assistant.content.text);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) setNotSignedIn(true);
        else setError(caught instanceof Error ? caught.message : 'Your message was not delivered.');
      } finally {
        setBusy(false);
      }
    },
    [aloud, coords],
  );

  const submitText = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || busy) return;
      setInput('');
      void send({ text: trimmed });
    },
    [busy, send],
  );

  const voice = useVoiceInput({
    onInterim: (text) => setInput(text),
    onFinal: (text) => {
      const trimmed = text.trim();
      if (trimmed) submitText(trimmed);
    },
  });

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  const confirmAction = useCallback(
    async (item: ChatItem) => {
      if (!item.confirmation) return;
      const id = item.confirmation.id;
      setConfirming(id);
      setError(null);
      try {
        const result = await apiPost<ChatConfirmResponse>('/api/chat/confirm', {
          confirmationId: id,
        });
        setResolved((previous) => new Set(previous).add(id));
        if (result.assistant)
          setMessages((previous) => [...previous, result.assistant as ChatMessage]);
        setNotice(result.message);
        if (result.status === 'needs_screen' && result.redirect) {
          try {
            sessionStorage.setItem('lux:chat:return', '1');
          } catch {
            /* storage may be unavailable */
          }
          onClose?.();
          navigate(result.redirect);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That action could not be completed.');
      } finally {
        setConfirming(null);
      }
    },
    [navigate, onClose],
  );

  const submitFile = useCallback(
    async (file: File) => {
      if (busy) return;
      setError(null);
      try {
        let document: { contentType: string; base64: string };
        if (file.type.startsWith('image/')) {
          document = await shrinkImage(file);
        } else {
          const base64 = await fileToBase64(file);
          if (base64.length > MAX_DOCUMENT_CHARS)
            throw new Error('That file is too large. Keep it under 512 KB.');
          document = { contentType: file.type || 'application/pdf', base64 };
        }
        await send({ document });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That file could not be uploaded.');
      }
    },
    [busy, send],
  );

  const toggleAloud = useCallback(() => {
    setAloud((current) => {
      const next = !current;
      if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return next;
    });
  }, []);

  const locationLabel = useMemo(() => {
    if (coords) return 'Location on';
    if (geoStatus === 'denied') return 'Location off';
    return 'Share location';
  }, [coords, geoStatus]);

  if (authLoading || (!signedIn && !notSignedIn)) {
    return <p className="muted chat__loading">Loading your assistant…</p>;
  }

  if (notSignedIn) {
    return (
      <div className="chat__signin">
        <h2>Sign in to continue</h2>
        <p className="muted">
          The assistant reads your own bills, wallet and support requests, so it needs your account.
        </p>
        <Link className="btn btn--primary" to="/account" onClick={() => onClose?.()}>
          <Icon name="user" size={18} /> Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="chat__toolbar">
        <button
          type="button"
          className={`btn btn--ghost${aloud ? ' is-active' : ''}`}
          onClick={toggleAloud}
          aria-pressed={aloud}
        >
          <Icon name="info" size={15} /> {aloud ? 'Reading aloud' : 'Read aloud'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void requestLocation()}
          aria-pressed={Boolean(coords)}
        >
          <Icon name="map-pin" size={15} /> {locationLabel}
        </button>
      </div>

      {simulationLabel && <p className="chat__banner">{simulationLabel}</p>}
      {notice && (
        <p className="chat__notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="chat__error" role="alert">
          {error}
        </p>
      )}

      {messages.length === 0 && !busy && (
        <div className="panel chat__briefing">
          <h2>Here is what needs your attention</h2>
          {briefing.length > 0 ? (
            <ul className="chat__items">
              {briefing.map((item) => (
                <li
                  key={`${item.kind}-${item.title}`}
                  className={`chat__item chat__item--${item.kind}`}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  {item.action && (
                    <Link
                      className="btn btn--ghost"
                      to={item.action.href}
                      onClick={() => onClose?.()}
                    >
                      {item.action.label} <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Ask me a question, give me an instruction, or upload a bill.</p>
          )}
        </div>
      )}

      <div className="chat__log">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat__bubble chat__bubble--${message.role}`}
            aria-label={message.role === 'user' ? 'You' : 'Assistant'}
          >
            <p className="chat__who">{message.role === 'user' ? 'You' : 'LUX assistant'}</p>
            {message.role === 'assistant' && message.content.provenance && (
              <p className="chat__provenance">
                <Icon name="sparkles" size={13} /> {message.content.provenance.label}
              </p>
            )}
            <p className="chat__text">{message.content.text}</p>
            {message.role === 'assistant' && message.content.disclaimer && (
              <p className="chat__disclaimer">{message.content.disclaimer}</p>
            )}
            {message.role === 'assistant' && message.content.usedLocation && (
              <p className="chat__used-location">
                <Icon name="map-pin" size={13} /> Ranked from your shared location
              </p>
            )}
            {message.content.extraction && (
              <dl className="chat__facts">
                {message.content.extraction.providerName && (
                  <>
                    <dt>Provider</dt>
                    <dd>{message.content.extraction.providerName}</dd>
                  </>
                )}
                {message.content.extraction.totalAmountMinor !== null &&
                  message.content.extraction.currency && (
                    <>
                      <dt>Total</dt>
                      <dd>
                        {formatMinor(
                          message.content.extraction.totalAmountMinor,
                          message.content.extraction.currency,
                        )}
                      </dd>
                    </>
                  )}
                {message.content.extraction.serviceDate && (
                  <>
                    <dt>Service date</dt>
                    <dd>{message.content.extraction.serviceDate}</dd>
                  </>
                )}
                <dt>Confidence</dt>
                <dd>{Math.round(message.content.extraction.confidence * 100)}%</dd>
              </dl>
            )}
            {message.content.documentReview && (
              <DocumentVerdict review={message.content.documentReview} />
            )}
            {message.content.providers && message.content.providers.length > 0 && (
              <ProviderCards providers={message.content.providers} />
            )}
            {message.content.items && message.content.items.length > 0 && (
              <ul className="chat__items chat__items--inline">
                {message.content.items.map((item) => {
                  const done = item.confirmation ? resolved.has(item.confirmation.id) : false;
                  return (
                    <li
                      key={`${message.id}-${item.title}`}
                      className={`chat__item chat__item--${item.kind}`}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {item.confirmation && (
                        <div className="chat__approval">
                          {done ? (
                            <span className="badge badge--success">Done</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={confirming === item.confirmation.id}
                                onClick={() => void confirmAction(item)}
                              >
                                <Icon name="check-circle" size={15} />
                                {confirming === item.confirmation.id ? 'Working…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() =>
                                  setResolved((previous) =>
                                    new Set(previous).add(item.confirmation!.id),
                                  )
                                }
                              >
                                Not now
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {!item.confirmation && item.intent === 'find_providers' && (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => submitText('find a hospital near me')}
                          disabled={busy}
                        >
                          Find care now <span aria-hidden="true">→</span>
                        </button>
                      )}
                      {!item.confirmation && !item.intent && item.action && (
                        <Link
                          className="btn btn--ghost"
                          to={item.action.href}
                          onClick={() => onClose?.()}
                        >
                          {item.action.label} <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}

        {busy && (
          <article className="chat__bubble chat__bubble--assistant" aria-live="polite">
            <p className="chat__who">LUX assistant</p>
            <p className="chat__text chat__typing">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span className="sr-only">Thinking…</span>
            </p>
          </article>
        )}
        <div ref={endRef} />
      </div>

      {messages.length > 0 && (
        <div className="chat__suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              onClick={() => submitText(suggestion)}
              disabled={busy}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (attachment) void submitFile(attachment);
          else submitText(input);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setAttachment(file);
            event.target.value = '';
          }}
        />
        {attachment && (
          <span className="chat__attachment">
            <Icon name="receipt" size={16} /> {attachment.name}
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
            >
              <Icon name="x" size={14} />
            </button>
          </span>
        )}
        <button
          type="button"
          className="btn btn--ghost chat__icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Upload a provider bill"
        >
          <Icon name="upload" size={18} />
        </button>
        <button
          type="button"
          className={`btn btn--ghost chat__icon-btn chat__mic${voice.listening ? ' is-listening' : ''}`}
          onClick={voice.toggle}
          disabled={busy}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? 'Stop voice input' : 'Speak your message'}
        >
          <span
            className="chat__mic-ring"
            style={{ transform: `scale(${1 + voice.level * 1.6})` }}
          />
          <Icon name="smartphone" size={18} />
        </button>
        <input
          className="chat__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            voice.listening
              ? 'Listening… speak now'
              : attachment
                ? 'Add a note (optional)'
                : 'Ask, or tell me what to do…'
          }
          aria-label="Message the assistant"
          maxLength={2000}
          disabled={busy}
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={busy || (!input.trim() && !attachment)}
        >
          {busy ? 'Sending…' : attachment ? 'Read bill' : 'Send'}
        </button>
      </form>
      <p className="chat__footnote">
        The assistant prepares actions and moves money only after you approve. It never pays a bill
        or confirms one on your behalf.
      </p>
    </>
  );
}
