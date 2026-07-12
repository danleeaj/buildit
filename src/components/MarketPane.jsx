import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  askMarketQuestion,
  researchMarket,
} from "../lib/marketAgent.js";
import {
  fingerprintProjectSnapshot,
  loadMarketMission,
  saveMarketMission,
} from "../lib/marketResearch.js";
import {
  ArrowIcon,
  BackIcon,
  ChevronIcon,
  ExternalLinkIcon,
  RetryIcon,
} from "./Icons.jsx";
import "./MarketPane.css";

const MARKET_STAGES = [
  "Starting research",
  "Finding comparable products",
  "Looking for gaps",
  "Estimating the opportunity",
  "Preparing a recommendation",
];

const VERDICT_COPY = {
  promising: {
    label: "Promising",
    headline: "There may be a business here.",
  },
  uncertain: {
    label: "Uncertain",
    headline: "The opportunity is still unclear.",
  },
  weak_market: {
    label: "Weak market",
    headline: "This does not look like a strong market yet.",
  },
  insufficient_evidence: {
    label: "Not enough evidence",
    headline: "There is not enough evidence to call this yet.",
  },
};

const ALLOWED_VERDICTS = new Set(Object.keys(VERDICT_COPY));

function cleanUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function sourceRecord(source) {
  if (typeof source === "string") {
    const url = cleanUrl(source);
    return url ? { url, title: "Source" } : null;
  }

  if (!source || typeof source !== "object") return null;
  const nested = source.source && typeof source.source === "object" ? source.source : source;
  const url = cleanUrl(nested.url || nested.uri || nested.link);
  if (!url) return null;
  return {
    url,
    title: nested.title || nested.name || source.title || "Source",
  };
}

function itemSourceUrls(item) {
  if (!item || typeof item !== "object") return [];
  const values = item.sourceUrls || item.sources || item.urls || [];
  return (Array.isArray(values) ? values : [values])
    .map((value) => sourceRecord(value)?.url || cleanUrl(value))
    .filter(Boolean);
}

function collectSourceCatalog(mission) {
  const result = mission?.result;
  const records = new Map();
  const add = (value, fallbackTitle = "Source") => {
    const record = sourceRecord(value);
    if (!record) return;
    const previous = records.get(record.url);
    records.set(record.url, {
      url: record.url,
      title: previous && previous.title !== "Source"
        ? previous.title
        : record.title || fallbackTitle,
    });
  };

  const sourceGroups = [
    mission?.sources,
    mission?.sourceCatalog,
    result?.sources,
  ];
  sourceGroups.forEach((group) => {
    if (Array.isArray(group)) group.forEach((source) => add(source));
  });

  (result?.comparators || []).forEach((comparator) => {
    itemSourceUrls(comparator).forEach((url) => add(url, comparator.name));
  });
  itemSourceUrls(result?.marketOpportunity).forEach((url) => add(url, "Market opportunity source"));
  itemSourceUrls(result?.justification).forEach((url) => add(url, "Recommendation source"));

  [
    ...(result?.justification?.supportingEvidence || []),
    ...(result?.justification?.contradictingEvidence || []),
  ].forEach((item) => itemSourceUrls(item).forEach((url) => add(url)));

  return Array.from(records.values());
}

function normalizeMission(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Market research returned no usable result.");
  }

  const result = payload.result || payload.marketResearch || payload.data?.result || payload;
  if (!result || !ALLOWED_VERDICTS.has(result.verdict)) {
    throw new Error("Market research returned an incomplete verdict.");
  }

  return {
    ...payload,
    result: {
      ...result,
      comparators: Array.isArray(result.comparators)
        ? result.comparators.filter(Boolean).slice(0, 3)
        : [],
    },
    sources: Array.isArray(payload.sources) ? payload.sources : [],
  };
}

function displayDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatMoney(value, currency = "USD") {
  if (!Number.isFinite(Number(value))) return null;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value));
  } catch {
    return `${currency} ${new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value))}`;
  }
}

