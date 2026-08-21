import { describe, expect, it } from "vitest";

describe("Firebase web configuration", () => {
  it("accepts the configured public API key", async () => {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    expect(apiKey).toBeTruthy();
    expect(projectId).toBeTruthy();

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    expect(payload.error?.message).not.toBe("API key not valid. Please pass a valid API key.");
    expect(response.status).toBe(400);
  }, 15_000);
});
