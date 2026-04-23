import { generateImage } from "./lib/imagegen.mjs";
import { assertRuntimeConfigReady } from "./lib/runtime-config.mjs";

await assertRuntimeConfigReady();

const result = await generateImage({
  prompt:
    "A cinematic illustration of a glass greenhouse floating above calm water at sunrise, soft mist, clean composition, high detail.",
  size: "1024x1024",
  quality: "high",
  outputFormat: "png",
  projectName: "smoke-test",
  filename: "smoke-test-greenhouse"
});

console.log(JSON.stringify(result, null, 2));
