import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { loadRuntimeConfig, resolveImageDataRoot } from "./runtime-config.mjs";

const IMAGE_DATA_ROOT = resolveImageDataRoot();
const DEFAULT_PROJECT_NAME = "default-project";
const DEFAULT_OUTPUT_DIR = path.join(IMAGE_DATA_ROOT, DEFAULT_PROJECT_NAME);
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_HEARTBEAT_MS = 5000;

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

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isDataUrl(value) {
  return /^data:/i.test(value);
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

async function loadImageSource(imageSource) {
  if (!imageSource || typeof imageSource !== "string") {
    throw new Error("Reference image entries must be strings.");
  }

  if (isDataUrl(imageSource)) {
    const { mimeType, buffer } = parseDataUrl(imageSource);
    return {
      fileName: `reference-${crypto.randomBytes(3).toString("hex")}.${extensionFromMimeType(mimeType)}`,
      mimeType,
      buffer
    };
  }

  if (isHttpUrl(imageSource)) {
    const response = await fetch(imageSource);

    if (!response.ok) {
      throw new Error(`Failed to download reference image: ${imageSource} (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const url = new URL(imageSource);
    const fileName = path.basename(url.pathname) || `reference-${crypto.randomBytes(3).toString("hex")}.png`;
    const mimeType = response.headers.get("content-type") || pickMimeType(fileName);

    return {
      fileName,
      mimeType,
      buffer: Buffer.from(arrayBuffer)
    };
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
  outputCompression
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
    const loaded = await loadImageSource(referenceImage);
    const file = new File([loaded.buffer], loaded.fileName, { type: loaded.mimeType });
    form.append("image[]", file);
  }

  if (maskImage) {
    const loadedMask = await loadImageSource(maskImage);
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
  outputDir
}) {
  if (requireReferenceImages && referenceImages.length === 0) {
    throw new Error("edit_image requires at least one input image.");
  }

  if (maskImage && referenceImages.length === 0) {
    throw new Error("maskImage requires at least one reference image.");
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
          outputCompression
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
  IMAGE_DATA_ROOT
};
