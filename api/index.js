import { createVercelRuntime } from "../src/vercel-runtime.js";

let runtime;
export default async function handler(request, response) {
  runtime ??= createVercelRuntime();
  return (await runtime).handler(request, response);
}
