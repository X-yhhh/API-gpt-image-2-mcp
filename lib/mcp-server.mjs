import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { editImage, generateImage, IMAGE_DATA_ROOT } from "./imagegen.mjs";

const commonImageInputSchema = {
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
    .describe("Absolute local path, HTTP URL, or data URL for an optional mask image."),
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
    .describe("Optional output filename without path. Extension is added automatically."),
  outputDir: z
    .string()
    .optional()
    .describe(`Absolute directory for generated files. Defaults under ${IMAGE_DATA_ROOT}/<project-name>.`)
};

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

export function createImageGenServer() {
  const server = new McpServer({
    name: "mcp-imagegen-server",
    version: "0.3.0"
  });

  server.registerTool(
    "generate_image",
    {
      description: `Generate a new image through an OpenAI-compatible image API and save it to a local file.

Use this tool when the user explicitly asks to generate, draw, render, or create an image, illustration, poster, banner, hero image, thumbnail, cover, wallpaper, concept art, or product shot.`,
      inputSchema: {
        ...commonImageInputSchema,
        referenceImages: z.array(z.string()).optional().describe("Optional inspiration images for reference-based generation.")
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
      const result = await generateImage({
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
      });

      return buildTextResult(result, [
        result.usingEditsEndpoint ? `Reference images used: ${result.referenceImageCount}` : null
      ]);
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
          .describe("One or more absolute local paths, HTTP URLs, or data URLs for the source images.")
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

      const result = await editImage({
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
      });

      return buildTextResult(result, [`Source images used: ${result.referenceImageCount}`]);
    }
  );

  return server;
}