function errorCopy(error, isOnline) {
  if (!isOnline || error?.code === "offline") {
    return "Market research needs a connection. Your app is still safe and ready to use.";
  }
  if (error?.code === "missing-api-key") {
    return "Superflow needs its demo API key before it can research this market.";
  }
  if (error?.status === 429) {
    return "Research is temporarily busy. Wait a moment, then try again.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Market research did not return a usable result.";
}

function CitationLinks({ urls, sourceNumbers }) {
  const uniqueUrls = Array.from(new Set((urls || []).map(cleanUrl).filter(Boolean)));
  const citations = uniqueUrls
    .map((url) => ({ url, number: sourceNumbers.get(url) }))
    .filter((citation) => citation.number);
  if (!citations.length) return null;

  return (
    <span className="market-citations" aria-label="Sources">
      {citations.map(({ url, number }) => (
        <a
          href={url}
          key={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source ${number}: ${displayDomain(url)}`}
        >
          [{number}]
        </a>
      ))}
    </span>
  );
}

function EvidenceList({ items, sourceNumbers, emptyCopy, fallbackUrls = [] }) {
  if (!Array.isArray(items) || !items.length) {
    return <p className="market-empty-copy">{emptyCopy}</p>;
  }

  return (
    <ul className="market-evidence-list">
      {items.map((item, index) => {
        const text = typeof item === "string"
          ? item
          : item?.text || item?.claim || item?.summary || String(item || "");
        return (
          <li key={`${text}-${index}`}>
            <span>{text}</span>
            <CitationLinks
              urls={itemSourceUrls(item).length ? itemSourceUrls(item) : fallbackUrls}
              sourceNumbers={sourceNumbers}
            />
          </li>
        );
      })}
    </ul>
  );
}

function MarketProgress({ appName, stageIndex }) {
  return (
    <section className="market-progress" aria-live="polite" aria-busy="true">
      <p className="quiet-label">Opportunity scan</p>
      <h1>Researching {appName || "your app"}.</h1>
      <p className="market-lede">
        Superflow is comparing what exists, where customers are underserved, and whether the numbers hold up.
      </p>
      <div className="market-progress-list">
        {MARKET_STAGES.map((stage, index) => (
          <div
            className={`market-progress-step ${index === stageIndex ? "is-current" : ""} ${index < stageIndex ? "is-past" : ""}`}
            key={stage}
          >
            <span className="market-progress-index">{String(index + 1).padStart(2, "0")}</span>
            <span>{stage}</span>
            {index === stageIndex && <span className="market-progress-pulse" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparatorList({ comparators, sourceNumbers }) {
  return (
    <section className="market-section" aria-labelledby="market-comparators-title">
      <div className="market-section-heading">
        <p className="market-section-number">01</p>
        <h2 id="market-comparators-title">Comparable products</h2>
      </div>

      {comparators.length ? (
        <div className="market-comparator-list">
          {comparators.map((comparator, index) => {
            const canonicalUrl = cleanUrl(comparator.canonicalUrl);
            const citations = itemSourceUrls(comparator);
            return (
              <article className="market-comparator" key={`${comparator.name}-${index}`}>
                <div className="market-comparator-header">
                  <h3>
                    {canonicalUrl ? (
                      <a href={canonicalUrl} target="_blank" rel="noreferrer">
                        {comparator.name || "Comparable product"}
                        <ExternalLinkIcon size={15} />
                      </a>
                    ) : (
                      comparator.name || "Comparable product"
                    )}
                  </h3>
                  <span className="market-comparator-count">{String(index + 1).padStart(2, "0")}</span>
                </div>

                {comparator.whatItDoes && (
                  <p className="market-fact">
                    {comparator.whatItDoes}
                    <CitationLinks urls={citations} sourceNumbers={sourceNumbers} />
                  </p>
                )}
                {comparator.pricingOrPositioning && (
                  <p className="market-pricing">
                    <span>Positioning or price</span>
                    {comparator.pricingOrPositioning}
                    <CitationLinks urls={citations} sourceNumbers={sourceNumbers} />
                  </p>
                )}
                <div className="market-comparator-gap">
                  <p>
                    <span>What appears missing</span>
                    {comparator.apparentGap || "No clear gap was supported by the available evidence."}
                    <CitationLinks urls={citations} sourceNumbers={sourceNumbers} />
                  </p>
                  <p>
                    <span>Your possible response</span>
                    {comparator.productResponse || "Validate a narrower customer need before changing the product."}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="market-unavailable">
          <h3>No meaningful comparators were found.</h3>
          <p>
            That could mean there is an opening, weak demand, or simply not enough public evidence. It is not automatically a positive signal.
          </p>
        </div>
      )}
    </section>
  );
}

function OpportunitySection({ opportunity }) {
  const iterations = Array.isArray(opportunity?.productIterations)
    ? opportunity.productIterations.filter(Boolean).slice(0, 3)
    : [];

  return (
    <section className="market-section" aria-labelledby="market-opportunity-title">
      <div className="market-section-heading">
        <p className="market-section-number">02</p>
        <h2 id="market-opportunity-title">Where this could win</h2>
      </div>

      <dl className="market-definition-list">
        <div>
          <dt>First customer</dt>
          <dd>{opportunity?.firstCustomer || "The first paying customer is not clear from the available evidence."}</dd>
        </div>
        <div>
          <dt>Differentiation</dt>
          <dd>{opportunity?.differentiation || "A defensible difference still needs to be found."}</dd>
        </div>
      </dl>

      <div className="market-iterations">
        <h3>What to change next</h3>
        {iterations.length ? (
          <ol>
            {iterations.map((iteration, index) => (
              <li key={`${iteration}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{iteration}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="market-empty-copy">No product iteration is justified yet.</p>
        )}
      </div>
    </section>
  );
}

function MarketEstimate({ estimate, sourceNumbers }) {
  const low = formatMoney(estimate?.lowAnnualRevenue, estimate?.currency);
  const high = formatMoney(estimate?.highAnnualRevenue, estimate?.currency);

  return (
    <section className="market-section" aria-labelledby="market-estimate-title">
      <div className="market-section-heading">
        <p className="market-section-number">03</p>
        <h2 id="market-estimate-title">Market opportunity</h2>
      </div>

      {estimate && low && high ? (
        <div className="market-estimate">
          <p className="market-estimate-label">Directional annual opportunity</p>
          <p className="market-estimate-range">{low}–{high}</p>
          {estimate.calculation && (
            <p className="market-estimate-calculation">
              {estimate.calculation}
              <CitationLinks urls={itemSourceUrls(estimate)} sourceNumbers={sourceNumbers} />
            </p>
          )}
          {Array.isArray(estimate.assumptions) && estimate.assumptions.length > 0 && (
            <div className="market-assumptions">
              <p>Assumptions</p>
              <ul>
                {estimate.assumptions.map((assumption, index) => (
                  <li key={`${assumption}-${index}`}>{assumption}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="market-estimate-footnote">
            <span>{estimate.confidence ? `${estimate.confidence} confidence` : "Directional estimate"}</span>
            {estimate.caveat && <p>{estimate.caveat}</p>}
          </div>
        </div>
      ) : (
        <div className="market-unavailable">
          <h3>A responsible estimate is not available.</h3>
          <p>The public evidence does not support a useful customer-count and price range yet.</p>
        </div>
      )}
    </section>
  );
}

function DecisionSection({ opportunity }) {
  return (
    <section className="market-section market-decision" aria-labelledby="market-next-title">
      <div className="market-section-heading">
        <p className="market-section-number">04</p>
        <h2 id="market-next-title">What matters next</h2>
      </div>
      <dl className="market-definition-list">
        <div>
          <dt>Largest uncertainty</dt>
          <dd>{opportunity?.largestUncertainty || "Whether the intended customer experiences this problem strongly enough to pay."}</dd>
        </div>
        <div>
          <dt>Best validation move</dt>
          <dd>{opportunity?.nextValidationMove || "Talk to a small set of likely users before investing further."}</dd>
        </div>
      </dl>
    </section>
  );
}

function SourceDrawer({ sources }) {
  return (
    <div className="market-source-list">
      {sources.map((source, index) => (
        <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
          <span className="market-source-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="market-source-copy">
            <strong>{source.title || displayDomain(source.url)}</strong>
            <span>{displayDomain(source.url)}</span>
          </span>
          <ExternalLinkIcon size={16} />
        </a>
      ))}
    </div>
  );
}

export default function MarketPane({ snapshot, onBack, isOnline = true }) {
  const [status, setStatus] = useState("restoring");
  const [mission, setMission] = useState(null);
  const [error, setError] = useState(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [followUp, setFollowUp] = useState(null);
  const [followUpError, setFollowUpError] = useState("");
  const startedFingerprintRef = useRef("");

  const fingerprint = useMemo(() => {
    if (!snapshot) return "";
    try {
      return fingerprintProjectSnapshot(snapshot);
    } catch {
      return snapshot.appId || "invalid-snapshot";
    }
  }, [snapshot]);

  const runResearch = useCallback(async ({ ignoreSaved = false } = {}) => {
    if (!snapshot) {
      setStatus("error");
      setError(new Error("Superflow could not read enough of the app to research it."));
      return;
    }

    setError(null);
    setFollowUp(null);
    setFollowUpError("");
    setWhyOpen(false);
    setSourcesOpen(false);
    setStageIndex(0);

    if (!ignoreSaved) {
      try {
        const saved = loadMarketMission(snapshot);
        if (saved) {
          setMission(normalizeMission(saved));
          setStatus("ready");
          return;
        }
      } catch {
        // A stale saved mission should never prevent a fresh private scan.
      }
    }

    if (!isOnline) {
      setStatus("error");
      setError(Object.assign(new Error("Offline"), { code: "offline" }));
      return;
    }

    setMission(null);
    setStatus("researching");
    try {
      const response = normalizeMission(await researchMarket(snapshot));
      saveMarketMission(snapshot, response);
      setMission(response);
      setStatus("ready");
    } catch (researchError) {
      setStatus("error");
      setError(researchError);
    }
  }, [isOnline, snapshot]);

  useEffect(() => {
    if (!fingerprint || startedFingerprintRef.current === fingerprint) return;
    startedFingerprintRef.current = fingerprint;
    void runResearch();
  }, [fingerprint, runResearch]);

  useEffect(() => {
    if (status !== "researching") return undefined;
    const interval = window.setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, MARKET_STAGES.length - 1));
    }, 2200);
    return () => window.clearInterval(interval);
  }, [status]);

  const sources = useMemo(() => collectSourceCatalog(mission), [mission]);
  const sourceNumbers = useMemo(
    () => new Map(sources.map((source, index) => [source.url, index + 1])),
    [sources],
  );

  const submitFollowUp = async (event) => {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || !mission?.result || status === "asking") return;
    if (!isOnline) {
      setFollowUpError("A connection is needed to ask another question.");
      return;
    }

    setStatus("asking");
    setFollowUpError("");
    try {
      const response = await askMarketQuestion({
        snapshot,
        result: mission.result,
        question: cleanQuestion,
      });
      if (!response?.text?.trim()) throw new Error("No answer was returned.");
      setFollowUp({
        question: cleanQuestion,
        text: response.text.trim(),
        sources: Array.isArray(response.sources) ? response.sources.map(sourceRecord).filter(Boolean) : [],
      });
      setQuestion("");
    } catch (followUpRequestError) {
      setFollowUpError(errorCopy(followUpRequestError, isOnline));
    } finally {
      setStatus("ready");
    }
  };

  const result = mission?.result;
  const verdict = result ? VERDICT_COPY[result.verdict] : null;
  const confidence = result?.justification?.confidence;
  const appName = snapshot?.appName || "your app";

  return (
    <section className="market-pane" aria-busy={status === "researching" || status === "asking"}>
      <header className="market-pane-header">
        <button type="button" className="market-back-button" onClick={onBack}>
          <BackIcon size={18} />
          <span>Back to app</span>
        </button>
        <span className="market-pane-name">Opportunities</span>
      </header>

      {(status === "restoring" || status === "researching") && (
        <MarketProgress appName={appName} stageIndex={stageIndex} />
      )}

      {status === "error" && (
        <section className="market-error" role="alert">
          <p className="quiet-label">Research paused</p>
          <h1>The market scan did not finish.</h1>
          <p>{errorCopy(error, isOnline)}</p>
          <div className="market-error-actions">
            <button type="button" className="primary-action compact" onClick={() => runResearch({ ignoreSaved: true })}>
              <RetryIcon size={18} />
              Retry research
            </button>
            <button type="button" className="text-action" onClick={onBack}>Back to app</button>
          </div>
        </section>
      )}

      {result && (status === "ready" || status === "asking") && (
        <article className="market-report">
          <header className="market-verdict">
            <p className="market-verdict-label">
              {verdict.label}
              {confidence ? <span> · {confidence} confidence</span> : null}
            </p>
            <h1>{verdict.headline}</h1>
            <p className="market-verdict-summary">
              {result.verdictSummary}
              <CitationLinks urls={itemSourceUrls(result.justification)} sourceNumbers={sourceNumbers} />
            </p>

            <div className="market-disclosure-actions">
              <button
                type="button"
                className="market-disclosure-button"
                aria-expanded={whyOpen}
                aria-controls="market-justification"
                onClick={() => setWhyOpen((open) => !open)}
              >
                Why this recommendation?
                <ChevronIcon className={whyOpen ? "is-open" : ""} size={17} />
              </button>
              <button
                type="button"
                className="market-disclosure-button"
                aria-expanded={sourcesOpen}
                aria-controls="market-sources"
                onClick={() => setSourcesOpen((open) => !open)}
                disabled={!sources.length}
              >
                Show sources{sources.length ? ` (${sources.length})` : ""}
                <ChevronIcon className={sourcesOpen ? "is-open" : ""} size={17} />
              </button>
            </div>

            {whyOpen && (
              <section className="market-disclosure" id="market-justification">
                <div>
                  <h2>Evidence for</h2>
                  <EvidenceList
                    items={result.justification?.supportingEvidence}
                    sourceNumbers={sourceNumbers}
                    fallbackUrls={itemSourceUrls(result.justification)}
                    emptyCopy="No supporting evidence was strong enough to list."
                  />
                </div>
                <div>
                  <h2>Evidence against</h2>
                  <EvidenceList
                    items={result.justification?.contradictingEvidence}
                    sourceNumbers={sourceNumbers}
                    fallbackUrls={itemSourceUrls(result.justification)}
                    emptyCopy="No clear contradictory evidence was found."
                  />
                </div>
                <div>
                  <h2>Still assumed</h2>
                  <EvidenceList
                    items={result.justification?.assumptions}
                    sourceNumbers={sourceNumbers}
                    emptyCopy="No additional assumptions were returned."
                  />
                </div>
              </section>
            )}

            {sourcesOpen && (
              <section className="market-disclosure" id="market-sources">
                <h2>Sources consulted</h2>
                <SourceDrawer sources={sources} />
              </section>
            )}
          </header>

          {/* ponytail: sticky jump-nav for quick section access — upgrade to IntersectionObserver highlight if scroll-spy needed */}
          <nav className="market-section-nav" aria-label="Jump to section">
            {[
              { id: "market-comparators-title", label: "01 Comparables" },
              { id: "market-opportunity-title", label: "02 Opportunity" },
              { id: "market-estimate-title", label: "03 Estimate" },
              { id: "market-next-title", label: "04 Next" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="market-section-nav-item"
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {label}
              </button>
            ))}
          </nav>

          <ComparatorList comparators={result.comparators} sourceNumbers={sourceNumbers} />
          <OpportunitySection opportunity={result.opportunity} />
          <MarketEstimate estimate={result.marketOpportunity} sourceNumbers={sourceNumbers} />
          <DecisionSection opportunity={result.opportunity} />

          <section className="market-follow-up" aria-labelledby="market-follow-up-title">
            <p className="quiet-label">Discuss the result</p>
            <h2 id="market-follow-up-title">Ask about this research.</h2>
            <p>Superflow will use the compact result above and only search again when your question needs fresh evidence.</p>

            {followUp && (
              <div className="market-follow-up-answer" aria-live="polite">
                <p className="market-follow-up-question">{followUp.question}</p>
                <p>{followUp.text}</p>
                {followUp.sources.length > 0 && (
                  <div className="market-follow-up-sources">
                    {followUp.sources.map((source) => (
                      <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                        {displayDomain(source.url)}
                        <ExternalLinkIcon size={14} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form className="market-follow-up-form" onSubmit={submitFollowUp}>
              <label htmlFor="market-follow-up-question">Your question</label>
              <div>
                <textarea
                  id="market-follow-up-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows="2"
                  placeholder="What would make this more defensible?"
                  disabled={status === "asking" || !isOnline}
                />
                <button
                  type="submit"
                  className="market-follow-up-submit"
                  disabled={!question.trim() || status === "asking" || !isOnline}
                  aria-label="Ask this question"
                >
                  <ArrowIcon size={18} />
                </button>
              </div>
            </form>
            {status === "asking" && <p className="market-follow-up-status" role="status">Looking into that…</p>}
            {followUpError && <p className="inline-error" role="alert">{followUpError}</p>}
          </section>
        </article>
      )}
    </section>
  );
}
