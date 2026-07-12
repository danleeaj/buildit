import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_LANGUAGE = "en-SG";
const MAX_RECORDING_MS = 90_000;

const ERROR_MESSAGES = {
  "permission-denied":
    "Microphone access was denied. Allow it in your browser settings and try again.",
  "secure-context":
    "Voice input needs a secure connection. Use the HTTPS app or localhost, then try again.",
  "no-speech":
    "No speech was detected. Try again and speak a little closer to the microphone.",
  "audio-capture":
    "No working microphone was found. Check your microphone and try again.",
  network: "Voice input lost its connection. Check your connection and try again.",
  aborted: "Voice input stopped before it finished. Try again.",
  unsupported: "Voice input is unavailable in this browser. Type your request instead.",
  "start-failed": "Voice input could not start. Check microphone access and try again.",
  "stop-failed": "Voice input could not stop cleanly. Please try again.",
  "recognition-error": "Voice input failed. Please try again.",
};

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function canRecordAudio() {
  return Boolean(
    typeof window !== "undefined"
      && window.MediaRecorder
      && navigator.mediaDevices?.getUserMedia,
  );
}

function preferredMimeType() {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
  ];
  return candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || "";
}

function normalizedError(error, fallback = "recognition-error") {
  const rawCode = error?.error || error?.code || error?.name || null;
  let code = fallback;

  if (["not-allowed", "service-not-allowed", "NotAllowedError", "PermissionDeniedError"].includes(rawCode)) {
    code = "permission-denied";
  } else if (["NotFoundError", "DevicesNotFoundError", "audio-capture"].includes(rawCode)) {
    code = "audio-capture";
  } else if (["no-speech", "empty-audio"].includes(rawCode)) {
    code = "no-speech";
  } else if (["network", "transcription-network-error"].includes(rawCode)) {
    code = "network";
  } else if (rawCode === "aborted" || rawCode === "AbortError") {
    code = "aborted";
  } else if (rawCode === "SecurityError") {
    code = "secure-context";
  }

  const preserveMessage = typeof rawCode === "string"
    && (rawCode.startsWith("transcription-") || rawCode === "missing-api-key");

  return {
    code,
    message: preserveMessage
      ? error.message
      : ERROR_MESSAGES[code] || ERROR_MESSAGES[fallback],
    rawCode,
  };
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function transcriptFromResults(event) {
  const finalParts = [];
  const interimParts = [];
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;
    (result.isFinal ? finalParts : interimParts).push(transcript);
  }
  return {
    final: finalParts.join(" "),
    interim: interimParts.join(" "),
  };
}

/**
 * Voice capture with a dependable recorded-audio path and Web Speech fallback.
 * When `transcribe` is provided, MediaRecorder is the primary path. Browser
 * speech recognition is retained only for environments where recording is not
 * available.
 */
