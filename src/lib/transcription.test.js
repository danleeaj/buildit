import { describe, expect, test } from "bun:test";
import {
  createTranscriptionClient,
  isAudioTranscriptionConfigured,
} from "./transcription.js";

function audioBlob(type = "audio/webm") {
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type });
}

describe("audio transcription configuration", () => {
  test("requires a real API key", () => {
    expect(isAudioTranscriptionConfigured("")).toBe(false);
    expect(isAudioTranscriptionConfigured("sk-...")).toBe(false);
    expect(isAudioTranscriptionConfigured("sk-test-key")).toBe(true);
  });
});

describe("createTranscriptionClient", () => {
  test("sends multipart audio with the configured model and base language", async () => {
    let request;
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      model: "test-transcription-model",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          json: async () => ({ text: "  Set up fair doubles teams.  " }),
        };
      },
    });

    await expect(transcribe(audioBlob("audio/mp4"), { language: "en-SG" }))
      .resolves.toBe("Set up fair doubles teams.");

    expect(request.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(request.options.method).toBe("POST");
    expect(request.options.headers.Authorization).toBe("Bearer sk-test-key");
    expect(request.options.signal).toBeUndefined();
    expect(request.options.body).toBeInstanceOf(FormData);
    expect(request.options.body.get("model")).toBe("test-transcription-model");
    expect(request.options.body.get("language")).toBe("en");

    const uploadedFile = request.options.body.get("file");
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect(uploadedFile.type).toBe("audio/mp4");
    expect(uploadedFile.name).toBe("superflow-voice.mp4");
  });

  test("does not call the network without an API key", async () => {
    let fetchCalled = false;
    const transcribe = createTranscriptionClient({
      apiKey: "",
      fetchImpl: async () => {
        fetchCalled = true;
      },
    });

    await expect(transcribe(audioBlob())).rejects.toMatchObject({
      code: "missing-api-key",
    });
    expect(fetchCalled).toBe(false);
  });

  test("rejects an empty recording before calling the network", async () => {
    let fetchCalled = false;
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async () => {
        fetchCalled = true;
      },
    });

    await expect(transcribe(new Blob([], { type: "audio/webm" }))).rejects.toMatchObject({
      code: "empty-audio",
    });
    expect(fetchCalled).toBe(false);
  });

  test("normalizes a fetch failure as a transcription network error", async () => {
    const cause = new TypeError("fetch failed");
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async () => {
        throw cause;
      },
    });

    await expect(transcribe(audioBlob())).rejects.toMatchObject({
      code: "transcription-network-error",
      cause,
    });
  });

  test("passes cancellation through to fetch", async () => {
    const controller = new AbortController();
    let receivedSignal;
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async (_url, options) => {
        receivedSignal = options.signal;
        return { ok: true, json: async () => ({ text: "hello" }) };
      },
    });

    await transcribe(audioBlob(), { signal: controller.signal });
    expect(receivedSignal).toBe(controller.signal);
  });

  test("preserves an abort instead of reporting a network failure", async () => {
    const abortError = new DOMException("This operation was aborted", "AbortError");
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async () => { throw abortError; },
    });

    await expect(transcribe(audioBlob())).rejects.toBe(abortError);
  });

  test.each([
    [401, /not authorized/i],
    [429, /busy/i],
    [500, /could not finish/i],
  ])("preserves API status %i with an actionable message", async (status, message) => {
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async () => ({ ok: false, status }),
    });

    await expect(transcribe(audioBlob())).rejects.toMatchObject({
      code: "transcription-api-error",
      status,
      message: expect.stringMatching(message),
    });
  });

  test("rejects a successful response that contains no speech", async () => {
    const transcribe = createTranscriptionClient({
      apiKey: "sk-test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ text: "   " }),
      }),
    });

    await expect(transcribe(audioBlob())).rejects.toMatchObject({
      code: "no-speech",
    });
  });
});
