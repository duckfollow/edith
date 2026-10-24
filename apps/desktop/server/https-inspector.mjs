import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { X509Certificate, createPublicKey, randomBytes } from "node:crypto";
import { join } from "node:path";
import { isIP } from "node:net";
const exec = promisify(execFile);
export function inspectionDomains(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32)
    throw Error("Choose 1–32 exact DNS hostnames for HTTPS inspection");
  return [
    ...new Set(
      value.map((host) => {
        if (typeof host !== "string")
          throw Error("Invalid inspection hostname");
        host = host.trim().toLowerCase();
        if (
          host.length > 253 ||
          isIP(host) ||
          !host
            .split(".")
            .every((part) =>
              /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part),
            )
        )
          throw Error(
            "Use exact DNS hostnames without scheme, port, wildcard or IP address",
          );
        return host;
      }),
    ),
  ];
}
export function createHttpsInspector({ directory, createScript } = {}) {
  const certPath = join(directory, "edith-debug-ca.cert.pem"),
    keyPath = join(directory, "edith-debug-ca.key.pem");
  const cache = new Map(),
    pending = new Map();
  let queue = Promise.resolve(),
    creating = null;
  async function material() {
    const [cert, key] = await Promise.all([
      readFile(certPath, "utf8"),
      readFile(keyPath, "utf8"),
    ]);
    const ca = new X509Certificate(cert);
    if (
      !ca.ca ||
      !ca.verify(createPublicKey(key)) ||
      Date.parse(ca.validFrom) > Date.now() ||
      Date.parse(ca.validTo) <= Date.now()
    )
      throw Error("CA is invalid, expired or does not match its private key");
    return { cert, key, ca };
  }
  async function status() {
    try {
      const { ca } = await material();
      return {
        ready: true,
        subject: ca.subject,
        fingerprint256: ca.fingerprint256,
        validTo: ca.validTo,
        trust: "Not detectable; install/trust manually",
      };
    } catch (error) {
      return {
        ready: false,
        error:
          error.code === "ENOENT"
            ? "No local CA. Create one before enabling inspection."
            : error.message,
      };
    }
  }
  async function create() {
    if (!createScript) throw Error("CA creation unavailable");
    if (creating) return creating;
    creating = exec(process.execPath, [createScript], {
      env: { ...process.env, EDITH_CA_DIRECTORY: directory },
      timeout: 60000,
      maxBuffer: 131072,
    })
      .then(() => status())
      .catch(() => {
        throw Error(
          "CA creation failed. Existing CA material is never overwritten. Check OpenSSL and local CA files.",
        );
      });
    try {
      return await creating;
    } finally {
      creating = null;
    }
  }
  async function certificate(host) {
    inspectionDomains([host]);
    const { ca } = await material();
    const id = ca.fingerprint256 + ":" + host;
    const cached = cache.get(id);
    if (cached && cached.expires > Date.now() + 60000) return cached;
    if (pending.has(id)) return pending.get(id);
    if (pending.size >= 4)
      throw Error("Certificate generation busy. Retry shortly.");
    const run = queue.then(async () => {
      const existing = cache.get(id);
      if (existing && existing.expires > Date.now() + 60000) return existing;
      await mkdir(join(directory, "leaves"), { recursive: true, mode: 0o700 });
      const temp = await mkdtemp(join(directory, "leaves", "leaf-"));
      const key = join(temp, "leaf.key"),
        csr = join(temp, "leaf.csr"),
        cert = join(temp, "leaf.pem"),
        ext = join(temp, "leaf.cnf");
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
          ext,
          `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${host}\n`,
          { mode: 0o600 },
        );
        const runOpenSSL = (args) =>
          exec(process.env.EDITH_OPENSSL || "openssl", args, { timeout: 15000, maxBuffer: 131072 });
        await runOpenSSL([
          "req",
          "-new",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          key,
          "-out",
          csr,
          "-subj",
          `/CN=${host}`,
        ]);
        await runOpenSSL([
          "x509",
          "-req",
          "-in",
          csr,
          "-CA",
          certPath,
          "-CAkey",
          keyPath,
          "-set_serial",
          `0x${randomBytes(16).toString("hex")}`,
          "-days",
          "1",
          "-sha256",
          "-extfile",
          ext,
          "-out",
          cert,
        ]);
        const [privateKey, leafCert] = await Promise.all([
          readFile(key, "utf8"),
          readFile(cert, "utf8"),
        ]);
        const leaf = new X509Certificate(leafCert);
        if (!leaf.checkHost(host) || !leaf.verify(ca.publicKey))
          throw Error("Generated certificate validation failed");
        const value = {
          key: privateKey,
          cert: leafCert,
          expires: Math.min(Date.parse(leaf.validTo), Date.parse(ca.validTo)),
        };
        if (cache.size >= 32) cache.delete(cache.keys().next().value);
        cache.set(id, value);
        return value;
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    });
    queue = run.catch(() => {});
    const tracked = run.finally(() => pending.delete(id));
    pending.set(id, tracked);
    return tracked;
  }
  return {
    status,
    create,
    certificate,
    publicCertificate: () => readFile(certPath),
    clear: () => cache.clear(),
  };
}

export function inspectionSettings(input = { enabled: false }) {
  if (
    typeof input?.enabled !== "boolean" ||
    (input.allHostnames !== undefined &&
      typeof input.allHostnames !== "boolean")
  )
    throw Error("Invalid HTTPS inspection settings");
  if (!input.enabled)
    return {
      enabled: false,
      domains: [],
      allHostnames: false,
      excludedDomains: [],
    };
  const allHostnames = input.allHostnames === true;
  const excludedDomains =
    input.excludedDomains === undefined ||
    (Array.isArray(input.excludedDomains) && !input.excludedDomains.length)
      ? []
      : inspectionDomains(input.excludedDomains);
  return {
    enabled: true,
    allHostnames,
    domains: allHostnames ? [] : inspectionDomains(input.domains),
    excludedDomains,
  };
}
export function shouldInspectHost(host, settings) {
  if (!settings.enabled || settings.excludedDomains?.includes(host))
    return false;
  if (!settings.allHostnames) return settings.domains.includes(host);
  try {
    inspectionDomains([host]);
    return true;
  } catch {
    return false;
  }
}
