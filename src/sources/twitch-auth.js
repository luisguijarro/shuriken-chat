// Shuriken Chat: sesión de Twitch (opcional) con el flujo de "código de dispositivo".
// La app muestra un código, el usuario lo introduce en twitch.tv/activate y listo:
// sin contraseñas ni secretos en la app (cliente "público" de Twitch).
//
// Los tokens se guardan aparte de config.json (twitch-auth.json), cifrados con el
// llavero del sistema (safeStorage: KWallet / libsecret / DPAPI) cuando está disponible.
"use strict";

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

/** Client ID de la app registrada en dev.twitch.tv (es público: se puede incluir en el código). */
const DEFAULT_CLIENT_ID = "";

// Permisos que pedimos. Al añadir alguno, los usuarios tendrán que volver a iniciar sesión.
const SCOPES = ["moderator:manage:automod"];

const TIMEOUT_MS = 15000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function postForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

class TwitchAuth extends EventEmitter {
  /**
   * @param {string} dir carpeta de configuración
   * @param {object} [safeStorage] el de Electron (inyectable para tests)
   */
  constructor(dir, safeStorage = null) {
    super();
    this.file = path.join(dir, "twitch-auth.json");
    this.safeStorage = safeStorage;
    this.session = null; // { clientId, accessToken, refreshToken, expiresAt, userId, login, scopes }
    this.pending = null; // inicio de sesión en curso
    this.refreshing = null;
    this.load();
  }

  get loggedIn() {
    return !!(this.session && this.session.accessToken);
  }

  status() {
    return this.loggedIn
      ? { loggedIn: true, login: this.session.login, userId: this.session.userId }
      : { loggedIn: false };
  }

  // ---------- Almacenamiento ----------

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      const json = raw.encrypted
        ? this.safeStorage.decryptString(Buffer.from(raw.data, "base64"))
        : raw.data;
      this.session = JSON.parse(json);
    } catch {
      this.session = null;
    }
  }

  save() {
    try {
      if (!this.session) {
        fs.rmSync(this.file, { force: true });
        return;
      }
      const json = JSON.stringify(this.session);
      const canEncrypt = !!(this.safeStorage && this.safeStorage.isEncryptionAvailable());
      const out = canEncrypt
        ? { encrypted: true, data: this.safeStorage.encryptString(json).toString("base64") }
        : { encrypted: false, data: json };
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(out), { mode: 0o600 });
    } catch (e) {
      console.warn("[shuriken] no se pudo guardar la sesión de Twitch:", e.message);
    }
  }

  // ---------- Inicio de sesión (código de dispositivo) ----------

  /**
   * Pide un código. Devuelve { userCode, verificationUri, expiresIn } y deja en
   * `this.pending.done` una promesa que se resuelve al completar el inicio de sesión.
   */
  async startLogin(clientId) {
    if (!clientId) throw new Error("Falta el Client ID de la app de Twitch.");
    this.cancelLogin();
    const r = await postForm("https://id.twitch.tv/oauth2/device", { client_id: clientId, scopes: SCOPES.join(" ") });
    if (!r.ok) throw new Error(`Twitch rechazó la petición (${r.status}): ${r.data.message || "Client ID no válido"}`);
    const d = r.data;
    const pending = { cancelled: false };
    pending.done = this.poll(clientId, d.device_code, (d.interval || 5) * 1000, Date.now() + d.expires_in * 1000, pending);
    this.pending = pending;
    return { userCode: d.user_code, verificationUri: d.verification_uri, expiresIn: d.expires_in };
  }

  cancelLogin() {
    if (this.pending) this.pending.cancelled = true;
    this.pending = null;
  }

  async poll(clientId, deviceCode, interval, deadline, pending) {
    while (!pending.cancelled) {
      await new Promise((r) => setTimeout(r, interval));
      if (pending.cancelled) break;
      if (Date.now() > deadline) throw new Error("El código ha caducado. Vuelve a intentarlo.");
      const r = await postForm("https://id.twitch.tv/oauth2/token", {
        client_id: clientId,
        scopes: SCOPES.join(" "),
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      if (r.ok) {
        await this.adopt(clientId, r.data);
        if (this.pending === pending) this.pending = null;
        return this.status();
      }
      const msg = String(r.data.message || "");
      if (msg === "authorization_pending") continue;
      if (msg === "slow_down") {
        interval += 5000;
        continue;
      }
      throw new Error(msg === "access_denied" ? "Has cancelado el inicio de sesión." : `Twitch: ${msg || r.status}`);
    }
    throw new Error("Inicio de sesión cancelado.");
  }

  /** Guarda los tokens y averigua de quién son. */
  async adopt(clientId, tok) {
    const v = await this.validate(tok.access_token);
    this.session = {
      clientId,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
      userId: v.user_id,
      login: v.login,
      scopes: v.scopes || [],
    };
    this.save();
    this.emit("change", this.status());
  }

  async validate(token) {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("token no válido");
    return res.json();
  }

  // ---------- Tokens ----------

  /** Token válido (lo renueva si está a punto de caducar). */
  async token() {
    if (!this.loggedIn) throw new Error("No has iniciado sesión en Twitch.");
    if (Date.now() > this.session.expiresAt - REFRESH_MARGIN_MS) await this.refresh();
    return this.session.accessToken;
  }

  /** Renueva el token. Los refresh tokens de clientes públicos son de un solo uso. */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const s = this.session;
        const r = await postForm("https://id.twitch.tv/oauth2/token", {
          client_id: s.clientId,
          grant_type: "refresh_token",
          refresh_token: s.refreshToken,
        });
        if (!r.ok) {
          // Sesión caducada (más de 30 días sin uso) o revocada: hay que volver a entrar.
          this.session = null;
          this.save();
          this.emit("change", this.status());
          throw new Error("La sesión de Twitch ha caducado. Vuelve a iniciar sesión.");
        }
        Object.assign(this.session, {
          accessToken: r.data.access_token,
          refreshToken: r.data.refresh_token || s.refreshToken,
          expiresAt: Date.now() + (r.data.expires_in || 3600) * 1000,
        });
        this.save();
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Llamada a la API Helix con el token del usuario (reintenta una vez si caducó). */
  async helix(method, pathAndQuery, body) {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const res = await fetch(`https://api.twitch.tv/helix/${pathAndQuery}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": this.session.clientId,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 && attempt === 0) {
        await this.refresh();
        continue;
      }
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    }
  }

  async logout() {
    this.cancelLogin();
    const s = this.session;
    this.session = null;
    this.save();
    this.emit("change", this.status());
    if (s) {
      // Revoca el token en Twitch (si falla, igualmente ya no lo guardamos).
      await postForm("https://id.twitch.tv/oauth2/revoke", { client_id: s.clientId, token: s.accessToken }).catch(() => {});
    }
  }
}

module.exports = { TwitchAuth, DEFAULT_CLIENT_ID, SCOPES };
