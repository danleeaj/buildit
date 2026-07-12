const TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";

function configuredApiKey() {
  return import.meta.env?.VITE_OPENAI_API_KEY || "";
}

function configuredModel() {
  return import.meta.env?.VITE_TRANSCRIPTION_MODEL || DEFAULT_MODEL;
}

function audioExtension(mimeType = "") {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("flac")) return "flac";
  return "webm";
}

function transcriptionError(status) {
  const error = new Error(
    status === 401
      ? "Voice transcription is not authorized. Check the OpenAI API key."
      : status === 429
        ? "Voice transcription is busy right now. Wait a moment and try again."
        : "Voice transcription could not finish. Check your connection and try again.",
  );
  error.code = "transcription-api-error";
  error.status = status;
  return error;
}

export function isAudioTranscriptionConfigured(apiKey = configuredApiKey()) {
  return Boolean(apiKey && !apiKey.includes("sk-..."));
}

export function createTranscriptionClient({
  apiKey = configuredApiKey(),
  model = configuredModel(),
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function transcribeAudio(blob, { language = "en", signal } = {}) {
    if (!isAudioTranscriptionConfigured(apiKey)) {
      const error = new Error("Add VITE_OPENAI_API_KEY to .env to use voice transcription.");
      error.code = "missing-api-key";
      throw error;
    }

    if (!(blob instanceof Blob) || blob.size === 0) {
      const error = new Error("No audio was captured. Try again and speak closer to the microphone.");
      error.code = "empty-audio";
      throw error;
    }

    const form = new FormData();
    form.append("file", blob, `buildit-voice.${audioExtension(blob.type)}`);
    form.append("model", model);
    if (language) form.append("language", language.split("-")[0]);

    let response;
    try {
      response = await fetchImpl(TRANSCRIPTION_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
    } catch (cause) {
      if (cause?.name === "AbortError") throw cause;
      const error = new Error("Voice transcription could not connect. Check your connection and try again.");
      error.code = "transcription-network-error";
      error.cause = cause;
      throw error;
    }

    if (!response.ok) throw transcriptionError(response.status);

    const payload = await response.json();
    const transcript = payload?.text?.trim();
    if (!transcript) {
      const error = new Error("No speech was detected. Try again and speak a little closer to the microphone.");
      error.code = "no-speech";
      throw error;
    }

    return transcript;
  };
}

export const transcribeAudio = createTranscriptionClient();

export const transcriptionDefaults = Object.freeze({ model: configuredModel() });
