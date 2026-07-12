const MARKET_STORAGE_VERSION = 1;
const MARKET_STORAGE_PREFIX = "buildit:market-mission:v1";
const ALLOWED_VERDICTS = new Set([
  "promising",
  "uncertain",
  "weak_market",
  "insufficient_evidence",
]);
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);

const LUNA_INPUT_PRICE_PER_TOKEN = 1 / 1_000_000;
const LUNA_CACHED_INPUT_PRICE_PER_TOKEN = 0.1 / 1_000_000;
const LUNA_OUTPUT_PRICE_PER_TOKEN = 6 / 1_000_000;
const WEB_SEARCH_PRICE_PER_CALL = 10 / 1_000;

function marketError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function cleanText(value, limit = 1200) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanStringArray(value, { limit = 12, itemLimit = 240 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const cleaned = cleanText(item, itemLimit);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function parseHtmlDetails(html) {
  const fallback = {
    title: "",
    summary: cleanText(
      typeof html === "string"
        ? html
          .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
          .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
        : "",
      1000,
    ),
    capabilities: [],
  };

  if (typeof html !== "string" || !html.trim() || typeof DOMParser === "undefined") {
    const titleMatch = typeof html === "string" ? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) : null;
    return { ...fallback, title: cleanText(titleMatch?.[1], 100) };
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const contentDoc = doc.cloneNode(true);
    contentDoc.querySelectorAll("script, style, noscript, template, svg").forEach((element) => element.remove());
    const summary = cleanText(contentDoc.body?.textContent || "", 1000);

    const capabilityCandidates = [];
    doc.querySelectorAll("[data-component], h1, h2, h3, button, label, [role='button']").forEach((element) => {
      const label = cleanText(
        element.getAttribute("aria-label")
          || element.textContent
          || element.getAttribute("data-component")
          || "",
        120,
      );
      if (label) capabilityCandidates.push(label);
    });

    return {
      title: cleanText(doc.title, 100),
      summary: summary || fallback.summary,
      capabilities: cleanStringArray(capabilityCandidates, { limit: 10, itemLimit: 120 }),
    };
  } catch {
    return fallback;
  }
}

/**
 * Builds the compact, deterministic input boundary used by the Market Agent.
 * The function accepts both the spec names and the shorter workflow-state names.
 */
export function createProjectSnapshot({
  appId = "",
  appName = "",
  originalProblem = "",
  problem = "",
  approvedSolution = "",
  proposal = "",
  intendedUserContext = "",
  capabilities = [],
  appSummary = "",
  knownNamesPlacesAndConstraints = [],
  html = "",
  previousSnapshot = null,
  latestChange = "",
} = {}) {
  const htmlDetails = parseHtmlDetails(html);
  const resolvedProblem = cleanText(
    originalProblem || problem || previousSnapshot?.originalProblem,
    1200,
  );
  const resolvedSolution = cleanText(
    approvedSolution || proposal || previousSnapshot?.approvedSolution,
    1200,
  );
  const resolvedCapabilities = cleanStringArray(
    Array.isArray(capabilities) && capabilities.length
      ? capabilities
      : htmlDetails.capabilities.length
        ? htmlDetails.capabilities
        : previousSnapshot?.capabilities,
    { limit: 12, itemLimit: 180 },
  );
  const currentSummary = cleanText(
    appSummary || htmlDetails.summary || previousSnapshot?.appSummary || resolvedSolution,
    900,
  );
  const recentChange = cleanText(latestChange, 240);

  return {
    appId: cleanText(appId || previousSnapshot?.appId, 100),
    appName: cleanText(appName || htmlDetails.title || previousSnapshot?.appName || "Your app", 100),
    originalProblem: resolvedProblem,
    approvedSolution: resolvedSolution,
    intendedUserContext: cleanText(
      intendedUserContext || previousSnapshot?.intendedUserContext || resolvedProblem,
      700,
    ),
    capabilities: resolvedCapabilities,
    appSummary: cleanText(
      recentChange ? `${currentSummary} Recent change: ${recentChange}` : currentSummary,
      1000,
    ),
    knownNamesPlacesAndConstraints: cleanStringArray(
      Array.isArray(knownNamesPlacesAndConstraints) && knownNamesPlacesAndConstraints.length
        ? knownNamesPlacesAndConstraints
        : previousSnapshot?.knownNamesPlacesAndConstraints,
      { limit: 12, itemLimit: 180 },
    ),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
}

export function fingerprintProjectSnapshot(snapshot) {
  const input = JSON.stringify(stableValue(snapshot || {}));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function marketStorageKey(snapshot) {
  const appId = cleanText(snapshot?.appId, 100);
  if (!appId) return null;
  return `${MARKET_STORAGE_PREFIX}:${encodeURIComponent(appId)}:${fingerprintProjectSnapshot(snapshot)}`;
}

export function loadMarketMission(snapshot) {
  const key = marketStorageKey(snapshot);
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const envelope = JSON.parse(localStorage.getItem(key) || "null");
    if (
      envelope?.version !== MARKET_STORAGE_VERSION
      || envelope.appId !== snapshot.appId
      || envelope.fingerprint !== fingerprintProjectSnapshot(snapshot)
      || !envelope.mission
    ) {
      return null;
    }
    return envelope.mission;
  } catch {
    return null;
  }
}

export function saveMarketMission(snapshot, mission) {
  const key = marketStorageKey(snapshot);
  if (!key || !mission || typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify({
      version: MARKET_STORAGE_VERSION,
      appId: snapshot.appId,
      fingerprint: fingerprintProjectSnapshot(snapshot),
      savedAt: new Date().toISOString(),
      mission,
    }));
    return true;
  } catch {
    return false;
  }
}

export function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("").trim();
}

