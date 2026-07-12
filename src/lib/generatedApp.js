export const GENERATED_APP_SOFT_LIMIT_BYTES = 16 * 1024;
export const GENERATED_APP_HARD_LIMIT_BYTES = 32 * 1024;

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FORBIDDEN_TAG_PATTERN = /<\s*(base|iframe|frame|object|embed|portal)\b/i;
const INLINE_HANDLER_PATTERN = /\s(on[a-z]+)\s*=/i;

function success(value, warnings = []) {
  return { ok: true, value, warnings };
}

function failure(errors) {
  return { ok: false, errors: [...new Set(errors.filter(Boolean))] };
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function documentHtml(doc) {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function extractTagBodies(html, tagName) {
  const bodies = [];
  const expression = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match;
  while ((match = expression.exec(html))) bodies.push(match[1]);
  return bodies;
}

function collectAttributeValues(html, attribute) {
  const values = [];
  const expression = new RegExp(`\\s${attribute}\\s*=\\s*(["'])(.*?)\\1`, "gi");
  let match;
  while ((match = expression.exec(html))) values.push(match[2]);
  return values;
}

function hasUnsafeUrl(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.startsWith("#")) return false;
  return !(normalized.startsWith("data:") || normalized.startsWith("blob:"));
}

function validateJavaScript(source, errors, label) {
  const forbiddenPatterns = [
    [/\bfetch\s*\(/i, "network requests"],
    [/\bXMLHttpRequest\b/i, "XMLHttpRequest"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\bEventSource\b/i, "EventSource"],
    [/\bsendBeacon\b/i, "sendBeacon"],
    [/\b(localStorage|sessionStorage|indexedDB)\b/i, "direct browser storage"],
    [/document\s*\.\s*cookie/i, "cookies"],
    [/\b(eval|Function)\s*\(/i, "dynamic code execution"],
    [/document\s*\.\s*(write|writeln)\s*\(/i, "document.write"],
    [/\b(window\s*\.\s*)?(parent|top|opener)\b/i, "parent-frame access"],
    [/\bwindow\s*\.\s*open\s*\(/i, "popups"],
    [/\b(location\s*=|location\s*\.|history\s*\.)/i, "navigation"],
    [/\b(Worker|SharedWorker)\s*\(/i, "workers"],
    [/navigator\s*\.\s*serviceWorker/i, "service workers"],
    [/\bimport\s*\(/i, "dynamic imports"],
  ];

  forbiddenPatterns.forEach(([pattern, description]) => {
    if (pattern.test(source)) errors.push(`${label} uses prohibited ${description}.`);
  });

  try {
    // Compile without executing. Generated behavior regions are classic scripts.
    new Function(source);
  } catch (error) {
    errors.push(`${label} has invalid JavaScript: ${error.message}`);
  }
}

function validateCss(source, errors, label) {
  if (/@import\b/i.test(source)) errors.push(`${label} may not import CSS.`);
  const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  let match;
  while ((match = urlPattern.exec(source))) {
    if (hasUnsafeUrl(match[2])) errors.push(`${label} contains an external CSS URL.`);
  }
}

function validateWithSource(html, errors) {
  if (!/^\s*<!doctype\s+html\s*>/i.test(html)) errors.push("A complete HTML doctype is required.");
  if (!/<html\b/i.test(html) || !/<head\b/i.test(html) || !/<body\b/i.test(html)) {
    errors.push("The response must contain html, head, and body elements.");
  }
  if (FORBIDDEN_TAG_PATTERN.test(html)) errors.push("Nested frames, base tags, objects, embeds, and portals are prohibited.");
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html)) errors.push("Meta refresh is prohibited.");
  if (INLINE_HANDLER_PATTERN.test(html)) errors.push("Inline event-handler attributes are prohibited.");
  if (/<script\b[^>]*\ssrc\s*=/i.test(html)) errors.push("External scripts are prohibited.");
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) errors.push("External stylesheets are prohibited.");

  for (const attribute of ["src", "href", "action", "formaction", "poster", "xlink:href"]) {
    collectAttributeValues(html, attribute).forEach((value) => {
      if (hasUnsafeUrl(value)) errors.push(`External ${attribute} URLs are prohibited.`);
    });
  }
  collectAttributeValues(html, "srcset").forEach((value) => {
    if (value.split(",").some((entry) => hasUnsafeUrl(entry.trim().split(/\s+/)[0]))) {
      errors.push("External srcset URLs are prohibited.");
    }
  });

  extractTagBodies(html, "style").forEach((source, index) =>
    validateCss(source, errors, `Style region ${index + 1}`));
  extractTagBodies(html, "script").forEach((source, index) =>
    validateJavaScript(source, errors, `Behavior region ${index + 1}`));
}

function validateNamesFromSource(html, errors) {
  const componentNames = collectAttributeValues(html, "data-component");
  if (!componentNames.length) errors.push("At least one editable data-component is required.");
  const componentSet = new Set();
  componentNames.forEach((name) => {
    if (!NAME_PATTERN.test(name)) errors.push(`Component name "${name}" is invalid.`);
    if (componentSet.has(name)) errors.push(`Component name "${name}" is duplicated.`);
    componentSet.add(name);
  });

  const styleNames = collectAttributeValues(html, "data-style-region");
  const behaviorNames = collectAttributeValues(html, "data-behavior-region");
  if (!styleNames.includes("app")) errors.push('style[data-style-region="app"] is required.');
  if (!behaviorNames.includes("app")) errors.push('script[data-behavior-region="app"] is required.');

  for (const [type, names] of [["Style", styleNames], ["Behavior", behaviorNames]]) {
    const seen = new Set();
    names.forEach((name) => {
      if (!NAME_PATTERN.test(name)) errors.push(`${type} region "${name}" is invalid.`);
      if (seen.has(name)) errors.push(`${type} region "${name}" is duplicated.`);
      seen.add(name);
      if (name !== "app" && !componentSet.has(name)) {
        errors.push(`${type} region "${name}" has no matching component.`);
      }
    });
  }
}

function validateWithDom(html, errors, { appId, requireAppId }) {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const roots = doc.querySelectorAll("[data-app-root]");
  if (roots.length !== 1) errors.push("Exactly one data-app-root is required.");

  const rootId = roots[0]?.getAttribute("data-app-id");
  if (requireAppId && !APP_ID_PATTERN.test(rootId || "")) errors.push("A valid parent-minted app ID is required.");
  if (appId && rootId && rootId !== appId) errors.push("The app ID may not change.");

  doc.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) errors.push("Inline event-handler attributes are prohibited.");
      if (["src", "href", "action", "formaction", "poster", "xlink:href"].includes(attribute.name.toLowerCase())) {
        if (hasUnsafeUrl(attribute.value)) errors.push(`External ${attribute.name} URLs are prohibited.`);
      }
      if (attribute.name.toLowerCase() === "style") validateCss(attribute.value, errors, "Inline style");
    });
  });

  return doc;
}

