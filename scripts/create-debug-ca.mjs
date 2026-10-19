import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { X509Certificate, createPublicKey } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, ".local", "ca");
if (existsSync(directory))
  throw new Error(
    "A CA directory already exists at .local/ca. Refusing to replace or rotate existing key material.",
  );
const oldMask = process.umask(0o077);
try {
  mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const key = path.join(directory, "edith-debug-ca.key.pem");
  const cert = path.join(directory, "edith-debug-ca.cert.pem");
  const der = path.join(directory, "edith-debug-ca.cer");
  const config = path.join(directory, "openssl.cnf");
  const suffix = randomBytes(4).toString("hex");
  writeFileSync(
    config,
    `[req]\nprompt = no\ndistinguished_name = dn\nx509_extensions = ca_extensions\n[dn]\nO = EDITH Local Development\nCN = EDITH Local Debug CA ${suffix}\n[ca_extensions]\nbasicConstraints = critical, CA:TRUE, pathlen:0\nkeyUsage = critical, keyCertSign, cRLSign\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid:always\n`,
    { mode: 0o600, flag: "wx" },
  );
  function openssl(args) {
    return execFileSync("openssl", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  openssl([
    "req",
    "-new",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-nodes",
    "-sha256",
    "-days",
    "365",
    "-set_serial",
    `0x${randomBytes(16).toString("hex")}`,
    "-config",
    config,
    "-keyout",
    key,
    "-out",
    cert,
  ]);
  chmodSync(key, 0o600);
  openssl(["x509", "-in", cert, "-outform", "DER", "-out", der]);
  const certificate = new X509Certificate(
    openssl(["x509", "-in", cert, "-outform", "PEM"]),
  );
  const publicFromKey = createPublicKey(
    openssl(["pkey", "-in", key, "-pubout"]),
  );
  if (!certificate.ca || !certificate.verify(publicFromKey))
    throw new Error("Generated CA failed self-signature/key validation.");
  const verify = openssl(["verify", "-CAfile", cert, cert]).trim();
  const metadata = {
    subject: certificate.subject,
    fingerprint256: certificate.fingerprint256,
    validFrom: certificate.validFrom,
    validTo: certificate.validTo,
    algorithm: "RSA 3072 / SHA-256",
    privateKeyPath: ".local/ca/edith-debug-ca.key.pem",
    certificatePath: ".local/ca/edith-debug-ca.cert.pem",
    derCertificatePath: ".local/ca/edith-debug-ca.cer",
    trustedBySystem: false,
    httpsInspectionImplemented: false,
  };
  writeFileSync(
    path.join(directory, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log(JSON.stringify({ ...metadata, verification: verify }, null, 2));
} catch (error) {
  console.error(
    "CA creation failed. Any partial material remains in the ignored .local/ca directory; it has not been installed or trusted.",
  );
  throw error;
} finally {
  process.umask(oldMask);
}
