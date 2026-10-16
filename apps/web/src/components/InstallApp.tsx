import { useEffect, useRef, useState } from 'react';
import { Brand } from './Brand';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  async function install() {
    if (!prompt) {
      dialog.current?.showModal();
      return;
    }
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') setInstalled(true);
    } catch {
      setMessage('Use your browser menu to add HealthWallet to your home screen.');
    } finally {
      setPrompt(null);
    }
  }
  if (installed)
    return <span className="install__complete">HealthWallet is installed on this device</span>;
  return (
    <>
      <button
        className="btn btn--ghost install__button"
        type="button"
        onClick={() => void install()}
      >
        Add to your device <span aria-hidden="true">↗</span>
      </button>
      <span className="sr-only" role="status">
        {message}
      </span>
      <dialog ref={dialog} className="install-dialog" aria-labelledby="install-title">
        <Brand compact />
        <h2 id="install-title">HealthWallet, one tap away.</h2>
        <p>Open the app from your home screen, or keep using it in your browser.</p>
        <ul>
          <li>
            <strong>iPhone or iPad</strong>
            <span>In Safari, open Share, then choose Add to Home Screen.</span>
          </li>
          <li>
            <strong>Android</strong>
            <span>
              Open your browser menu and choose Install app or Add to Home screen, when available.
            </span>
          </li>
          <li>
            <strong>Computer</strong>
            <span>
              In a supported browser, use the install option in the address bar or browser menu.
            </span>
          </li>
        </ul>
        <p className="install-dialog__note">
          Install options depend on your browser and require a secure connection. Sign-in and
          account actions need internet access.
        </p>
        <form method="dialog">
          <button className="btn btn--primary">Got it</button>
        </form>
      </dialog>
    </>
  );
}