function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizedUrlKey(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLocaleLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  url.searchParams.sort();
  return url.href;
}

function sourceFromValue(value) {
  const citation = value?.url_citation || value;
  const url = safeHttpUrl(citation?.url);
  if (!url) return null;
  return {
    url,
    title: cleanText(citation?.title, 240) || new URL(url).hostname.replace(/^www\./, ""),
  };
}

export function extractResponseSources(response) {
  const sourceMap = new Map();
  const addSource = (value) => {
    const source = sourceFromValue(value);
    const key = source && normalizedUrlKey(source.url);
    if (!source || !key) return;
    const current = sourceMap.get(key);
    if (!current || current.title === new URL(current.url).hostname.replace(/^www\./, "")) {
      sourceMap.set(key, source);
    }
  };

  for (const item of response?.output || []) {
    if (item?.type === "web_search_call") {
      for (const source of item.action?.sources || item.sources || []) addSource(source);
    }
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation?.type === "url_citation" || annotation?.url_citation) addSource(annotation);
      }
    }
  }

  return [...sourceMap.values()];
}

function responseSearchCallCount(response) {
  return (response?.output || []).filter((item) => item?.type === "web_search_call").length;
}

export function estimateMarketCost(usageOrResponse, searchCallCount) {
  const response = usageOrResponse?.usage ? usageOrResponse : null;
  const usage = response?.usage || usageOrResponse || {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const cachedTokens = Math.min(
    inputTokens,
    Number(usage.input_tokens_details?.cached_tokens) || 0,
  );
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const outputTokens = Number(usage.output_tokens) || 0;
  const searches = Number.isFinite(searchCallCount)
    ? Math.max(0, searchCallCount)
    : responseSearchCallCount(response);

  const estimated = (
    uncachedTokens * LUNA_INPUT_PRICE_PER_TOKEN
    + cachedTokens * LUNA_CACHED_INPUT_PRICE_PER_TOKEN
    + outputTokens * LUNA_OUTPUT_PRICE_PER_TOKEN
    + searches * WEB_SEARCH_PRICE_PER_CALL
  );
  return Number(estimated.toFixed(6));
}

function responseRefusal(response) {
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "refusal") return cleanText(content.refusal, 500) || "The request was refused.";
    }
  }
  return null;
}

function sourceResolver(sources) {
  const map = new Map();
  for (const source of sources) {
    const key = normalizedUrlKey(source.url);
    if (key) map.set(key, source.url);
  }
  return (value) => {
    const key = normalizedUrlKey(value);
    return key ? map.get(key) || null : null;
  };
}

function resolvedSourceUrls(value, resolveSource, limit = 8) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const candidate of value) {
    const resolved = resolveSource(candidate);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
    if (result.length >= limit) break;
  }
  return result;
}

function requireText(value, field, limit = 1600) {
  const cleaned = cleanText(value, limit);
  if (!cleaned) throw marketError(`Market response is missing ${field}.`, "invalid-market-response");
  return cleaned;
}

function normalizeComparator(value, resolveSource) {
  if (!value || typeof value !== "object") return null;
  const sourceUrls = resolvedSourceUrls(value.sourceUrls, resolveSource, 6);
  const resolvedCanonicalUrl = resolveSource(value.canonicalUrl);
  if (resolvedCanonicalUrl && !sourceUrls.includes(resolvedCanonicalUrl)) sourceUrls.unshift(resolvedCanonicalUrl);
  if (!sourceUrls.length) return null;

  try {
    return {
      name: requireText(value.name, "a comparator name", 160),
      canonicalUrl: resolvedCanonicalUrl || sourceUrls[0],
      whatItDoes: requireText(value.whatItDoes, "what a comparator does", 800),
      pricingOrPositioning: value.pricingOrPositioning === null
        ? null
        : cleanText(value.pricingOrPositioning, 500) || null,
      apparentGap: requireText(value.apparentGap, "a comparator gap", 700),
      productResponse: requireText(value.productResponse, "a product response", 700),
      sourceUrls,
    };
  } catch {
    return null;
  }
}

