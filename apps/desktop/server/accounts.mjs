import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { dirname } from "node:path";
const scrypt = promisify(scryptCallback),
  roles = new Set(["viewer", "developer", "admin"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = ({ id, username, role, disabled }) => ({
  id,
  username,
  role,
  disabled,
});
export async function createAccounts({
  file,
  controlOrigin = "http://127.0.0.1:1420",
  setupToken = randomBytes(24).toString("hex"),
  now = Date.now,
} = {}) {
  if (
    typeof setupToken !== "string" ||
    setupToken.length < 24 ||
    setupToken.length > 256
  )
    throw Error("EDITH_SETUP_TOKEN must contain 24–256 characters");
  let users = [];
  const sessions = new Map(),
    attempts = new Map();
  let queue = Promise.resolve();
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (
      saved.version !== 1 ||
      !Array.isArray(saved.users) ||
      !saved.users.length ||
      saved.users.length > 100 ||
      !saved.users.every(
        (u) =>
          typeof u.id === "string" &&
          typeof u.username === "string" &&
          roles.has(u.role) &&
          typeof u.disabled === "boolean" &&
          /^[a-f0-9]{32}$/.test(u.salt) &&
          /^[a-f0-9]{128}$/.test(u.hash),
      ) ||
      !saved.users.some((u) => u.role === "admin" && !u.disabled)
    )
      throw Error("Invalid accounts store");
    users = saved.users;
    await chmod(file, 0o600);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const origin = new URL(controlOrigin),
    hosts = new Set([
      origin.host,
      `127.0.0.1:${origin.port}`,
      `localhost:${origin.port}`,
    ]);
  async function persist(next) {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temp = file + ".tmp";
    await writeFile(temp, JSON.stringify({ version: 1, users: next }), {
      mode: 0o600,
    });
    await chmod(temp, 0o600);
    await rename(temp, file);
    users = next;
  }
  function serialize(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }
  function identity(req) {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("edith_session="))
      ?.slice(14);
    if (!token) return null;
    const key = digest(token),
      session = sessions.get(key);
    if (!session) return null;
    const user = users.find((u) => u.id === session.userId && !u.disabled);
    if (session.expires <= now() || !user) {
      sessions.delete(key);
      return null;
    }
    return user;
  }
  function cookie(res, token, age = 28800) {
    res.setHeader(
      "Set-Cookie",
      `edith_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${origin.protocol === "https:" ? "; Secure" : ""}`,
    );
  }
  function session(res, user) {
    for (const [key, s] of sessions)
      if (s.expires <= now()) sessions.delete(key);
    if (sessions.size >= 1024) throw Error("Session limit reached");
    const token = randomBytes(32).toString("hex");
    sessions.set(digest(token), {
      userId: user.id,
      expires: now() + 8 * 3600000,
    });
    cookie(res, token);
  }
  async function credentials(body) {
    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username))
      throw Error(
        "Username must be 3–64 letters, numbers, dots, underscores or hyphens",
      );
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 256
    )
      throw Error("Password must be 12–256 characters");
    const salt = randomBytes(16).toString("hex");
    return {
      username,
      salt,
      hash: (await scrypt(body.password, salt, 64)).toString("hex"),
    };
  }
  async function middleware(req, res, next) {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/__edith_auth/")) return next();
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `${origin.protocol}//${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(403, { error: "Local workspace only" });
    if (req.method === "GET" && path === "/__edith_auth/status")
      return send(200, {
        mode: "team",
        initialized: users.length > 0,
        user: identity(req) ? publicUser(identity(req)) : null,
      });
    const user = identity(req);
    if (path === "/__edith_auth/users" && req.method === "GET") {
      if (user?.role !== "admin") return send(403, { error: "Admin required" });
      return send(200, { users: users.map(publicUser) });
    }
    if (req.method !== "POST") return send(405, { error: "Use POST" });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return send(415, { error: "JSON required" });
    let body;
    try {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (Buffer.byteLength(text) > 4096)
          return send(413, { error: "Request too large" });
      }
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      return send(400, { error: "Invalid JSON" });
    }
    try {
      if (path === "/__edith_auth/setup")
        return await serialize(async () => {
          if (users.length)
            return send(409, { error: "Owner already configured" });
          if (
            typeof body.setupToken !== "string" ||
            digest(body.setupToken) !== digest(setupToken)
          )
            return send(403, { error: "Invalid setup token" });
          const c = await credentials(body),
            admin = {
              ...c,
              id: randomBytes(16).toString("hex"),
              role: "admin",
              disabled: false,
            };
          await persist([admin]);
          session(res, admin);
          send(201, { user: publicUser(admin) });
        });
      if (path === "/__edith_auth/login") {
        const ip = req.socket.remoteAddress || "local";
        let rate = attempts.get(ip);
        if (!rate || rate.until < now()) {
          rate = { count: 0, until: now() + 60000 };
          if (attempts.size > 128) attempts.clear();
          attempts.set(ip, rate);
        }
        if (++rate.count > 10)
          return send(429, { error: "Too many attempts; retry in a minute" });
        const found = users.find(
          (u) =>
            u.username ===
            String(body.username || "")
              .trim()
              .toLowerCase(),
        );
        const password =
          typeof body.password === "string" && body.password.length <= 256
            ? body.password
            : "";
        const hash = await scrypt(
          password,
          found?.salt || "00000000000000000000000000000000",
          64,
        );
        if (
          !found ||
          found.disabled ||
          !timingSafeEqual(hash, Buffer.from(found.hash, "hex"))
        )
          return send(401, { error: "Invalid username or password" });
        session(res, found);
        return send(200, { user: publicUser(found) });
      }
      if (path === "/__edith_auth/logout") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("edith_session="))
          ?.slice(14);
        if (token) sessions.delete(digest(token));
        cookie(res, "", 0);
        return send(200, { ok: true });
      }
      if (user?.role !== "admin") return send(403, { error: "Admin required" });
      if (path === "/__edith_auth/users")
        return await serialize(async () => {
          if (identity(req)?.role !== "admin")
            return send(403, { error: "Admin required" });
          if (users.length >= 100)
            return send(409, { error: "Account limit reached" });
          if (!roles.has(body.role))
            return send(400, { error: "Invalid role" });
          const c = await credentials(body);
          if (users.some((u) => u.username === c.username))
            return send(409, { error: "Username already exists" });
          const created = {
            ...c,
            id: randomBytes(16).toString("hex"),
            role: body.role,
            disabled: false,
          };
          await persist([...users, created]);
          send(201, { user: publicUser(created) });
        });
      if (path === "/__edith_auth/users/update")
        return await serialize(async () => {
          if (identity(req)?.role !== "admin")
            return send(403, { error: "Admin required" });
          const target = users.find((u) => u.id === body.id);
          if (!target) return send(404, { error: "Account not found" });
          if (!roles.has(body.role) || typeof body.disabled !== "boolean")
            return send(400, { error: "Role and disabled flag required" });
          const next = users.map((u) =>
            u.id === body.id
              ? { ...u, role: body.role, disabled: body.disabled }
              : u,
          );
          if (!next.some((u) => u.role === "admin" && !u.disabled))
            return send(409, { error: "Keep at least one active Admin" });
          await persist(next);
          for (const [key, s] of sessions)
            if (s.userId === target.id) sessions.delete(key);
          send(200, { ok: true });
        });
      send(404, { error: "Unknown account action" });
    } catch (error) {
      send(400, {
        error: ["EACCES", "ENOSPC"].includes(error.code)
          ? "Unable to save accounts"
          : error.message,
      });
    }
  }
  return {
    middleware,
    identity,
    initialized: () => users.length > 0,
    setupToken,
  };
}
