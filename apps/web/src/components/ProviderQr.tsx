import { useEffect, useRef, useState } from 'react';
import { Feedback } from './Feedback';
import { providerFromQr } from '../lib/provider';
export function ProviderQr({ id }: { id: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const url = `${window.location.origin}/pay?provider=${id}`;
  useEffect(() => {
    let active = true;
    import('qrcode')
      .then((q) => q.toDataURL(url, { width: 240, margin: 4, errorCorrectionLevel: 'M' }))
      .then((data) => {
        if (active) setImage(data);
      })
      .catch(() => setError('QR generation unavailable. Share the provider link below.'));
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div>
      {image && (
        <img
          src={image}
          width={240}
          height={240}
          style={{ maxWidth: '100%', height: 'auto' }}
          alt="Provider QR code for customer selection"
        />
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        <a className="text-link" href={url}>
          Open provider selection
        </a>
      </p>
      <p>
        A QR code identifies a provider. Verification is checked against the directory when a
        customer continues.
      </p>
    </div>
  );
}
export function ProviderScanner({ onSelect }: { onSelect: (id: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  function stop() {
    generation.current++;
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setRunning(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function scan() {
    setError('');
    setBusy(true);
    const run = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          'Camera access is unavailable. Upload a QR image, paste the provider link, or use the directory.',
        );
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (run !== generation.current) {
        camera.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = camera;
      setRunning(true);
      if (!video.current) throw Error('Camera preview unavailable.');
      video.current.srcObject = camera;
      await video.current.play();
      const jsQR = (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const frame = () => {
        if (run !== generation.current || !video.current) return;
        const v = video.current;
        if (v.videoWidth) {
          const ratio = Math.min(1, 800 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * ratio);
          canvas.height = Math.round(v.videoHeight * ratio);
          const c = canvas.getContext('2d', { willReadFrequently: true });
          if (c) {
            c.drawImage(v, 0, 0, canvas.width, canvas.height);
            const found = jsQR(
              c.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
            );
            if (found) {
              try {
                onSelect(providerFromQr(found.data, window.location.origin));
              } catch (e) {
                setError((e as Error).message);
              }
              stop();
              return;
            }
          }
        }
        timer.current = setTimeout(frame, 250);
      };
      frame();
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : 'Camera access failed. Use the directory instead.');
    } finally {
      setBusy(false);
    }
  }
  async function photo(file: File) {
    setBusy(true);
    setError('');
    try {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)
        throw Error('Choose a QR image smaller than 10 MiB.');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const c = canvas.getContext('2d');
      if (!c) throw Error('Image reading unavailable.');
      c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const jsQR = (await import('jsqr')).default;
      const found = jsQR(
        c.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (!found) throw Error('No readable QR code found. Try a clearer image or the directory.');
      onSelect(providerFromQr(found.data, window.location.origin));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Scan a provider QR code</summary>
      <p>Camera images are processed on this device and are not uploaded.</p>
      <video
        ref={video}
        muted
        playsInline
        hidden={!running}
        style={{ width: '100%', maxHeight: 320 }}
        aria-label="Provider QR camera preview"
      />
      <div className="button-row">
        <button className="btn btn--ghost" disabled={busy || running} onClick={() => void scan()}>
          Start camera
        </button>
        {running && (
          <button className="btn btn--ghost" onClick={stop}>
            Stop camera
          </button>
        )}
      </div>
      <label htmlFor="qr-photo">Upload a QR image</label>
      <input
        id="qr-photo"
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void photo(f);
          e.target.value = '';
        }}
      />
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSelect(providerFromQr(link, window.location.origin));
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label htmlFor="provider-link">Or paste the provider link</label>
        <input
          id="provider-link"
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          required
        />
        <button className="btn btn--ghost">Use provider link</button>
      </form>
      {error && <Feedback kind="error" title={error} />}
    </details>
  );
}
