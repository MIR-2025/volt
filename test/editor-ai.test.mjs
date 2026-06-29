// volt-addon-editor — AI proxy provider routing (key injection, _provider strip).
import { test } from "node:test";
import assert from "node:assert/strict";
import { providerRequest } from "../packages/volt-addon-editor/lib/ai.js";

test("anthropic: x-api-key header, correct URL, _provider stripped", () => {
  const r = providerRequest({ _provider: "anthropic", model: "claude", messages: [] }, { ANTHROPIC_API_KEY: "sk-a" });
  assert.equal(r.url, "https://api.anthropic.com/v1/messages");
  assert.equal(r.headers["x-api-key"], "sk-a");
  assert.equal(r.headers["anthropic-version"], "2023-06-01");
  assert.equal(r.payload._provider, undefined);
  assert.deepEqual(r.payload.messages, []);
});

test("openai: Bearer auth + chat completions URL", () => {
  const r = providerRequest({ _provider: "openai", messages: [] }, { OPENAI_API_KEY: "sk-o" });
  assert.equal(r.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(r.headers.authorization, "Bearer sk-o");
});

test("gemini: model + key in the URL, model stripped from body", () => {
  const r = providerRequest({ _provider: "gemini", model: "gemini-2.0-flash", contents: [] }, { GEMINI_API_KEY: "k" });
  assert.match(r.url, /models\/gemini-2\.0-flash:generateContent\?key=k/);
  assert.equal(r.payload.model, undefined);
});

test("defaults to anthropic; missing key or unknown provider throws", () => {
  assert.equal(providerRequest({}, { ANTHROPIC_API_KEY: "x" }).provider, "anthropic");
  assert.throws(() => providerRequest({ _provider: "openai" }, {}));
  assert.throws(() => providerRequest({ _provider: "nope" }, { ANTHROPIC_API_KEY: "x" }));
});
