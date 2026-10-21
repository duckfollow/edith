import { DatabaseSync } from "node:sqlite";
import { mkdir, chmod, readFile } from "node:fs/promises";
import { dirname } from "node:path";
function validateUsers(users) {
  if (
    !Array.isArray(users) ||
    !users.length ||
    users.length > 100 ||
    !users.every(
      (u) =>
        typeof u.id === "string" &&
        /^[a-z0-9][a-z0-9._-]{2,63}$/.test(u.username) &&
        ["viewer", "developer", "admin"].includes(u.role) &&
        typeof u.disabled === "boolean" &&
        /^[a-f0-9]{32}$/.test(u.salt) &&
        /^[a-f0-9]{128}$/.test(u.hash),
    ) ||
    !users.some((u) => u.role === "admin" && !u.disabled)
  )
    throw Error("Invalid legacy accounts store");
}
export async function openWorkspaceDatabase({ file, legacyAccounts } = {}) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try {
    await chmod(file, 0o600);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version > 1)
      throw Error("Database schema is newer than this EDITH version");
    db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('viewer','developer','admin')),disabled INTEGER NOT NULL CHECK(disabled IN (0,1)),salt TEXT NOT NULL,hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS gateway_configs(id TEXT PRIMARY KEY,port INTEGER NOT NULL UNIQUE,config TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 PRAGMA user_version=1; COMMIT;`);
    function transaction(task) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = task();
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    const insert = db.prepare(
      "INSERT INTO users(id,username,role,disabled,salt,hash) VALUES(?,?,?,?,?,?)",
    );
    function replaceUsers(users) {
      validateUsers(users);
      transaction(() => {
        db.exec("DELETE FROM users");
        for (const u of users)
          insert.run(
            u.id,
            u.username,
            u.role,
            Number(u.disabled),
            u.salt,
            u.hash,
          );
      });
    }
    if (
      legacyAccounts &&
      !db
        .prepare("SELECT value FROM metadata WHERE key='legacy_accounts_v1'")
        .get()
    ) {
      let saved;
      try {
        saved = JSON.parse(await readFile(legacyAccounts, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (saved) {
        if (saved.version !== 1)
          throw Error("Unsupported legacy accounts format");
        validateUsers(saved.users);
        transaction(() => {
          if (db.prepare("SELECT count(*) AS n FROM users").get().n === 0)
            for (const u of saved.users)
              insert.run(
                u.id,
                u.username,
                u.role,
                Number(u.disabled),
                u.salt,
                u.hash,
              );
          db.prepare("INSERT INTO metadata(key,value) VALUES(?,?)").run(
            "legacy_accounts_v1",
            new Date().toISOString(),
          );
        });
      }
    }
    return {
      loadUsers: () =>
        db
          .prepare("SELECT * FROM users ORDER BY rowid")
          .all()
          .map((u) => ({ ...u, disabled: !!u.disabled })),
      saveUsers: replaceUsers,
      loadGateways: () =>
        db
          .prepare("SELECT id,config FROM gateway_configs ORDER BY rowid")
          .all()
          .map((r) => ({ id: r.id, config: JSON.parse(r.config) })),
      saveGateway(id, config) {
        transaction(() => {
          if (
            !db.prepare("SELECT id FROM gateway_configs WHERE id=?").get() &&
            db.prepare("SELECT count(*) AS n FROM gateway_configs").get().n >= 8
          )
            throw Error("Up to 8 saved Gateways");
          db.prepare(
            "INSERT INTO gateway_configs(id,port,config,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET port=excluded.port,config=excluded.config,updated_at=excluded.updated_at",
          ).run(
            id,
            config.port,
            JSON.stringify(config),
            new Date().toISOString(),
          );
        });
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
