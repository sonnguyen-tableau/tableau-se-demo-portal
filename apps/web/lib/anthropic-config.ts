/**
 * Resolves how the AI agent authenticates to Claude.
 *
 * Two mutually-exclusive paths:
 *
 *  1. **First-party** (default) — a personal/team Anthropic Console key
 *     (`ANTHROPIC_API_KEY`, `sk-ant-…`) against `api.anthropic.com`. This is
 *     what the repo ships with and what most SEs will use.
 *
 *  2. **Bedrock gateway** — for SEs whose org provides Claude via an internal
 *     Amazon Bedrock proxy (reachable over VPN) instead of a Console key.
 *     Selected when `ANTHROPIC_BEDROCK_BASE_URL` is set. The gateway speaks
 *     Bedrock's wire protocol, so it needs the `@anthropic-ai/bedrock-sdk`
 *     client with `skipAuth` — see the TODO in `lib/agent.ts`. Mirrors Claude
 *     Code's own `CLAUDE_CODE_USE_BEDROCK` / `ANTHROPIC_BEDROCK_BASE_URL` /
 *     `CLAUDE_CODE_SKIP_BEDROCK_AUTH` variables.
 *
 * This module owns the *decision* and validates the config; it does NOT
 * construct a client (that lives in `lib/agent.ts`). Keeping the branch in one
 * place means the route and the agent agree on which provider is active.
 */
import { env } from "@/lib/env";

/** First-party Anthropic API using an sk-ant key. */
export interface FirstPartyConfig {
  provider: "anthropic";
  apiKey: string;
}

/** Claude via a Bedrock-compatible gateway (org proxy over VPN). */
export interface BedrockConfig {
  provider: "bedrock";
  baseURL: string;
  /** Region for the endpoint + inference-profile IDs. Defaults to us-east-1. */
  awsRegion: string;
  /** When true, the SDK must NOT attach AWS SigV4 — the gateway authenticates. */
  skipAuth: boolean;
  /** Bedrock inference-profile model ID (first-party IDs are invalid here). */
  model: string;
}

export type AnthropicConfig = FirstPartyConfig | BedrockConfig;

/**
 * Decide which provider the agent should use, or return a reason string when
 * neither is usable (so the chat route can surface a clear message instead of
 * throwing). Bedrock wins when its base URL is set — an SE who configured the
 * gateway did so deliberately.
 */
export function resolveAnthropicConfig(): AnthropicConfig | { error: string } {
  if (env.ANTHROPIC_BEDROCK_BASE_URL) {
    if (!env.ANTHROPIC_BEDROCK_MODEL) {
      return {
        error:
          "ANTHROPIC_BEDROCK_BASE_URL is set but ANTHROPIC_BEDROCK_MODEL is not. " +
          "The Bedrock path needs an inference-profile model ID " +
          '(e.g. "us.anthropic.claude-sonnet-4-6-20260514-v1:0").',
      };
    }
    return {
      provider: "bedrock",
      baseURL: env.ANTHROPIC_BEDROCK_BASE_URL,
      awsRegion: env.AWS_REGION ?? "us-east-1",
      // Default to skipping auth when a gateway is configured (the common
      // corporate-proxy case); only honor an explicit "false" to opt back in.
      skipAuth: env.ANTHROPIC_BEDROCK_SKIP_AUTH !== false,
      model: env.ANTHROPIC_BEDROCK_MODEL,
    };
  }

  if (env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY };
  }

  return {
    error:
      "No Claude provider configured. Set ANTHROPIC_API_KEY (first-party) or " +
      "ANTHROPIC_BEDROCK_BASE_URL + ANTHROPIC_BEDROCK_MODEL (Bedrock gateway).",
  };
}
