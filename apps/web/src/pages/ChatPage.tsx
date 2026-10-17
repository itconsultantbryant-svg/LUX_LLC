import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ChatBriefingResponse,
  ChatHistoryResponse,
  ChatItem,
  ChatMessage,
  ChatSendResponse,
} from '@healthwallet/shared';
import { ApiError, apiGet, apiPost } from '../lib/api';
import { useAuth } from '../features/auth-context';
import { Icon } from '../components/icons/Icon';
import './ChatPage.css';

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type RecognitionEvent = {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type RecognitionCtor = new () => RecognitionLike;

const SPEECH_SUGGESTIONS = [
  'What should I do next?',
  'What is my wallet balance?',
  'Find a verified provider',
  'How much do you charge?',
];

function getRecognition(): RecognitionCtor | null {
  const scope = window as unknown as Record<string, RecognitionCtor | undefined>;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function readAloud(text: string) {
  if (!('speechSynthesis' in window)) return;
  const cleaned = text.replace(/SIMULATION[^\n.]*\./g, '').trim();
  if (!cleaned) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error('We could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function ChatPage() {
  const { signedIn, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [briefing, setBriefing] = useState<ChatItem[]>([]);
  const [simulationLabel, setSimulationLabel] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);
  const [listening, setListening] = useState(false);
  const [aloud, setAloud] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

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
      try {
        const response = await apiPost<ChatSendResponse>('/api/chat/send', payload);
        setMessages((previous) => [...previous, response.user, response.assistant]);
        setSimulationLabel(response.simulationLabel);
        setAttachment(null);
        if (aloud) readAloud(response.assistant.content.text);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) setNotSignedIn(true);
        else setError(caught instanceof Error ? caught.message : 'Your message was not delivered.');
      } finally {
        setBusy(false);
      }
    },
    [aloud],
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

  const submitFile = useCallback(
    async (file: File) => {
      if (busy) return;
      setError(null);
      try {
        const base64 = await fileToBase64(file);
        await send({ document: { contentType: file.type || 'application/pdf', base64 } });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That file could not be uploaded.');
      }
    },
    [busy, send],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) {
      setError('Voice input is not supported in this browser. Type your message instead.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInput(finalText || interimText);
      if (finalText.trim()) stopListening();
    };
    recognition.onerror = () => {
      setError('I could not hear you. Check your microphone and try again.');
      stopListening();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [listening, stopListening]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const toggleAloud = useCallback(() => {
    setAloud((current) => {
      const next = !current;
      if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return next;
    });
  }, []);

  if (authLoading || (!signedIn && !notSignedIn)) {
    return (
      <section className="workspace chat">
        <p className="muted">Loading your assistant…</p>
      </section>
    );
  }

  if (notSignedIn) {
    return (
      <section className="workspace chat">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              <Icon name="message-circle" size={15} /> LUX assistant
            </p>
            <h1>Ask me about your care costs</h1>
            <p>Sign in to chat, upload a provider bill, and see what needs your attention.</p>
          </div>
        </div>
        <div className="panel chat__signin">
          <h2>Sign in to continue</h2>
          <p className="muted">
            The assistant reads your own bills, wallet and support requests, so it needs your
            account.
          </p>
          <Link className="btn btn--primary" to="/account">
            <Icon name="user" size={18} /> Sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace chat">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="message-circle" size={15} /> LUX assistant
          </p>
          <h1>Ask me anything about paying for care</h1>
          <p>
            Chat in your own words, dictate a question, or upload a provider bill and I will read it
            for you.
          </p>
        </div>
        <div className="chat__voice-toggles">
          <button
            type="button"
            className={`btn btn--ghost${aloud ? ' is-active' : ''}`}
            onClick={toggleAloud}
            aria-pressed={aloud}
          >
            <Icon name="info" size={16} /> {aloud ? 'Reading aloud on' : 'Read replies aloud'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              void load();
            }}
            disabled={busy}
          >
            <Icon name="refresh" size={16} /> Refresh
          </button>
        </div>
      </div>

      {simulationLabel && <p className="chat__banner">{simulationLabel}</p>}
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
                    <Link className="btn btn--ghost" to={item.action.href}>
                      {item.action.label} <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing urgent. Ask me a question or upload a bill to begin.</p>
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
            <p className="chat__text">{message.content.text}</p>
            {message.role === 'assistant' && message.content.disclaimer && (
              <p className="chat__disclaimer">{message.content.disclaimer}</p>
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
                        {(message.content.extraction.totalAmountMinor / 100).toFixed(2)}{' '}
                        {message.content.extraction.currency}
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
            {message.content.items && message.content.items.length > 0 && (
              <ul className="chat__items chat__items--inline">
                {message.content.items.map((item) => (
                  <li
                    key={`${message.id}-${item.title}`}
                    className={`chat__item chat__item--${item.kind}`}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    {item.action && (
                      <Link className="btn btn--ghost" to={item.action.href}>
                        {item.action.label} <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </li>
                ))}
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
          {SPEECH_SUGGESTIONS.map((suggestion) => (
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
          className={`btn btn--ghost chat__icon-btn${listening ? ' is-listening' : ''}`}
          onClick={toggleVoiceInput}
          disabled={busy}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Speak your message'}
        >
          <Icon name="smartphone" size={18} />
          <span>{listening ? 'Listening…' : 'Speak'}</span>
        </button>
        <input
          className="chat__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            attachment ? 'Add a note (optional)' : 'Ask about a bill, your wallet, or support…'
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
        The assistant gives general guidance only. It never moves money, authorizes a payment, or
        confirms a bill — those steps always stay with you.
      </p>
    </section>
  );
}
