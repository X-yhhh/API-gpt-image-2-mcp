import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

import { loadRuntimeConfig, resolveImageDataRoot } from "./runtime-config.mjs";

const IMAGE_DATA_ROOT = resolveImageDataRoot();
const DEFAULT_PROJECT_NAME = "default-project";
const DEFAULT_OUTPUT_DIR = path.join(IMAGE_DATA_ROOT, DEFAULT_PROJECT_NAME);
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_HEARTBEAT_MS = 5000;
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 15000;
const MAX_REMOTE_REDIRECTS = 3;

const STDIO_TRANSPORT_POLICY = Object.freeze({
  name: "stdio",
  allowDataUrls: true,
  allowRemoteUrls: true,
  allowLocalPaths: true,
  allowOutputDir: true,
  requirePublicRemoteUrls: true
});

const HTTP_TRANSPORT_POLICY = Object.freeze({
  name: "http",
  allowDataUrls: true,
  allowRemoteUrls: true,
  allowLocalPaths: false,
  allowOutputDir: false,
  requirePublicRemoteUrls: true
});

function sanitizeFilePart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function sanitizeProjectPart(value) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || DEFAULT_PROJECT_NAME;
}

function pickExtension(format) {
  switch ((format || "png").toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    default:
      return "png";
  }
}

function pickMimeType(fileName, fallback = "image/png") {
  const ext = path.extname(fileName || "").toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
      return "image/png";
    default:
      return fallback;
  }
}

