import crypto from "node:crypto";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { editImage, generateImage, IMAGE_DATA_ROOT, STDIO_TRANSPORT_POLICY } from "./imagegen.mjs";

const DEFAULT_MCP_SYNC_WAIT_MS = 90000;
const MAX_MCP_SYNC_WAIT_MS = 110000;
const MAX_RETAINED_JOBS = 50;
const imageJobs = new Map();

function parseSyncWaitMs(value) {
  if (value === undefined || value === "") {
    return DEFAULT_MCP_SYNC_WAIT_MS;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MCP_SYNC_WAIT_MS;
  }

  return Math.min(Math.trunc(parsed), MAX_MCP_SYNC_WAIT_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneJobs() {
  if (imageJobs.size <= MAX_RETAINED_JOBS) {
    return;
  }

  for (const [jobId, job] of imageJobs) {
    if (job.status === "running") {
      continue;
    }

    imageJobs.delete(jobId);

    if (imageJobs.size <= MAX_RETAINED_JOBS) {
      return;
    }
  }
}

function startImageJob({ kind, run }) {
  const now = new Date().toISOString();
  const job = {
    id: `imgjob-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    kind,
    status: "running",
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    result: null,
    error: null,
    promise: null
  };

  job.promise = (async () => {
    try {
      job.result = await run();
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = {
        name: error?.name || "Error",
        message: error?.message || String(error)
      };
    } finally {
      const finishedAt = new Date().toISOString();
      job.finishedAt = finishedAt;
      job.updatedAt = finishedAt;
      pruneJobs();
    }
  })();

  imageJobs.set(job.id, job);
  pruneJobs();

  return job;
}

async function waitForJob(job, waitMs) {
  if (!job || job.status !== "running" || waitMs <= 0) {
    return job;
  }

  await Promise.race([job.promise, sleep(waitMs)]);
  return job;
}

function buildPendingJobResult(job) {
  return {
    content: [
      {
        type: "text",
        text: [
          "Image job is still running in the MCP server.",
          `Job ID: ${job.id}`,
          `Tool: ${job.kind}`,
          `Started at: ${job.startedAt}`,
          "Next step: call check_image_job with this jobId to retrieve the saved image when it is ready."
        ].join("\n")
      }
    ]
  };
}

function buildFailedJobError(job) {
  const message = job?.error?.message || "Unknown image job error.";
  return new Error(`Image job ${job.id} failed: ${message}`);
}

function buildMissingJobResult(jobId) {
  return {
    content: [
      {
        type: "text",
        text: [
          "Image job was not found.",
          `Job ID: ${jobId}`,
          "This usually means the MCP server process was restarted or the job history was pruned."
        ].join("\n")
      }
    ],
    isError: true
  };
}

function buildCommonImageInputSchema(transportPolicy) {
  const sourceDescription = imageSourceDescription(transportPolicy);
  const schema = {
    prompt: z.string().min(1).describe("A concrete image prompt."),
    size: z
      .string()
      .optional()
      .describe("Image size. Accepts custom dimensions like 1536x1024, 1536 * 1024, 1536×1024, or auto."),
    quality: z
      .enum(["low", "medium", "high", "auto"])
      .optional()
      .describe("Generation quality."),
    latencyMode: z
      .enum(["fast", "quality"])
      .optional()
      .describe("Use fast for quicker draft images, quality for higher fidelity."),
    background: z
      .enum(["auto", "transparent", "opaque"])
      .optional()
      .describe("Background handling."),
    outputFormat: z
      .enum(["png", "jpeg", "webp"])
      .optional()
      .describe("Saved image format."),
    outputCompression: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Compression level for jpeg/webp output."),
    maskImage: z
      .string()
      .optional()
      .describe(`${sourceDescription} for an optional mask image.`),
    timeoutMs: z
      .number()
      .int()
      .min(10000)
      .max(600000)
      .optional()
      .describe("Gateway request timeout in milliseconds."),
    retryCount: z
      .number()
      .int()
      .min(0)
      .max(5)
      .optional()
      .describe("Retry count for retryable gateway errors or slow upstream failures."),
    projectName: z
      .string()
      .optional()
      .describe("Logical project name used when deriving the output directory."),
    filename: z
      .string()
      .optional()
      .describe("Optional output filename without path. Extension is added automatically.")
  };

  if (transportPolicy.allowOutputDir) {
    schema.outputDir = z
      .string()
      .optional()
      .describe(`Absolute directory for generated files. Defaults under ${IMAGE_DATA_ROOT}/<project-name>.`);
  }

  return schema;
}

function imageSourceDescription(transportPolicy) {
  return transportPolicy.allowLocalPaths
    ? "Absolute local path, public HTTP URL, or data URL"
    : "Data URL or public http/https URL";
}

function buildTextResult(result, extraLines = []) {
  const savedFileName = path.basename(result.outputPath);

  return {
    content: [
      {
        type: "text",
        text: [
          `Saved image file: ${savedFileName}`,
          "Local file path hidden for privacy.",
          `Final size: ${result.size}`,
          `Quality: ${result.quality}`,
          ...extraLines,
          `SHA-256: ${result.sha256}`,
          result.requestId ? `Request ID: ${result.requestId}` : null
        ]
          .filter(Boolean)
          .join("\n")
      }
    ]
  };
}

export function createImageGenServer(transportPolicy = STDIO_TRANSPORT_POLICY) {
  const commonImageInputSchema = buildCommonImageInputSchema(transportPolicy);
  const sourceDescription = imageSourceDescription(transportPolicy);
  const server = new McpServer({
    name: "mcp-imagegen-server",
    version: "0.4.2"
  });

  server.registerTool(
    "generate_image",
    {
      description: `Generate a new image through an OpenAI-compatible image API and save it to a local file.

Use this tool when the user explicitly asks to generate, draw, render, or create an image, illustration, poster, banner, hero image, thumbnail, cover, wallpaper, concept art, or product shot.`,
      inputSchema: {
        ...commonImageInputSchema,
        referenceImages: z.array(z.string()).optional().describe(`Optional inspiration images as ${sourceDescription}s.`)
      }
    },
    async (
      {
        prompt,
        size,
        quality,
        latencyMode,
        background,
        outputFormat,
        outputCompression,
        referenceImages,
        maskImage,
        timeoutMs,
        retryCount,
        projectName,
        filename,
        outputDir
      },
      extra
    ) => {
      let heartbeatCount = 0;
      const job = startImageJob({
        kind: "generate_image",
        run: () =>
          generateImage({
            prompt,
            size,
            quality,
            latencyMode,
            background,
            outputFormat,
            outputCompression,
            referenceImages,
            maskImage,
            timeoutMs,
            retryCount,
            projectName,
            filename,
            outputDir,
            transportPolicy,
            onHeartbeat: async (attempt) => {
              heartbeatCount += 1;

              if (extra._meta?.progressToken !== undefined) {
                await extra.sendNotification({
                  method: "notifications/progress",
                  params: {
                    progressToken: extra._meta.progressToken,
                    progress: heartbeatCount,
                    message: `Image generation is still running (attempt ${attempt})...`
                  }
                });
              }
            }
          })
      });

      await waitForJob(job, parseSyncWaitMs(process.env.IMAGEGEN_MCP_SYNC_WAIT_MS));

      if (job.status === "running") {
        return buildPendingJobResult(job);
      }

      if (job.status === "failed") {
        throw buildFailedJobError(job);
      }

      return buildTextResult(job.result, [
        job.result.usingEditsEndpoint ? `Reference images used: ${job.result.referenceImageCount}` : null
      ]);
    }
  );

  server.registerTool(
    "check_image_job",
    {
      description: `Check a background image generation/editing job started by generate_image or edit_image.

Use this after generate_image or edit_image returns a Job ID instead of a saved image, especially when the upstream image API is slow and Codex's MCP call timeout would otherwise cut off the request.`,
      inputSchema: {
        jobId: z.string().min(1).describe("Job ID returned by generate_image or edit_image."),
        waitMs: z
          .number()
          .int()
          .min(0)
          .max(MAX_MCP_SYNC_WAIT_MS)
          .optional()
          .describe("Optional time to wait for the job before returning, in milliseconds.")
      }
    },
    async ({ jobId, waitMs }) => {
      const job = imageJobs.get(jobId);

      if (!job) {
        return buildMissingJobResult(jobId);
      }

      await waitForJob(job, typeof waitMs === "number" ? waitMs : 0);

      if (job.status === "running") {
        return buildPendingJobResult(job);
      }

      if (job.status === "failed") {
        throw buildFailedJobError(job);
      }

      const extraLines = job.kind === "edit_image"
        ? [`Source images used: ${job.result.referenceImageCount}`]
        : [job.result.usingEditsEndpoint ? `Reference images used: ${job.result.referenceImageCount}` : null];

      return buildTextResult(job.result, extraLines);
    }
  );

  server.registerTool(
    "edit_image",
    {
      description: `Edit or extend one or more existing images through an OpenAI-compatible image API and save the result to a local file.

Use inputImages for the source images. Use maskImage when the user wants a localized edit.`,
      inputSchema: {
        ...commonImageInputSchema,
        inputImages: z
          .union([z.string(), z.array(z.string()).min(1)])
          .describe(`One or more ${sourceDescription}s for the source images.`)
      }
    },
    async (
      {
        prompt,
        inputImages,
        size,
        quality,
        latencyMode,
        background,
        outputFormat,
        outputCompression,
        maskImage,
        timeoutMs,
        retryCount,
        projectName,
        filename,
        outputDir
      },
      extra
    ) => {
      const normalizedInputImages = Array.isArray(inputImages) ? inputImages : [inputImages];
      let heartbeatCount = 0;
      const job = startImageJob({
        kind: "edit_image",
        run: () =>
          editImage({
            prompt,
            referenceImages: normalizedInputImages,
            size,
            quality,
            latencyMode,
            background,
            outputFormat,
            outputCompression,
            maskImage,
            timeoutMs,
            retryCount,
            projectName,
            filename,
            outputDir,
            transportPolicy,
            onHeartbeat: async (attempt) => {
              heartbeatCount += 1;

              if (extra._meta?.progressToken !== undefined) {
                await extra.sendNotification({
                  method: "notifications/progress",
                  params: {
                    progressToken: extra._meta.progressToken,
                    progress: heartbeatCount,
                    message: `Image editing is still running (attempt ${attempt})...`
                  }
                });
              }
            }
          })
      });

      await waitForJob(job, parseSyncWaitMs(process.env.IMAGEGEN_MCP_SYNC_WAIT_MS));

      if (job.status === "running") {
        return buildPendingJobResult(job);
      }

      if (job.status === "failed") {
        throw buildFailedJobError(job);
      }

      return buildTextResult(job.result, [`Source images used: ${job.result.referenceImageCount}`]);
    }
  );

  return server;
}