function normalizeOpportunity(value) {
  if (!value || typeof value !== "object") {
    throw marketError("Market response is missing the opportunity section.", "invalid-market-response");
  }
  return {
    firstCustomer: requireText(value.firstCustomer, "the first customer", 600),
    differentiation: requireText(value.differentiation, "differentiation", 700),
    productIterations: cleanStringArray(value.productIterations, { limit: 3, itemLimit: 500 }),
    largestUncertainty: requireText(value.largestUncertainty, "the largest uncertainty", 700),
    nextValidationMove: requireText(value.nextValidationMove, "the next validation move", 700),
  };
}

function normalizeMarketOpportunity(value, resolveSource) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;

  const lowAnnualRevenue = Number(value.lowAnnualRevenue);
  const highAnnualRevenue = Number(value.highAnnualRevenue);
  const assumptions = cleanStringArray(value.assumptions, { limit: 8, itemLimit: 500 });
  const sourceUrls = resolvedSourceUrls(value.sourceUrls, resolveSource, 8);
  const confidence = ALLOWED_CONFIDENCE.has(value.confidence) ? value.confidence : null;
  if (
    !Number.isFinite(lowAnnualRevenue)
    || !Number.isFinite(highAnnualRevenue)
    || lowAnnualRevenue < 0
    || highAnnualRevenue < lowAnnualRevenue
    || !assumptions.length
    || !sourceUrls.length
    || !confidence
  ) {
    return null;
  }

  const calculation = cleanText(value.calculation, 1000);
  const currency = cleanText(value.currency, 20);
  const caveat = cleanText(value.caveat, 700);
  if (!calculation || !currency || !caveat) return null;

  return {
    currency,
    lowAnnualRevenue,
    highAnnualRevenue,
    calculation,
    assumptions,
    confidence,
    caveat,
    sourceUrls,
  };
}

function normalizeJustification(value, resolveSource) {
  if (!value || typeof value !== "object") {
    throw marketError("Market response is missing its justification.", "invalid-market-response");
  }
  const confidence = ALLOWED_CONFIDENCE.has(value.confidence) ? value.confidence : "low";
  return {
    supportingEvidence: cleanStringArray(value.supportingEvidence, { limit: 6, itemLimit: 600 }),
    contradictingEvidence: cleanStringArray(value.contradictingEvidence, { limit: 6, itemLimit: 600 }),
    assumptions: cleanStringArray(value.assumptions, { limit: 6, itemLimit: 600 }),
    confidence,
    sourceUrls: resolvedSourceUrls(value.sourceUrls, resolveSource, 10),
  };
}

/**
 * Parses a raw Responses API object into the stable bundle consumed by the UI.
 * It throws a coded Error for the explicit retry state.
 */
export function parseMarketResponse(response) {
  if (!response || typeof response !== "object") {
    throw marketError("Market research returned no response.", "empty-market-response");
  }
  if (response.error) {
    throw marketError("Market research did not complete.", "market-response-error", {
      detail: response.error,
    });
  }
  if (response.status && response.status !== "completed") {
    throw marketError("Market research stopped before it was complete.", "incomplete-market-response", {
      detail: response.incomplete_details || null,
    });
  }

  const refusal = responseRefusal(response);
  if (refusal) throw marketError(refusal, "market-response-refusal");

  const text = extractResponseText(response);
  if (!text) throw marketError("Market research returned an empty response.", "empty-market-response");

  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw marketError("Market research returned an unreadable response.", "invalid-market-response", {
      cause: error,
    });
  }

  if (!ALLOWED_VERDICTS.has(value?.verdict)) {
    throw marketError("Market research returned an invalid verdict.", "invalid-market-response");
  }

  const sources = extractResponseSources(response);
  const resolveSource = sourceResolver(sources);
  const comparators = Array.isArray(value.comparators)
    ? value.comparators.slice(0, 3).map((item) => normalizeComparator(item, resolveSource)).filter(Boolean)
    : [];
  const result = {
    verdict: value.verdict,
    verdictSummary: requireText(value.verdictSummary, "the verdict summary", 1000),
    comparators,
    opportunity: normalizeOpportunity(value.opportunity),
    marketOpportunity: normalizeMarketOpportunity(value.marketOpportunity, resolveSource),
    justification: normalizeJustification(value.justification, resolveSource),
  };
  const searchCallCount = responseSearchCallCount(response);

  return {
    result,
    sources,
    meta: {
      responseId: response.id || null,
      model: response.model || null,
      usage: response.usage || null,
      searchCallCount,
      estimatedCost: estimateMarketCost(response, searchCallCount),
      createdAt: new Date().toISOString(),
    },
  };
}
