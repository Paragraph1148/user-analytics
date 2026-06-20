import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteSessionData = vi.fn<(id: string) => Promise<unknown>>();
vi.mock("@/lib/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sessions")>();
  return { ...actual, deleteSessionData: (...args: [string]) => deleteSessionData(...args) };
});

import { DELETE } from "@/app/api/sessions/[id]/route";

function del(id: string, cookie?: string): Request {
  return new Request(`http://localhost/api/sessions/${id}`, {
    method: "DELETE",
    headers: cookie ? { Cookie: cookie } : {},
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => deleteSessionData.mockClear());

describe("DELETE /api/sessions/[id] (self-serve erasure)", () => {
  it("deletes when the cf_sid cookie matches the session", async () => {
    const res = await DELETE(del("mysession", "cf_sid=mysession"), ctx("mysession"));
    expect(res.status).toBe(200);
    expect(deleteSessionData).toHaveBeenCalledWith("mysession");
  });

  it("forbids deleting someone else's session", async () => {
    const res = await DELETE(del("victim", "cf_sid=attacker"), ctx("victim"));
    expect(res.status).toBe(403);
    expect(deleteSessionData).not.toHaveBeenCalled();
  });

  it("forbids deletion with no first-party cookie", async () => {
    const res = await DELETE(del("mysession"), ctx("mysession"));
    expect(res.status).toBe(403);
    expect(deleteSessionData).not.toHaveBeenCalled();
  });

  it("rejects an invalid session id", async () => {
    const res = await DELETE(del("bad id", "cf_sid=bad id"), ctx("bad id"));
    expect(res.status).toBe(400);
    expect(deleteSessionData).not.toHaveBeenCalled();
  });
});
