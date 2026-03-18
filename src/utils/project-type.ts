import type { ProjectContext } from "../types/index.js";

export function inferProjectType(
  hasBin: boolean,
  frameworks: string[],
  routeEndpoints: string[]
): ProjectContext["projectType"] {
  const frameworkSet = new Set(frameworks.map((framework) => framework.toLowerCase()));
  if (hasBin) {
    return "cli";
  }

  if (
    routeEndpoints.length > 0 ||
    frameworkSet.has("express") ||
    frameworkSet.has("fastify") ||
    frameworkSet.has("koa") ||
    frameworkSet.has("hono")
  ) {
    return "api-service";
  }

  if (
    frameworkSet.has("react") ||
    frameworkSet.has("next") ||
    frameworkSet.has("vue") ||
    frameworkSet.has("vite")
  ) {
    return "web-app";
  }

  return "library";
}
