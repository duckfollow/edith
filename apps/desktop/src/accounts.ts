import { createLoading } from "./components/loading";
import { loadAccessPolicy } from "./access-policy";
import { icon } from "./icons";
import "./accounts.css";
const LOADING_MINIMUM_DURATION_MS = 1500;
type User = { id: string; username: string; role: string; disabled: boolean };
export function mountAccounts(section: HTMLElement) {
  const heading = document.createElement("div");
  heading.className = "wb-title-row";
  heading.innerHTML =
    '<div><div class="wb-eyebrow">TEAM WORKSPACE</div><h1>Account management</h1><p>Manage who can access this workspace.</p></div>';
  const status = document.createElement("p");
  status.className = "account-status";
  status.setAttribute("role", "status");
  const body = document.createElement("div");
  section.classList.add("accounts-page");
  const summary = document.createElement("div");
  summary.className = "account-summary";
  summary.hidden = true;
  section.append(heading, status, summary, body);
  async function api(path: string, method = "GET", data?: unknown) {
    const response = await fetch(`/__edith_auth/${path}`, {
      method,
      headers: method === "GET" ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Account request failed");
    return result;
  }
  function message(error: unknown) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
  function form(
    markup: string,
    submit: (data: Record<string, string>) => Promise<void>,
  ) {
    const f = document.createElement("form");
    f.className = "account-form";
    f.innerHTML = markup;
    const note = document.createElement("p");
    note.setAttribute("role", "status");
    f.append(note);
    f.onsubmit = async (event) => {
      event.preventDefault();
      const button = f.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      )!;
      if (f.getAttribute("aria-busy") === "true") return;
      const values = Object.fromEntries(new FormData(f).entries()) as Record<
        string,
        string
      >;
      const originalLabel = button.textContent || "Continue";
      const loader = createLoading({
        label: "Please wait…",
        compact: true,
        minimumDurationMs: LOADING_MINIMUM_DURATION_MS,
      });
      f.setAttribute("aria-busy", "true");
      button.disabled = true;
      button.replaceChildren(loader.element);
      note.textContent = "";
      try {
        await submit(values);
        note.textContent = "";
      } catch (error) {
        note.textContent =
          error instanceof Error ? error.message : "Request failed";
      } finally {
        await loader.waitForMinimum();
        f.removeAttribute("aria-busy");
        loader.destroy();
        button.textContent = originalLabel;
        button.disabled = false;
      }
    };
    return f;
  }
  const credentials =
    '<label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>';
  const sessionDialog = document.createElement("dialog");
  sessionDialog.className = "account-login account-session-loading";
  sessionDialog.setAttribute("aria-label", "Checking workspace session");
  sessionDialog.addEventListener("cancel", (event) => event.preventDefault());
  const initialLoading = createLoading({
    minimumDurationMs: LOADING_MINIMUM_DURATION_MS,
    label: "Opening your workspace",
    description: "Checking your session and access.",
  });
  let activeSessionLoading = initialLoading;
  sessionDialog.append(initialLoading.element);
  document.body.append(sessionDialog);
  sessionDialog.showModal();
  async function finishSessionLoading() {
    await activeSessionLoading.waitForMinimum();
    if (!sessionDialog.isConnected) return;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionDialog.classList.add("is-leaving");
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
    sessionDialog.close();
    sessionDialog.remove();
    document
      .querySelector<HTMLElement>('.wb-nav-button[aria-current="page"]')
      ?.focus({ preventScroll: true });
  }
  function login(initialized: boolean) {
    const dialog = sessionDialog;
    dialog.replaceChildren();
    dialog.className = "account-login";
    dialog.setAttribute(
      "aria-label",
      initialized ? "Log in to EDITH" : "Create EDITH owner",
    );
    dialog.addEventListener("cancel", (e) => e.preventDefault());
    const h = document.createElement("h2");
    h.textContent = initialized
      ? "Welcome to EDITH"
      : "Create your workspace owner";
    const p = document.createElement("p");
    p.textContent = initialized
      ? "Sign in with your workspace account."
      : "Use the setup token shown in the EDITH server terminal. Passwords must contain at least 12 characters.";
    const f = form(
      (initialized
        ? ""
        : '<label>Setup token<input name="setupToken" type="password" required autocomplete="off"></label>') +
        credentials.replace(
          'autocomplete="current-password"',
          initialized
            ? 'autocomplete="current-password"'
            : 'autocomplete="new-password" minlength="12"',
        ) +
        `<button type="submit">${initialized ? "Log in" : "Create Admin"}</button>`,
      async (data) => {
        await api(initialized ? "login" : "setup", "POST", data);
        const policy = await loadAccessPolicy();
        if (policy.role === "unavailable")
          throw Error("Signed in, but unable to load permissions. Try again.");
        window.dispatchEvent(new Event("edith-access-policy"));
        const loading = createLoading({
          minimumDurationMs: LOADING_MINIMUM_DURATION_MS,
          label: "Preparing your workspace",
          description: "Applying your account permissions.",
        });
        activeSessionLoading = loading;
        dialog.classList.add("account-session-loading");
        dialog.replaceChildren(loading.element);
        await refresh();
      },
    );
    const brand = document.createElement("div");
    brand.className = "account-login-brand";
    const mark = document.createElement("span");
    mark.textContent = "E";
    mark.className = "account-login-mark";
    const brandText = document.createElement("div");
    brandText.innerHTML =
      "<strong>EDITH</strong><span>DEVELOPER WORKSPACE</span>";
    brand.append(mark, brandText);
    const mode = document.createElement("span");
    mode.className = "account-login-mode";
    mode.append(
      icon("shield"),
      document.createTextNode(initialized ? "Team access" : "First-time setup"),
    );
    const intro = document.createElement("div");
    intro.className = "account-login-intro";
    intro.append(mode, h, p);
    h.textContent = initialized
      ? "Sign in to your workspace"
      : "Set up your workspace";
    const username = f.querySelector<HTMLInputElement>(
      'input[name="username"]',
    )!;
    username.placeholder = "Your username";
    username.autocapitalize = "none";
    username.spellcheck = false;
    username.autofocus = true;
    const password = f.querySelector<HTMLInputElement>(
      'input[name="password"]',
    )!;
    password.placeholder = initialized
      ? "Enter your password"
      : "At least 12 characters";
    const passwordWrap = document.createElement("div");
    passwordWrap.className = "account-password-field";
    password.before(passwordWrap);
    passwordWrap.append(password);
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "account-password-toggle";
    reveal.setAttribute("aria-label", "Show password");
    reveal.setAttribute("aria-pressed", "false");
    reveal.append(icon("eye"));
    reveal.onclick = (event) => {
      event.preventDefault();
      const visible = password.type === "password";
      password.type = visible ? "text" : "password";
      reveal.replaceChildren(icon(visible ? "eyeOff" : "eye"));
      reveal.setAttribute(
        "aria-label",
        visible ? "Hide password" : "Show password",
      );
      reveal.setAttribute("aria-pressed", String(visible));
    };
    passwordWrap.append(reveal);
    const caps = document.createElement("small");
    caps.className = "account-caps-warning";
    caps.hidden = true;
    caps.textContent = "Caps Lock is on";
    caps.setAttribute("role", "status");
    passwordWrap.after(caps);
    const checkCaps = (event: KeyboardEvent) => {
      caps.hidden = !event.getModifierState("CapsLock");
    };
    password.addEventListener("keydown", checkCaps);
    password.addEventListener("keyup", checkCaps);
    const submit = f.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.textContent = initialized ? "Sign in" : "Create workspace owner";
    const footer = document.createElement("div");
    footer.className = "account-login-footer";
    footer.append(icon("shield"));
    const help = document.createElement("p");
    help.textContent = initialized
      ? "Need an account? Ask your workspace Admin."
      : "Your first account receives Admin access. Keep the setup token private.";
    footer.append(help);
    dialog.append(brand, intro, f, footer);
    // Keep the same modal/backdrop across session check, login and success.
    username.focus({ preventScroll: true });
  }
  let signedIn = false;
  let teamDetected = false;
  async function refresh() {
    try {
      const state = await api("status");
      if (state.mode !== "team") throw Error("Not in Team mode");
      teamDetected = true;
      if (!state.user) {
        await activeSessionLoading.waitForMinimum();
        login(state.initialized);
        status.textContent = "Login required";
        return;
      }
      signedIn = true;
      const user = state.user as User;
      status.textContent = `Signed in as ${user.username} · ${user.role}`;
      const logout = document.createElement("button");
      logout.textContent = "Log out";
      logout.onclick = async () => {
        try {
          await api("logout", "POST", {});
          location.reload();
        } catch (error) {
          message(error);
        }
      };
      logout.prepend(icon("unplug"));
      const session = document.createElement("div");
      session.className = "account-session";
      const sessionName = document.createElement("span");
      sessionName.textContent = `${user.username} · ${user.role}`;
      session.append(sessionName, logout);
      heading.append(session);
      if (user.role !== "admin") {
        body.textContent =
          "Only Admins can manage accounts. You can use the tools allowed by your role.";
        await finishSessionLoading();
        return;
      }
      const panel = document.createElement("section");
      panel.className = "account-members";
      panel.setAttribute("aria-label", "Workspace members");
      const panelHeading = document.createElement("div");
      panelHeading.className = "account-members-heading";
      const panelTitle = document.createElement("div");
      panelTitle.innerHTML =
        "<h2>Workspace members</h2><p>Choose a role and apply changes to update access.</p>";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = "Add account";
      addButton.prepend(icon("plug"));
      addButton.onclick = () => {
        create.scrollIntoView({ behavior: "smooth", block: "center" });
        create
          .querySelector<HTMLInputElement>("input")
          ?.focus({ preventScroll: true });
      };
      panelHeading.append(panelTitle, addButton);
      const filters = document.createElement("div");
      filters.className = "account-filters";
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = "Search username…";
      search.setAttribute("aria-label", "Search accounts");
      const roleFilter = document.createElement("select");
      roleFilter.setAttribute("aria-label", "Filter account role");
      for (const value of ["all", "admin", "developer", "viewer"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent =
          value === "all"
            ? "All roles"
            : value[0].toUpperCase() + value.slice(1);
        roleFilter.append(option);
      }
      filters.append(search, roleFilter);
      const list = document.createElement("div");
      list.className = "account-list";
      const count = document.createElement("p");
      count.className = "account-match-count";
      panel.append(panelHeading, filters, list, count);
      let accounts: User[] = [];
      search.oninput = () => void renderUsers(false);
      roleFilter.onchange = () => void renderUsers(false);
      async function renderUsers(fetchLatest = true) {
        if (fetchLatest) {
          const data = await api("users");
          accounts = data.users;
        }
        summary.hidden = false;
        summary.replaceChildren();
        for (const [label, value] of [
          ["Total accounts", accounts.length],
          ["Active members", accounts.filter((a) => !a.disabled).length],
          [
            "Administrators",
            accounts.filter((a) => a.role === "admin" && !a.disabled).length,
          ],
        ]) {
          const card = document.createElement("div"),
            title = document.createElement("span"),
            number = document.createElement("strong");
          title.textContent = String(label);
          number.textContent = String(value);
          card.append(title, number);
          summary.append(card);
        }
        list.replaceChildren();
        const filtered = accounts.filter(
          (a) =>
            a.username.includes(search.value.trim().toLowerCase()) &&
            (roleFilter.value === "all" || a.role === roleFilter.value),
        );
        count.textContent = `${filtered.length} of ${accounts.length} accounts · Changes revoke existing sessions`;
        if (!filtered.length) {
          const empty = document.createElement("p");
          empty.className = "account-empty";
          empty.textContent = "No accounts match these filters.";
          list.append(empty);
        }
        for (const account of filtered) {
          const row = document.createElement("div");
          row.className = "account-row";
          const name = document.createElement("strong");
          name.textContent = account.username;
          const identity = document.createElement("div");
          identity.className = "account-identity";
          const avatar = document.createElement("span");
          avatar.className = "account-avatar";
          avatar.textContent = account.username.slice(0, 2).toUpperCase();
          const details = document.createElement("div");
          const subtitle = document.createElement("small");
          subtitle.textContent =
            account.id === user.id
              ? "Your account"
              : account.disabled
                ? "Access disabled"
                : "Workspace member";
          details.append(name, subtitle);
          identity.append(avatar, details);
          row.dataset.disabled = String(account.disabled);
          const role = document.createElement("select");
          role.setAttribute("aria-label", `Role for ${account.username}`);
          for (const value of ["viewer", "developer", "admin"]) {
            const option = document.createElement("option");
            option.value = value;
            option.text = value;
            role.append(option);
          }
          role.value = account.role;
          const label = document.createElement("label");
          const enabled = document.createElement("input");
          enabled.type = "checkbox";
          enabled.checked = !account.disabled;
          label.append(enabled, " Active");
          const save = document.createElement("button");
          save.textContent = "Apply";
          save.disabled = true;
          const changed = () => {
            save.disabled =
              role.value === account.role &&
              enabled.checked === !account.disabled;
            row.classList.toggle("has-changes", !save.disabled);
          };
          role.onchange = enabled.onchange = changed;
          save.onclick = async () => {
            save.disabled = true;
            try {
              await api("users/update", "POST", {
                id: account.id,
                role: role.value,
                disabled: !enabled.checked,
              });
              if (account.id === user.id) {
                location.reload();
                return;
              }
              status.textContent = `Updated ${account.username}. Existing sessions revoked.`;
              await renderUsers();
            } catch (error) {
              message(error);
            } finally {
              changed();
            }
          };
          row.append(identity, role, label, save);
          list.append(row);
        }
      }
      const create = form(
        '<div class="account-form-heading"><span>NEW MEMBER</span><h2>Add account</h2><p>Create credentials and choose an access level.</p></div>' +
          credentials.replace(
            'autocomplete="current-password"',
            'autocomplete="new-password" minlength="12"',
          ) +
          '<label>Role<select name="role"><option value="viewer">Viewer</option><option value="developer">Developer</option><option value="admin">Admin</option></select></label><div class="account-role-guide"><strong>Role guide</strong><span>Viewer — inspect masked data</span><span>Developer — manage Gateway and connections</span><span>Admin — manage accounts and full access</span></div><small class="account-password-hint">Use at least 12 characters. Share credentials privately.</small><button type="submit">Create account</button>',
        async (data) => {
          await api("users", "POST", data);
          create.reset();
          await renderUsers();
          status.textContent = "Account created";
        },
      );
      body.className = "account-layout";
      const createPanel = document.createElement("aside");
      createPanel.className = "account-create-panel";
      createPanel.append(create);
      body.append(panel, createPanel);
      await renderUsers();
      await finishSessionLoading();
      // Revoked/expired sessions must not leave previously privileged data visible indefinitely.
    } catch {
      if (teamDetected) {
        status.textContent = "Account service unavailable. Refresh to retry.";
        sessionDialog.replaceChildren();
        const error = document.createElement("p");
        error.textContent =
          "Unable to open the workspace. Refresh this page to retry.";
        sessionDialog.append(error);
        return;
      }
      section.classList.add("is-local-workspace");
      heading.innerHTML = '<div><div class="wb-eyebrow">WORKSPACE SETTINGS</div><h1>Workspace &amp; access</h1><p>Your workspace, your access. Choose how you work with EDITH.</p></div><span class="management-mode"><span></span>Local mode</span>';
      status.textContent = "";
      body.className = "management-local";
      body.innerHTML = `
        <section class="management-owner-card" aria-labelledby="management-owner-title">
          <div class="management-card-top"><span class="management-symbol" data-management-icon="shield"></span><span class="management-tag">CURRENT WORKSPACE</span></div>
          <h2 id="management-owner-title">A workspace of your own.</h2>
          <p>Get straight to debugging. Local mode gives you full workspace access without signing in.</p>
          <div class="management-owner"><span class="management-avatar">E</span><div><strong>Local owner</strong><small>This device</small></div><span class="management-role">Admin</span></div>
          <dl class="management-facts"><div><dt>Sign-in</dt><dd>Not required</dd></div><div><dt>Workspace access</dt><dd>Full access</dd></div><div><dt>Account management</dt><dd>Available in Team mode</dd></div></dl>
          <button type="button" data-management="open-network">Open Network Inspector <span aria-hidden="true">→</span></button>
        </section>
        <section class="management-team-card" aria-labelledby="management-team-title">
          <div class="management-card-top"><span class="management-symbol" data-management-icon="network"></span><span class="management-tag">WORK WITH A TEAM</span></div>
          <h2 id="management-team-title">Give everyone the right access.</h2>
          <p>Team mode adds sign-in and accounts with roles for your workspace.</p>
          <ul class="management-benefits"><li><strong>Individual accounts</strong><span>Create and manage workspace members.</span></li><li><strong>Access by role</strong><span>Choose Admin, Developer or Viewer permissions.</span></li><li><strong>Session controls</strong><span>Disable accounts and revoke existing sessions.</span></li></ul>
          <details class="management-team-guide"><summary>Set up Team mode <span aria-hidden="true">↗</span></summary><div><p>Stop the current development server, then run this from the EDITH project folder:</p><div class="management-command"><code>npm run dev:team</code><button type="button" data-management="copy">Copy command</button></div><p>Open <a href="http://127.0.0.1:1420/">127.0.0.1:1420</a> and use the setup token printed in the terminal to create your first Admin.</p><small>Available in the development runtime. Switching modes requires a server restart.</small><p role="status" data-management="copy-status"></p></div></details>
        </section>
        <div class="management-local-note"><span data-management-icon="info"></span><p>Local mode is ready to use. Switch to Team mode when you need separate accounts and roles.</p></div>`;
      for (const name of ["shield", "network", "info"] as const) {
        body.querySelector(`[data-management-icon="${name}"]`)!.append(icon(name));
      }
      body.querySelector<HTMLButtonElement>('[data-management="open-network"]')!.onclick = () => {
        document.querySelector<HTMLButtonElement>('.wb-nav-button[data-tool="network"]')?.click();
      };
      body.querySelector<HTMLButtonElement>('[data-management="copy"]')!.onclick = async () => {
        const feedback = body.querySelector<HTMLElement>('[data-management="copy-status"]')!;
        try { await navigator.clipboard.writeText("npm run dev:team"); feedback.textContent = "Command copied."; }
        catch { feedback.textContent = "Select and copy the command above."; }
      };
      await finishSessionLoading();
    }
  }
  void refresh();
  const timer = setInterval(async () => {
    try {
      const state = await api("status");
      if (state.user) signedIn = true;
      else if (signedIn) location.reload();
    } catch {
      /* Dev server may be offline. */
    }
  }, 15000);
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
}