export function parseGeneratedAppResponse(text, { finishReason } = {}) {
  const errors = [];
  if (finishReason === "length") errors.push("The generated response was truncated.");
  if (typeof text !== "string" || !text.trim()) errors.push("The generated response was empty.");
  if (errors.length) return failure(errors);

  const trimmed = text.trim();
  // ponytail: tolerate leading/trailing prose the model sometimes adds around the fence
  const match = trimmed.match(/```html:app[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  if (!match) return failure(["Return exactly one html:app fenced block with no surrounding prose."]);

  const html = match[1].trim();
  const size = byteLength(html);
  if (size > GENERATED_APP_HARD_LIMIT_BYTES) {
    return failure([`The generated app is ${size} bytes; the hard limit is ${GENERATED_APP_HARD_LIMIT_BYTES}.`]);
  }
  return success(
    { html, byteLength: size },
    size > GENERATED_APP_SOFT_LIMIT_BYTES ? ["The generated app exceeds the 16KB target."] : [],
  );
}

export function validateGeneratedApp(html, { appId = null, requireAppId = false } = {}) {
  const errors = [];
  if (typeof html !== "string" || !html.trim()) return failure(["App HTML is empty."]);
  if (byteLength(html) > GENERATED_APP_HARD_LIMIT_BYTES) errors.push("The app exceeds the 32KB hard limit.");

  validateWithSource(html, errors);
  validateNamesFromSource(html, errors);
  const doc = validateWithDom(html, errors, { appId, requireAppId });

  const rootCount = (html.match(/\bdata-app-root(?:\s*=|\s|>)/gi) || []).length;
  if (!doc && rootCount !== 1) errors.push("Exactly one data-app-root is required.");
  if (errors.length) return failure(errors);
  return success({ html, appId: appId || null, document: doc });
}

export function mintAppId() {
  const random = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `app-${random.slice(0, 32)}`;
}

export function prepareGeneratedApp(html, { appId = mintAppId() } = {}) {
  if (!APP_ID_PATTERN.test(appId)) return failure(["The parent app ID is invalid."]);
  try {
    let prepared = html;
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const roots = doc.querySelectorAll("[data-app-root]");
      if (roots.length !== 1) return failure(["Exactly one data-app-root is required."]);
      doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach((element) => element.remove());
      roots[0].setAttribute("data-app-id", appId);
      prepared = documentHtml(doc);
    } else {
      const rootPattern = /(<[A-Za-z][^>]*\sdata-app-root(?:\s*=\s*(["']).*?\2)?)([^>]*>)/i;
      if (!rootPattern.test(prepared)) return failure(["Exactly one data-app-root is required."]);
      prepared = prepared.replace(rootPattern, (full, start, _quote, end) => {
        const withoutId = `${start}${end}`.replace(/\sdata-app-id\s*=\s*(["']).*?\1/i, "");
        return withoutId.replace(/>$/, ` data-app-id="${appId}">`);
      });
    }

    const validated = validateGeneratedApp(prepared, { appId, requireAppId: true });
    if (!validated.ok) return validated;
    return success({ html: prepared, appId }, validated.warnings);
  } catch (error) {
    return failure([error instanceof Error ? error.message : String(error)]);
  }
}

export function parsePatchResponse(text, { finishReason } = {}) {
  const errors = [];
  if (finishReason === "length") errors.push("The patch response was truncated.");
  if (typeof text !== "string" || !text.trim()) errors.push("The patch response was empty.");
  if (errors.length) return failure(errors);

  const blocks = [];
  const expression = /```(html|css|js):([A-Za-z][A-Za-z0-9_-]{0,63})[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
  let cursor = 0;
  let match;
  while ((match = expression.exec(text))) {
    if (text.slice(cursor, match.index).trim()) errors.push("Patch responses may not include prose outside fenced blocks.");
    blocks.push({ type: match[1], name: match[2], content: match[3].trim() });
    cursor = expression.lastIndex;
  }
  if (text.slice(cursor).trim()) errors.push("Patch responses may not include prose outside fenced blocks.");
  if (!blocks.length) errors.push("At least one patch block is required.");

  const seen = new Set();
  blocks.forEach((block) => {
    const key = `${block.type}:${block.name}`;
    if (seen.has(key)) errors.push(`Patch block ${key} is duplicated.`);
    seen.add(key);
  });
  if (errors.length) return failure(errors);

  const value = { html: {}, css: {}, js: {}, blocks };
  blocks.forEach((block) => {
    value[block.type][block.name] = block.content;
  });
  return success(value);
}

export function applyGeneratedAppPatches(currentHtml, patches, { appId } = {}) {
  if (typeof DOMParser === "undefined") return failure(["Applying patches requires a browser DOMParser."]);
  try {
    const doc = new DOMParser().parseFromString(currentHtml, "text/html");
    const htmlPatches = Object.entries(patches?.html || {});
    const targets = [];

    for (const [name] of htmlPatches) {
      const target = doc.querySelector(`[data-component="${name}"]`);
      if (!target) return failure([`Component "${name}" does not exist.`]);
      targets.push({ name, target });
    }

    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        if (targets[left].target.contains(targets[right].target) || targets[right].target.contains(targets[left].target)) {
          return failure(["A patch may not replace both an ancestor and its descendant."]);
        }
      }
    }

    for (const { name, target } of targets) {
      const fragment = new DOMParser().parseFromString(patches.html[name], "text/html");
      const replacement = fragment.querySelector(`[data-component="${name}"]`);
      if (!replacement) return failure([`HTML patch "${name}" must preserve its outer component identifier.`]);
      target.replaceWith(doc.importNode(replacement, true));
    }

    for (const [name, css] of Object.entries(patches?.css || {})) {
      const region = doc.querySelector(`style[data-style-region="${name}"]`);
      if (!region) return failure([`Style region "${name}" does not exist.`]);
      region.textContent = css;
    }

    for (const [name, javascript] of Object.entries(patches?.js || {})) {
      const region = doc.querySelector(`script[data-behavior-region="${name}"]`);
      if (!region) return failure([`Behavior region "${name}" does not exist.`]);
      region.textContent = javascript;
    }

    const root = doc.querySelector("[data-app-root]");
    const preservedId = appId || root?.getAttribute("data-app-id");
    if (root && preservedId) root.setAttribute("data-app-id", preservedId);
    const nextHtml = documentHtml(doc);
    const validated = validateGeneratedApp(nextHtml, {
      appId: preservedId || null,
      requireAppId: Boolean(preservedId),
    });
    if (!validated.ok) return validated;
    return success({ html: nextHtml, appId: preservedId || null });
  } catch (error) {
    return failure([error instanceof Error ? error.message : String(error)]);
  }
}