function extensionFromMimeType(mimeType, fallback = "png") {
  switch ((mimeType || "").toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    default:
      return fallback;
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function randomBaseName() {
  return `img-${timestampSlug()}-${crypto.randomBytes(4).toString("hex")}`;
}

function inferProjectName(explicitProjectName) {
  const candidates = [
    explicitProjectName,
    process.env.INIT_CWD,
    process.env.PWD,
    process.cwd()
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") {
      continue;
    }

    const parsed = candidate.includes(path.sep) ? path.basename(candidate) : candidate;
    const normalized = sanitizeProjectPart(parsed);

    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_PROJECT_NAME;
}

function resolveOutputDirectory({ outputDir, projectName }) {
  if (outputDir) {
    return path.resolve(outputDir);
  }

  return path.join(IMAGE_DATA_ROOT, inferProjectName(projectName));
}

function inferOutputPath({ outputDir, projectName, filename, prompt, format }) {
  const extension = pickExtension(format);
  const outputDirectory = resolveOutputDirectory({ outputDir, projectName });
  const baseName = filename
    ? sanitizeFilePart(filename.replace(/\.[^.]+$/, ""))
    : randomBaseName();
  return path.join(outputDirectory, `${baseName}.${extension}`);
}

function normalizeSize(size) {
  if (!size) {
    return "auto";
  }

  if (typeof size !== "string") {
    throw new Error("size must be a string like 1024x1024.");
  }

  const trimmed = size.trim().toLowerCase();

  if (trimmed === "auto") {
    return "auto";
  }

  const match = trimmed.match(/^(\d+)\s*(?:x|×|\*)\s*(\d+)$/);

  if (!match) {
    throw new Error(`Invalid size "${size}". Use formats like 1024x1024, 1024 * 1024, or auto.`);
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid size "${size}". Width and height must be numbers.`);
  }

  if (width < 1 || height < 1) {
    throw new Error(`Invalid size "${size}". Width and height must be positive integers.`);
  }

  return `${width}x${height}`;
}

function applyLatencyMode({ latencyMode, quality, outputFormat, size }) {
  switch (latencyMode) {
    case "fast":
      return {
        quality: quality || "low",
        outputFormat: outputFormat || "jpeg",
        size: size || "1024x1024"
      };
    case "quality":
      return {
        quality: quality || "high",
        outputFormat: outputFormat || "png",
        size
      };
    default:
      return {
        quality: quality || "high",
        outputFormat: outputFormat || "png",
        size
      };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isDataUrl(value) {
  return /^data:/i.test(value);
}

function classifyImageSource(value) {
  if (!value || typeof value !== "string") {
    throw new Error("Reference image entries must be strings.");
  }

  if (isDataUrl(value)) {
    return { type: "data" };
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return { type: "local" };
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return { type: "remote", url };
  }

  return { type: "local" };
}

function normalizeTransportPolicy(policy = STDIO_TRANSPORT_POLICY) {
  return {
    ...STDIO_TRANSPORT_POLICY,
    ...policy
  };
}

function parseDataUrl(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Invalid data URL for reference images.");
  }

  const header = dataUrl.slice("data:".length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const [firstSegment = "", ...restSegments] = header.split(";");
  const metadataSegments = [...restSegments];
  const normalizedFirstSegment = firstSegment.toLowerCase();

  let mimeType = "application/octet-stream";

  if (firstSegment && normalizedFirstSegment !== "base64" && !firstSegment.includes("=")) {
    mimeType = firstSegment;
  } else if (firstSegment) {
    metadataSegments.unshift(firstSegment);
  }

  const isBase64 = metadataSegments.some((segment) => segment.toLowerCase() === "base64");

  if (!isBase64) {
    throw new Error("Only base64-encoded data URLs are supported for reference images.");
  }

  return {
    mimeType,
    buffer: Buffer.from(payload, "base64")
  };
}

function isPublicIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;

  if (first === 0 || first === 10 || first === 127 || first >= 224) {
    return false;
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return false;
  }

  if (first === 169 && second === 254) {
    return false;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }

  if (first === 192 && second === 168) {
    return false;
  }

  if (first === 192 && second === 0) {
    return false;
  }

  if (first === 198 && (second === 18 || second === 19)) {
    return false;
  }

  if (first === 198 && second === 51 && parts[2] === 100) {
    return false;
  }

  if (first === 203 && second === 0 && parts[2] === 113) {
    return false;
  }

  return true;
}

function parseIpv4Octets(address) {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const value = Number(part);

    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }

    octets.push(value);
  }

  return octets;
}

function normalizeIpv6Segments(segments) {
  if (segments.length === 0) {
    return [];
  }

  const normalized = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.includes(".")) {
      if (index !== segments.length - 1) {
        return null;
      }

      const octets = parseIpv4Octets(segment);

      if (!octets) {
        return null;
      }

      normalized.push(((octets[0] << 8) | octets[1]).toString(16));
      normalized.push(((octets[2] << 8) | octets[3]).toString(16));
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(segment)) {
      return null;
    }

    normalized.push(segment);
  }

  return normalized;
}

function parseIpv6Bytes(address) {
  if (typeof address !== "string") {
    return null;
  }

  const normalizedAddress = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];

  if (normalizedAddress.length === 0) {
    return null;
  }

  const doubleColonParts = normalizedAddress.split("::");

  if (doubleColonParts.length > 2) {
    return null;
  }

  const headSegments = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
  const tailSegments = doubleColonParts.length === 2 && doubleColonParts[1] ? doubleColonParts[1].split(":") : [];

  if (headSegments.some((segment) => segment.length === 0) || tailSegments.some((segment) => segment.length === 0)) {
    return null;
  }

  const normalizedHead = normalizeIpv6Segments(headSegments);
  const normalizedTail = normalizeIpv6Segments(tailSegments);

  if (!normalizedHead || !normalizedTail) {
    return null;
  }

  const explicitSegments = normalizedHead.length + normalizedTail.length;

  if (doubleColonParts.length === 1 && explicitSegments !== 8) {
    return null;
  }

  if (doubleColonParts.length === 2 && explicitSegments >= 8) {
    return null;
  }

  const segments = doubleColonParts.length === 2
    ? [
        ...normalizedHead,
        ...Array(8 - explicitSegments).fill("0"),
        ...normalizedTail
      ]
    : normalizedHead;

  if (segments.length !== 8) {
    return null;
  }

  const bytes = [];

  for (const segment of segments) {
    const value = Number.parseInt(segment, 16);

    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      return null;
    }

    bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  return bytes;
}

function isEmbeddedIpv4(bytes, prefixBytes) {
  return bytes.slice(0, prefixBytes).every((byte) => byte === 0);
}

function isPublicIpv6(address) {
  const bytes = parseIpv6Bytes(address);

  if (!bytes || bytes.length !== 16) {
    return false;
  }

  if (bytes.every((byte) => byte === 0)) {
    return false;
  }

  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return false;
  }

  if (bytes[0] === 0xff) {
    return false;
  }

  if ((bytes[0] & 0xfe) === 0xfc) {
    return false;
  }

  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return false;
  }

  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false;
  }

  if (isEmbeddedIpv4(bytes, 12)) {
    const ipv4Address = bytes.slice(12).join(".");
    return isPublicIpv4(ipv4Address);
  }

  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    const ipv4Address = bytes.slice(12).join(".");
    return isPublicIpv4(ipv4Address);
  }

  return true;
}

function isPublicIpAddress(address) {
  const version = net.isIP(address);

  if (version === 4) {
    return isPublicIpv4(address);
  }

  if (version === 6) {
    return isPublicIpv6(address);
  }

  return false;
}

async function assertPublicRemoteUrl(url, resolveHostname = dns.lookup) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Remote image URLs must use http or https.");
  }

  if (url.username || url.password) {
    throw new Error("Remote image URLs must not include usernames or passwords.");
  }

  const hostname = url.hostname.toLowerCase();
  const hostnameForIpCheck = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "localhost.localdomain") {
    throw new Error("Remote image URL host must resolve to a public address.");
  }

  const literalIpVersion = net.isIP(hostnameForIpCheck);
  const addresses = literalIpVersion
    ? [{ address: hostnameForIpCheck, family: literalIpVersion }]
    : await resolveHostname(url.hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Remote image URL host must resolve to public addresses only.");
  }
}

async function downloadRemoteImage(imageSource, { transportPolicy, resolveHostname }) {
  let url = new URL(imageSource);

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    if (transportPolicy.requirePublicRemoteUrls) {
      await assertPublicRemoteUrl(url, resolveHostname);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Remote image download timed out.")), REMOTE_IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(url, { redirect: "manual", signal: controller.signal });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw new Error(`Remote image redirect missing Location header: ${url.toString()}`);
        }

        if (redirectCount === MAX_REMOTE_REDIRECTS) {
          throw new Error(`Remote image download exceeded ${MAX_REMOTE_REDIRECTS} redirects.`);
        }

        url = new URL(location, url);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to download reference image: ${url.toString()} (${response.status})`);
      }

      const contentLength = Number(response.headers.get("content-length"));

      if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error(`Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES} byte download limit.`);
      }

      const reader = response.body?.getReader();
      const chunks = [];
      let totalBytes = 0;

      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        totalBytes = arrayBuffer.byteLength;

        if (totalBytes > MAX_REMOTE_IMAGE_BYTES) {
          throw new Error(`Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES} byte download limit.`);
        }

        chunks.push(Buffer.from(arrayBuffer));
      } else {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          totalBytes += value.byteLength;

          if (totalBytes > MAX_REMOTE_IMAGE_BYTES) {
            await reader.cancel();
            throw new Error(`Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES} byte download limit.`);
          }

          chunks.push(Buffer.from(value));
        }
      }

      const fileName = path.basename(url.pathname) || `reference-${crypto.randomBytes(3).toString("hex")}.png`;
      const mimeType = response.headers.get("content-type") || pickMimeType(fileName);

      return {
        fileName,
        mimeType,
        buffer: Buffer.concat(chunks, totalBytes)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Remote image download exceeded ${MAX_REMOTE_REDIRECTS} redirects.`);
}

async function loadImageSource(imageSource, { transportPolicy, resolveHostname } = {}) {
  const source = classifyImageSource(imageSource);

  if (source.type === "data") {
    if (!transportPolicy.allowDataUrls) {
      throw new Error(`${transportPolicy.name} transport does not accept data URL image sources.`);
    }

    const { mimeType, buffer } = parseDataUrl(imageSource);
    return {
      fileName: `reference-${crypto.randomBytes(3).toString("hex")}.${extensionFromMimeType(mimeType)}`,
      mimeType,
      buffer
    };
  }

  if (source.type === "remote") {
    if (!transportPolicy.allowRemoteUrls) {
      throw new Error(`${transportPolicy.name} transport does not accept remote URL image sources.`);
    }

    return downloadRemoteImage(imageSource, { transportPolicy, resolveHostname });
  }

  if (!transportPolicy.allowLocalPaths) {
    throw new Error(`${transportPolicy.name} transport does not accept local file path image sources. Use a data URL or public http/https URL instead.`);
  }

  const absolutePath = path.resolve(imageSource);
  const buffer = await fs.readFile(absolutePath);
  const fileName = path.basename(absolutePath);

  return {
    fileName,
    mimeType: pickMimeType(fileName),
    buffer
  };
}

async function buildEditsFormData({
  model,
  prompt,
  referenceImages,
  maskImage,
  size,
  quality,
  background,
  outputFormat,
  outputCompression,
  transportPolicy,
  resolveHostname
}) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);

  if (size && size !== "auto") {
    form.set("size", size);
  }

  if (quality && quality !== "auto") {
    form.set("quality", quality);
  }

  if (background && background !== "auto") {
    form.set("background", background);
  }

  if (outputFormat) {
    form.set("output_format", outputFormat);
  }

  if (typeof outputCompression === "number") {
    form.set("output_compression", String(outputCompression));
  }

  for (const referenceImage of referenceImages || []) {
    const loaded = await loadImageSource(referenceImage, { transportPolicy, resolveHostname });
    const file = new File([loaded.buffer], loaded.fileName, { type: loaded.mimeType });
    form.append("image[]", file);
  }

  if (maskImage) {
    const loadedMask = await loadImageSource(maskImage, { transportPolicy, resolveHostname });
    const file = new File([loadedMask.buffer], loadedMask.fileName, { type: loadedMask.mimeType });
    form.set("mask", file);
  }

  return form;
}

async function performJsonRequest({ url, method, headers, body, timeoutMs, retryCount, onHeartbeat }) {
  let attempt = 0;
  let lastError;

  while (attempt <= retryCount) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
    const heartbeat = onHeartbeat
      ? setInterval(() => {
          onHeartbeat(attempt + 1);
        }, DEFAULT_HEARTBEAT_MS)
      : null;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      const responseText = await response.text();
      let responseJson;

      try {
        responseJson = JSON.parse(responseText);
      } catch (error) {
        throw new Error(`Gateway returned non-JSON response (${response.status}): ${responseText.slice(0, 800)}`);
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < retryCount) {
          lastError = new Error(
            `Gateway request failed (${response.status}), retrying: ${JSON.stringify(responseJson).slice(0, 800)}`
          );
          await sleep(1000 * (attempt + 1));
          attempt += 1;
          continue;
        }

        throw new Error(
          `Gateway request failed (${response.status}): ${JSON.stringify(responseJson).slice(0, 800)}`
        );
      }

      return {
        response,
        responseJson
      };
    } catch (error) {
      lastError = error;

      if (attempt >= retryCount) {
        throw error;
      }

      await sleep(1000 * (attempt + 1));
      attempt += 1;
    } finally {
      clearTimeout(timeout);
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    }
  }

  throw lastError || new Error("Image request failed.");
}

function extractImagePayload(responseJson) {
  if (Array.isArray(responseJson?.data) && responseJson.data[0]?.b64_json) {
    return responseJson.data[0].b64_json;
  }

  if (Array.isArray(responseJson?.output)) {
    for (const item of responseJson.output) {
      if (item?.result) {
        return item.result;
      }
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (content?.type === "output_image" && content?.image_base64) {
            return content.image_base64;
          }
        }
      }
    }
  }

  throw new Error(`Image payload not found in gateway response: ${JSON.stringify(responseJson).slice(0, 800)}`);
}

async function runImageRequest({
  prompt,
  size = "auto",
  quality,
  background = "auto",
  outputFormat,
  outputCompression,
  latencyMode = "quality",
  referenceImages = [],
  maskImage,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryCount = 1,
  onHeartbeat,
  requireReferenceImages = false,
  projectName,
  filename,
  outputDir,
  transportPolicy: rawTransportPolicy,
  resolveHostname
}) {
  const transportPolicy = normalizeTransportPolicy(rawTransportPolicy);

  if (requireReferenceImages && referenceImages.length === 0) {
    throw new Error("edit_image requires at least one input image.");
  }

  if (maskImage && referenceImages.length === 0) {
    throw new Error("maskImage requires at least one reference image.");
  }

  if (outputDir && !transportPolicy.allowOutputDir) {
    throw new Error(`${transportPolicy.name} transport does not accept outputDir. Use projectName and filename instead.`);
  }

  const config = await loadRuntimeConfig();
  const latencyAdjusted = applyLatencyMode({ latencyMode, quality, outputFormat, size });
  const normalizedSize = normalizeSize(latencyAdjusted.size || "auto");
  const normalizedOutputFormat = (latencyAdjusted.outputFormat || "png").toLowerCase();
  const usingEditsEndpoint = (referenceImages && referenceImages.length > 0) || Boolean(maskImage);

  const requestBody = {
    model: config.model,
    prompt,
    size: normalizedSize,
    quality: latencyAdjusted.quality,
    background,
    output_format: normalizedOutputFormat
  };

  if (typeof outputCompression === "number" && ["jpeg", "webp"].includes(normalizedOutputFormat)) {
    requestBody.output_compression = outputCompression;
  }

  const { response, responseJson } = usingEditsEndpoint
    ? await performJsonRequest({
        url: `${config.baseUrl}/images/edits`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        },
        body: await buildEditsFormData({
          model: config.model,
          prompt,
          referenceImages,
          maskImage,
          size: normalizedSize,
          quality: latencyAdjusted.quality,
          background,
          outputFormat: normalizedOutputFormat,
          outputCompression,
          transportPolicy,
          resolveHostname
        }),
        timeoutMs,
        retryCount,
        onHeartbeat
      })
    : await performJsonRequest({
        url: `${config.baseUrl}/images/generations`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        timeoutMs,
        retryCount,
        onHeartbeat
      });

  const base64Image = extractImagePayload(responseJson);
  const imageBytes = Buffer.from(base64Image, "base64");
  const outputPath = inferOutputPath({
    outputDir,
    projectName,
    filename,
    prompt,
    format: normalizedOutputFormat
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, imageBytes);

  return {
    outputPath,
    markdownEmbed: `![generated image](${outputPath})`,
    format: pickExtension(normalizedOutputFormat),
    size: normalizedSize,
    quality: latencyAdjusted.quality,
    usingEditsEndpoint,
    referenceImageCount: referenceImages.length,
    requestId: response.headers.get("x-request-id") || null,
    sha256: crypto.createHash("sha256").update(imageBytes).digest("hex")
  };
}

export async function generateImage(options) {
  return runImageRequest(options);
}

export async function editImage(options) {
  return runImageRequest({
    ...options,
    requireReferenceImages: true
  });
}

export {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PROJECT_NAME,
  DEFAULT_TIMEOUT_MS,
  HTTP_TRANSPORT_POLICY,
  IMAGE_DATA_ROOT,
  MAX_REMOTE_IMAGE_BYTES,
  STDIO_TRANSPORT_POLICY
};
