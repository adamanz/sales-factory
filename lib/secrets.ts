// Reads credentials from the environment, 1Password, or ~/.config/grokbot-secrets.
// Never log the value. 1Password lookup order is Personal, then the secrets
// directory, then Private.
import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SecretLocation =
  | { kind: "env"; name: string }
  | { kind: "op"; vault: "Personal" | "Private"; title: string }
  | { kind: "file"; name: string };

export type ResolvedSecret = {
  value: string;
  location: SecretLocation;
};

type ApiField = { id?: string; label?: string; value?: string };
type ApiTemplate = { title: string; category?: string; fields: ApiField[] };

const VAULTS = ["Personal", "Private"] as const;

export function formatSecretLocation(location: SecretLocation): string {
  switch (location.kind) {
    case "env":
      return `environment ${location.name}`;
    case "op":
      return `1Password ${location.vault} / ${location.title}`;
    case "file":
      return `~/.config/grokbot-secrets/${location.name}`;
    default: {
      const neverLocation: never = location;
      throw new Error(`Unknown secret location ${JSON.stringify(neverLocation)}`);
    }
  }
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  const sorted = [...secrets].filter((secret) => secret.length >= 6).sort((a, b) => b.length - a.length);
  for (const secret of sorted) out = out.split(secret).join("[redacted]");
  return out.replace(/\b(?:ya29\.|1\/\/)[A-Za-z0-9_\-./]+/g, "[redacted]");
}

export function withCredential(template: ApiTemplate, title: string, credential: string): ApiTemplate {
  const copy = structuredClone(template);
  copy.title = title;
  let found = false;
  for (const field of copy.fields) {
    if (field.id === "credential" || field.label === "credential") {
      field.value = credential;
      found = true;
    }
  }
  if (!found) throw new Error("API Credential template has no credential field");
  return copy;
}

export async function readSecret(name: string, titles: readonly string[] = [name]): Promise<ResolvedSecret | null> {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return { value: fromEnv, location: { kind: "env", name } };

  for (const title of titles) {
    const personal = await readOp("Personal", title, "credential");
    if (personal) return { value: personal, location: { kind: "op", vault: "Personal", title } };
  }

  for (const title of titles) {
    const fromFile = await readSecretFile(title);
    if (fromFile) return { value: fromFile, location: { kind: "file", name: title } };
  }

  for (const title of titles) {
    const priv = await readOp("Private", title, "credential");
    if (priv) return { value: priv, location: { kind: "op", vault: "Private", title } };
  }

  return null;
}

