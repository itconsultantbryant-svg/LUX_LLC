import { useCallback, useEffect, useRef, useState } from 'react';

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  const scope = window as unknown as Record<string, RecognitionCtor | undefined>;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

type Options = {
  /** Called with the complete, committed transcript when listening stops. */
  onFinal: (text: string) => void;
  /** Called continuously with the live (final + interim) transcript. */
  onInterim?: (text: string) => void;
};

/**
 * Real-time voice capture.
 *
 * Uses the browser SpeechRecognition engine for streaming transcription and,
 * independently, getUserMedia + an audio analyser for a live input meter so the
 * customer can see the microphone is genuinely recording. Either capability can
 * be missing without disabling the other.
 */
export function useVoiceInput({ onFinal, onInterim }: Options) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionLike | null>(null);
  const finalRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  const stopMeter = useCallback(() => {
    if (audioRef.current) {
      cancelAnimationFrame(audioRef.current.raf);
      void audioRef.current.ctx.close().catch(() => undefined);
      audioRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        if (audioRef.current) audioRef.current.raf = requestAnimationFrame(tick);
      };
      audioRef.current = { ctx, raf: requestAnimationFrame(tick) };
    } catch {
      // The meter is a nicety; transcription can still work without it.
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    setListening(false);
    stopMeter();
    const text = finalRef.current.trim();
    finalRef.current = '';
    if (text) onFinal(text);
  }, [onFinal, stopMeter]);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    setError(null);
    finalRef.current = '';
    if (!Ctor) {
      setSupported(false);
      setError(
        'Live voice transcription is not supported in this browser. Type your message instead.',
      );
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      finalRef.current = finalText;
      onInterim?.(`${finalText}${interimText}`.trim());
    };
    recognition.onerror = (event) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed')
        setError('Microphone permission was blocked. Allow it and try again.');
      else if (event?.error === 'no-speech') setError('I did not hear anything. Try again.');
      else setError('Voice input stopped unexpectedly. Try again.');
      stop();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      stopMeter();
      const text = finalRef.current.trim();
      finalRef.current = '';
      if (text) onFinal(text);
    };
    recognitionRef.current = recognition;
    setListening(true);
    void startMeter();
    try {
      recognition.start();
    } catch {
      setError('Voice input is already running.');
    }
  }, [onFinal, onInterim, startMeter, stop, stopMeter]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      stopMeter();
    },
    [stopMeter],
  );

  return { listening, level, supported, error, start, stop, toggle };
}