export function useSpeechRecognition(options = {}) {
  const language = typeof options === "string"
    ? options || DEFAULT_LANGUAGE
    : options.language || options.lang || DEFAULT_LANGUAGE;
  const transcribe = typeof options === "object" ? options.transcribe : null;

  const [requesting, setRequesting] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState(null);

  const mountedRef = useRef(false);
  const wantsListeningRef = useRef(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const captureIdRef = useRef(0);
  const transcriptionControllerRef = useRef(null);

  const clearCapture = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    recognitionRef.current = null;
    chunksRef.current = [];
  }, []);

  const reset = useCallback(() => {
    wantsListeningRef.current = false;
    captureIdRef.current += 1;
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;

    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* Already stopping. */ }
    }

    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }

    clearCapture();
    setRequesting(false);
    setListening(false);
    setInterimTranscript("");
    setFinalTranscript("");
    setError(null);
    setProcessing(false);
  }, [clearCapture]);

  const startBrowserRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      wantsListeningRef.current = false;
      setRequesting(false);
      setError({ code: "unsupported", message: ERROR_MESSAGES.unsupported, rawCode: null });
      return false;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (!mountedRef.current || !wantsListeningRef.current) return;
      setRequesting(false);
      setListening(true);
    };
    recognition.onresult = (event) => {
      if (!mountedRef.current) return;
      const transcript = transcriptFromResults(event);
      setFinalTranscript(transcript.final);
      setInterimTranscript(transcript.interim);
    };
    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      wantsListeningRef.current = false;
      setRequesting(false);
      setListening(false);
      setError(normalizedError(event));
    };
    recognition.onend = () => {
      if (!mountedRef.current) return;
      wantsListeningRef.current = false;
      setRequesting(false);
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      return true;
    } catch (caughtError) {
      recognitionRef.current = null;
      setRequesting(false);
      setError(normalizedError(caughtError, "start-failed"));
      return false;
    }
  }, [language]);

  const startRecordedCapture = useCallback(async (captureId) => {
    if (!window.isSecureContext) {
      wantsListeningRef.current = false;
      setRequesting(false);
      setError({ code: "secure-context", message: ERROR_MESSAGES["secure-context"], rawCode: null });
      return false;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (caughtError) {
      if (!mountedRef.current || captureId !== captureIdRef.current) return false;
      wantsListeningRef.current = false;
      setRequesting(false);
      setError(normalizedError(caughtError, "start-failed"));
      return false;
    }

    if (!mountedRef.current || !wantsListeningRef.current || captureId !== captureIdRef.current) {
      stopTracks(stream);
      return false;
    }

    const mimeType = preferredMimeType();
    let recorder;
    try {
      recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (caughtError) {
      stopTracks(stream);
      wantsListeningRef.current = false;
      setRequesting(false);
      setError(normalizedError(caughtError, "start-failed"));
      return false;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorder.onerror = (event) => {
      if (!mountedRef.current || captureId !== captureIdRef.current) return;
      wantsListeningRef.current = false;
      setRequesting(false);
      setListening(false);
      setError(normalizedError(event, "audio-capture"));
      clearCapture();
    };
    recorder.onstart = () => {
      if (!mountedRef.current || captureId !== captureIdRef.current) return;
      setRequesting(false);
      setListening(true);
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    };
    recorder.onstop = async () => {
      const chunks = chunksRef.current;
      const blobType = recorder.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type: blobType });
      clearCapture();
      wantsListeningRef.current = false;
      if (!mountedRef.current || captureId !== captureIdRef.current) return;
      setRequesting(false);
      setListening(false);
      setProcessing(true);

      try {
        const controller = new AbortController();
        transcriptionControllerRef.current = controller;
        const transcript = await transcribe(blob, { language, signal: controller.signal });
        if (!mountedRef.current || captureId !== captureIdRef.current) return;
        setFinalTranscript(transcript);
        setInterimTranscript("");
      } catch (caughtError) {
        if (!mountedRef.current || captureId !== captureIdRef.current) return;
        setError(normalizedError(caughtError));
      } finally {
        if (captureId === captureIdRef.current) {
          transcriptionControllerRef.current = null;
          if (mountedRef.current) setProcessing(false);
        }
      }
    };

    try {
      recorder.start(250);
      return true;
    } catch (caughtError) {
      clearCapture();
      wantsListeningRef.current = false;
      setRequesting(false);
      setError(normalizedError(caughtError, "start-failed"));
      return false;
    }
  }, [clearCapture, language, transcribe]);

  const start = useCallback(() => {
    if (requesting || listening || processing) return false;
    reset();
    const captureId = captureIdRef.current;
    wantsListeningRef.current = true;
    setRequesting(true);

    if (transcribe && typeof window !== "undefined" && !window.isSecureContext) {
      wantsListeningRef.current = false;
      setRequesting(false);
      setError({ code: "secure-context", message: ERROR_MESSAGES["secure-context"], rawCode: null });
      return false;
    }

    if (transcribe && canRecordAudio()) {
      void startRecordedCapture(captureId);
      return true;
    }

    return startBrowserRecognition();
  }, [listening, processing, requesting, reset, startBrowserRecognition, startRecordedCapture, transcribe]);

  const stop = useCallback(() => {
    wantsListeningRef.current = false;
    clearTimeout(timeoutRef.current);

    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
      return true;
    }

    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
        return true;
      } catch (caughtError) {
        setError(normalizedError(caughtError, "stop-failed"));
      }
    }

    if (requesting) {
      captureIdRef.current += 1;
      setRequesting(false);
      return true;
    }
    return false;
  }, [requesting]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      wantsListeningRef.current = false;
      captureIdRef.current += 1;
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      clearTimeout(timeoutRef.current);
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;
        try { recognition.abort(); } catch { /* Already stopped. */ }
      }
      clearCapture();
    };
  }, [clearCapture]);

  return {
    supported: Boolean((transcribe && canRecordAudio()) || getSpeechRecognitionConstructor()),
    mode: transcribe && canRecordAudio() ? "recorded" : "browser",
    requesting,
    listening,
    processing,
    interimTranscript,
    finalTranscript,
    error,
    start,
    stop,
    reset,
  };
}

export default useSpeechRecognition;