export async function readGoogleOAuthClient(): Promise<{
  clientId: ResolvedSecret;
  clientSecret: ResolvedSecret;
} | null> {
  const clientId = await readSecret("GOOGLE_CLIENT_ID", ["GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"]);
  const clientSecret = await readSecret("GOOGLE_CLIENT_SECRET", ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"]);
  if (clientId && clientSecret) return { clientId, clientSecret };

  for (const vault of VAULTS) {
    for (const title of ["GOOGLE_OAUTH_CLIENT", "GOOGLE_OAUTH"]) {
      const username = await readOp(vault, title, "username");
      const credential = await readOp(vault, title, "credential");
      if (!username || !credential) continue;
      const idIsUsername = username.endsWith(".apps.googleusercontent.com");
      const idIsCredential = credential.endsWith(".apps.googleusercontent.com");
      if (!idIsUsername && !idIsCredential) continue;
      const location: SecretLocation = { kind: "op", vault, title };
      return {
        clientId: { value: idIsUsername ? username : credential, location },
        clientSecret: { value: idIsUsername ? credential : username, location },
      };
    }
  }

  return null;
}

export async function storePersonalApiCredential(title: string, credential: string): Promise<string> {
  const existingId = await findItemId("Personal", title);
  const dir = await mkdtemp(join(tmpdir(), "op-item-"));
  await chmod(dir, 0o700);
  const stdoutPath = join(dir, "stdout.json");
  try {
    if (existingId) {
      const currentPath = join(dir, "current.json");
      const templatePath = join(dir, "template.json");
      await runOp(["item", "get", existingId, "--vault", "Personal", "--format", "json"], null, currentPath, [credential]);
      const current = JSON.parse(await readFile(currentPath, "utf8")) as ApiTemplate;
      const edited = withCredential(current, title, credential);
      await writeFile(templatePath, JSON.stringify(edited), { mode: 0o600 });
      await chmod(templatePath, 0o600);
      await runOp(
        ["item", "edit", existingId, "--vault", "Personal", `--template=${templatePath}`],
        null,
        stdoutPath,
        [credential],
      );
    } else {
      const { stdout } = await execFileAsync("op", ["item", "template", "get", "API Credential"], {
        timeout: 30_000,
        maxBuffer: 1_000_000,
      });
      const template = JSON.parse(stdout) as ApiTemplate;
      const payload = withCredential(template, title, credential);
      await runOp(["item", "create", "--vault", "Personal", "-"], JSON.stringify(payload), stdoutPath, [credential]);
    }

    const id = itemIdFromOpJson(await readFile(stdoutPath, "utf8"));
    const stored = await readOp("Personal", title, "credential");
    if (stored !== credential) throw new Error(`1Password Personal / ${title} did not round-trip`);
    return id;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readSecretFile(name: string): Promise<string | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  try {
    const text = await readFile(join(homedir(), ".config", "grokbot-secrets", name), "utf8");
    const value = text.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function readOp(
  vault: "Personal" | "Private",
  title: string,
  field: "credential" | "username",
): Promise<string | null> {
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync("op", ["read", `op://${vault}/${title}/${field}`], {
      timeout: 30_000,
      maxBuffer: 1_000_000,
    });
    stdout = result.stdout;
    stderr = result.stderr ?? "";
  } catch (error) {
    stderr = stderrOf(error);
    if (isMissingOpItem(stderr)) return null;
    if (isLockedOp(stderr)) {
      throw new Error(`1Password is locked or signed out. Could not read ${vault} / ${title}.`);
    }
    return null;
  }
  void stderr;
  const value = stdout.trim();
  return value.length > 0 ? value : null;
}

async function findItemId(vault: "Personal" | "Private", title: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("op", ["item", "list", "--vault", vault, "--format", "json"], {
      timeout: 30_000,
      maxBuffer: 5_000_000,
    });
    const items = JSON.parse(stdout) as unknown;
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      if (!isRecord(item)) continue;
      if (item.title === title && typeof item.id === "string") return item.id;
    }
    return null;
  } catch {
    return null;
  }
}

async function runOp(
  args: string[],
  stdin: string | null,
  stdoutPath: string,
  secrets: readonly string[],
): Promise<void> {
  await writeFile(stdoutPath, "", { mode: 0o600 });
  await chmod(stdoutPath, 0o600);
  const stdout = createWriteStream(stdoutPath, { flags: "w", mode: 0o600 });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("op", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("1Password command timed out"));
    }, 30_000);
    child.stdout.pipe(stdout);
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (code) => {
      stdout.end(() => {
        if (code === 0) {
          finish();
          return;
        }
        const message = redactSecrets(Buffer.concat(stderrChunks).toString("utf8"), secrets);
        finish(new Error(`1Password command failed (${code}): ${message.slice(0, 300)}`));
      });
    });
    if (stdin === null) child.stdin.end();
    else child.stdin.end(stdin);
  });
  await chmod(stdoutPath, 0o600);
}

function itemIdFromOpJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("1Password returned an unreadable item response");
  }
  if (!isRecord(parsed) || typeof parsed.id !== "string" || parsed.id.length === 0) {
    throw new Error("1Password did not return an item id");
  }
  return parsed.id;
}

function stderrOf(error: unknown): string {
  if (!isRecord(error)) return error instanceof Error ? error.message : "";
  const stderr = error.stderr;
  if (typeof stderr === "string") return stderr;
  if (stderr instanceof Buffer) return stderr.toString("utf8");
  return error instanceof Error ? error.message : "";
}

function isMissingOpItem(stderr: string): boolean {
  return stderr.includes("isn't an item") || stderr.includes("isn't a field") || stderr.includes("not found");
}

function isLockedOp(stderr: string): boolean {
  const text = stderr.toLowerCase();
  return text.includes("not signed in") || text.includes("account is locked") || text.includes("signed out");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
