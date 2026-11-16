import { afterEach, expect, test, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

test("api.order posts {id, op, arg} and returns the reply", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, text: "shipping", tone: "good" }) });
  vi.stubGlobal("fetch", fetchMock);
  const reply = await api.order("o7", "update", "x");
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toMatch(/\/api\/order$/);
  expect(JSON.parse(init.body)).toEqual({ id: "o7", op: "update", arg: "x" });
  expect(reply).toEqual({ ok: true, text: "shipping", tone: "good" });
});

test("api.order answers with a gold bubble when the controller is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  const reply = await api.order("o7", "query");
  expect(reply.ok).toBe(false);
  expect(reply.tone).toBe("gold");
});

test("api.freeze posts the worker", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  await api.freeze(2);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ worker: 2 });
});
