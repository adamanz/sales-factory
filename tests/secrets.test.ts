import assert from "node:assert/strict";
import test from "node:test";
import { formatSecretLocation, redactSecrets, withCredential } from "../lib/secrets";

test("redactSecrets removes known values and google tokens", () => {
  const text = "failure ya29.abcdef123456 and super-secret-value";
  const out = redactSecrets(text, ["super-secret-value"]);
  assert.equal(out.includes("super-secret-value"), false);
  assert.equal(out.includes("ya29."), false);
  assert.match(out, /\[redacted\]/);
});

test("formatSecretLocation names the vault and title only", () => {
  assert.equal(
    formatSecretLocation({ kind: "op", vault: "Private", title: "DEEPGRAM_API_KEY" }),
    "1Password Private / DEEPGRAM_API_KEY",
  );
  assert.equal(
    formatSecretLocation({ kind: "file", name: "GOOGLE_CLIENT_ID" }),
    "~/.config/grokbot-secrets/GOOGLE_CLIENT_ID",
  );
  assert.equal(formatSecretLocation({ kind: "env", name: "GOOGLE_REFRESH_TOKEN" }), "environment GOOGLE_REFRESH_TOKEN");
});

test("withCredential sets the concealed field", () => {
  const edited = withCredential(
    {
      title: "",
      fields: [
        { id: "username", label: "username" },
        { id: "credential", label: "credential" },
      ],
    },
    "GOOGLE_REFRESH_TOKEN",
    "refresh-test",
  );
  assert.equal(edited.title, "GOOGLE_REFRESH_TOKEN");
  assert.equal(edited.fields.find((field) => field.id === "credential")?.value, "refresh-test");
  assert.throws(
    () => withCredential({ title: "", fields: [{ id: "username" }] }, "GOOGLE_REFRESH_TOKEN", "refresh-test"),
    /no credential field/,
  );
});
