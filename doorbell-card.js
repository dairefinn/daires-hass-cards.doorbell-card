class DoorbellCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.camera && !config.doorbell && !config.motion) {
      throw new Error("You must define at least one of: camera, doorbell, motion");
    }
    this._config = config;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  _getState(entityId) {
    if (!entityId || !this._hass) return null;
    return this._hass.states[entityId] ?? null;
  }

  // Works for both binary_sensor (state "on"/"off") and event entities
  // (state is an ISO timestamp; active = fired within windowMs)
  _isActive(entityId, state, windowMs = 30000) {
    if (!state || state.state === "unavailable" || state.state === "unknown") return false;
    if (entityId?.startsWith("event.")) {
      const ts = new Date(state.state);
      return !isNaN(ts) && (Date.now() - ts) < windowMs;
    }
    return state.state === "on";
  }

  _lastFired(entityId, state) {
    if (!state) return null;
    // event entities: state IS the ISO timestamp of the last firing
    if (entityId?.startsWith("event.")) return this._formatTime(state.state);
    return this._formatTime(state.attributes?.last_triggered);
  }

  _formatTime(timestamp) {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (isNaN(date)) return null;
    const diffMins = Math.floor((Date.now() - date) / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  _primaryEntity() {
    const c = this._config;
    return c.doorbell ?? c.camera ?? c.motion ?? null;
  }

  _handleInteraction(trigger) {
    const interaction = (this._config.interactions ?? []).find(
      (i) => (i.trigger ?? "tap") === trigger
    );
    if (!interaction) return;
    const { action } = interaction;
    if (action === "more-info") {
      const entityId = interaction.entity ?? this._primaryEntity();
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }));
    } else if (action === "toggle") {
      const entityId = interaction.entity ?? this._primaryEntity();
      if (!entityId || !this._hass) return;
      this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
    } else if (action === "call-service") {
      if (!interaction.service || !this._hass) return;
      const [domain, service] = interaction.service.split(".");
      this._hass.callService(domain, service, interaction.service_data ?? {});
    } else if (action === "navigate") {
      if (!interaction.path) return;
      try { window.history.pushState(null, "", interaction.path); } catch (_) {}
      this.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    } else if (action === "url") {
      if (!interaction.url) return;
      window.open(interaction.url, interaction.target ?? "_blank");
    }
  }

  _attachInteractionListeners() {
    const interactions = this._config?.interactions;
    if (!interactions?.length) return;

    if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
      this._tapCount = 0;
    }

    const card = this.shadowRoot.querySelector(".card");
    if (!card) return;

    const triggers = new Set(interactions.map((i) => i.trigger ?? "tap"));
    card.style.cursor = "pointer";

    if (triggers.has("tap") || triggers.has("double_tap")) {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        this._tapCount = (this._tapCount ?? 0) + 1;
        if (this._tapCount === 1) {
          this._tapTimer = setTimeout(() => {
            this._tapCount = 0;
            this._tapTimer = null;
            this._handleInteraction("tap");
          }, 250);
        } else {
          clearTimeout(this._tapTimer);
          this._tapTimer = null;
          this._tapCount = 0;
          this._handleInteraction("double_tap");
        }
      });
    }

    if (triggers.has("hold")) {
      let holdTimer;
      const startHold = () => { holdTimer = setTimeout(() => this._handleInteraction("hold"), 500); };
      const cancelHold = () => clearTimeout(holdTimer);
      card.addEventListener("mousedown", startHold);
      card.addEventListener("mouseup", cancelHold);
      card.addEventListener("mouseleave", cancelHold);
      card.addEventListener("touchstart", startHold, { passive: true });
      card.addEventListener("touchend", cancelHold);
      card.addEventListener("touchcancel", cancelHold);
    }
  }

  _cameraSvg() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/>
    </svg>`;
  }

  _bellSvg(active) {
    const color = active
      ? "var(--primary-color, #03a9f4)"
      : "var(--secondary-text-color, #727272)";
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" style="transition:fill 0.6s ease;flex-shrink:0;">
      <path d="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21"/>
    </svg>`;
  }

  _motionSvg(active) {
    const color = active
      ? "var(--primary-color, #03a9f4)"
      : "var(--secondary-text-color, #727272)";
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" style="transition:fill 0.6s ease;flex-shrink:0;">
      <path d="M13,2.05V4.05C17.39,4.59 20.5,8.58 19.96,12.97C19.5,16.61 16.64,19.5 13,19.93V21.93C18.5,21.38 22.5,16.5 21.95,11C21.5,6.25 17.73,2.5 13,2.05M11,2.06C9.05,2.25 7.19,3 5.67,4.26L7.1,5.74C8.22,4.84 9.57,4.26 11,4.06V2.06M4.26,5.67C3,7.19 2.25,9.05 2.06,11H4.06C4.26,9.57 4.84,8.22 5.74,7.1L4.26,5.67M2.06,13C2.26,14.96 3.03,16.81 4.27,18.33L5.69,16.9C4.83,15.77 4.24,14.43 4.06,13H2.06M5.67,19.74C7.18,21 9.04,21.79 11,22V20C9.58,19.82 8.23,19.24 7.1,18.37L5.67,19.74M12,12A1,1 0 0,1 11,11A1,1 0 0,1 12,10A1,1 0 0,1 13,11A1,1 0 0,1 12,12M12,8A3,3 0 0,0 9,11A3,3 0 0,0 12,14A3,3 0 0,0 15,11A3,3 0 0,0 12,8Z"/>
    </svg>`;
  }

  static getConfigElement() {
    return document.createElement("daires-hass-cards-doorbell-card-editor");
  }

  static getStubConfig() {
    return { camera: "camera.example" };
  }

  _render() {
    if (!this._config) return;

    const config = this._config;
    const cameraState = this._getState(config.camera);
    const doorbellState = this._getState(config.doorbell);
    const motionState = this._getState(config.motion);

    const title =
      config.title ||
      cameraState?.attributes?.friendly_name ||
      doorbellState?.attributes?.friendly_name ||
      "Doorbell";

    const isRinging = this._isActive(config.doorbell, doorbellState);
    const isMotion = this._isActive(config.motion, motionState);

    const cameraUnavailable =
      config.camera && (!cameraState || cameraState.state === "unavailable");

    // Detach any existing stream before innerHTML wipe so it isn't destroyed
    const existingStream = this.shadowRoot.querySelector("hui-image, ha-camera-stream");
    if (existingStream) existingStream.remove();

    const doorbellLabel = !doorbellState
      ? "Unavailable"
      : isRinging
      ? "Ringing"
      : doorbellState.state === "unavailable"
      ? "Unavailable"
      : "Idle";

    const motionLabel = !motionState
      ? "Unavailable"
      : isMotion
      ? "Detected"
      : motionState.state === "unavailable"
      ? "Unavailable"
      : "Clear";

    const lastTime = this._lastFired(config.doorbell, doorbellState);

    const statusRows = [];

    if (config.doorbell) {
      statusRows.push(`
        <div class="row">
          ${this._bellSvg(isRinging)}
          <div class="row-info">
            <div class="row-name">Doorbell</div>
            <div class="row-status${isRinging ? " active" : ""}">
              ${doorbellLabel}${lastTime && !isRinging ? `<span class="time"> · ${lastTime}</span>` : ""}
            </div>
          </div>
          ${isRinging ? `<div class="badge">Ringing</div>` : ""}
        </div>
      `);
    }

    if (config.motion) {
      statusRows.push(`
        <div class="row">
          ${this._motionSvg(isMotion)}
          <div class="row-info">
            <div class="row-name">Motion</div>
            <div class="row-status${isMotion ? " active" : ""}">${motionLabel}</div>
          </div>
          ${isMotion ? `<div class="badge">Motion</div>` : ""}
        </div>
      `);
    }

    const cameraSection = config.camera
      ? `<div class="camera-wrap">
           ${cameraUnavailable ? `<div class="camera-placeholder">Unavailable</div>` : ""}
         </div>`
      : "";

    const statusSection = statusRows.length
      ? `<div class="status">${statusRows.join("")}</div>`
      : "";

    const hasDivider = config.camera && statusRows.length;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: var(--card-background-color, #ffffff);
          border-radius: 12px;
          padding: 16px;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .title {
          font-size: 14px;
          font-weight: 500;
          color: var(--secondary-text-color, #727272);
        }
        .header-icon {
          color: var(--secondary-text-color, #727272);
          display: flex;
          align-items: center;
        }
        .camera-wrap {
          width: 100%;
          ${config.camera_aspect_ratio ? `aspect-ratio: ${config.camera_aspect_ratio};` : ""}
          border-radius: 8px;
          overflow: hidden;
          background: #111;
          ${hasDivider ? "margin-bottom: 12px;" : ""}
        }
        .camera-placeholder {
          width: 100%;
          padding: 24px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--secondary-text-color, #727272);
        }
        .status {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .row-info { flex: 1; min-width: 0; }
        .row-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color, #212121);
        }
        .row-status {
          font-size: 13px;
          color: var(--secondary-text-color, #727272);
          margin-top: 2px;
          transition: color 0.6s ease;
        }
        .row-status.active { color: var(--primary-color, #03a9f4); }
        .time { color: var(--secondary-text-color, #727272); }
        .badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 10px;
          flex-shrink: 0;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          animation: pulse 1.5s ease infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      </style>
      <ha-card>
        <div class="card">
          <div class="header">
            <div class="title">${title}</div>
            <div class="header-icon">${this._cameraSvg()}</div>
          </div>
          ${cameraSection}
          ${statusSection}
        </div>
      </ha-card>
    `;
    this._attachInteractionListeners();

    console.debug("[doorbell-card] camera config:", config.camera);
    console.debug("[doorbell-card] cameraState:", cameraState);
    console.debug("[doorbell-card] cameraUnavailable:", cameraUnavailable);
    console.debug("[doorbell-card] hass present:", !!this._hass);
    console.debug("[doorbell-card] existingStream:", existingStream);

    if (config.camera && !cameraUnavailable && this._hass) {
      const wrap = this.shadowRoot.querySelector(".camera-wrap");
      console.debug("[doorbell-card] camera-wrap found:", wrap);
      if (wrap) {
        const tagName = "hui-image";
        const stream = (existingStream?.tagName?.toLowerCase() === tagName)
          ? existingStream
          : document.createElement(tagName);
        console.debug("[doorbell-card] stream element:", stream, "reused:", stream === existingStream);
        stream.style.cssText = "width:100%;height:auto;display:block;";
        stream.hass = this._hass;
        stream.cameraImage = config.camera;
        stream.cameraView = "live";
        wrap.appendChild(stream);
        console.debug("[doorbell-card] stream offsetWidth:", stream.offsetWidth, "offsetHeight:", stream.offsetHeight);
        console.debug("[doorbell-card] stream shadowRoot:", stream.shadowRoot);
        setTimeout(() => {
          console.debug("[doorbell-card] stream (250ms later) offsetWidth:", stream.offsetWidth, "offsetHeight:", stream.offsetHeight);
          console.debug("[doorbell-card] stream shadowRoot innerHTML:", stream.shadowRoot?.innerHTML);
        }, 250);
      }
    } else {
      console.debug("[doorbell-card] skipped stream mount — camera:", !!config.camera, "unavailable:", !!cameraUnavailable, "hass:", !!this._hass);
    }
  }
}

customElements.define("daires-hass-cards-doorbell-card", DoorbellCard);

class DoorbellCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    for (const id of ["camera", "doorbell", "motion"]) {
      const p = this.shadowRoot.getElementById(id);
      if (p) p.hass = hass;
    }
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: { ...this._config } },
      bubbles: true,
      composed: true,
    }));
  }

  _set(key, value) {
    if (value === "" || value === undefined || value === null) {
      delete this._config[key];
    } else {
      this._config[key] = value;
    }
    this._fire();
  }

  _render() {
    const c = this._config ?? {};
    this.shadowRoot.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 12px; padding: 16px 0; }
        .section { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary-text-color, #727272); padding-bottom: 4px; border-bottom: 1px solid var(--divider-color, #e0e0e0); margin-top: 8px; }
        .row { display: flex; flex-direction: column; gap: 4px; }
        label { font-size: 12px; color: var(--secondary-text-color, #727272); }
        input[type=text] { padding: 8px 10px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 6px; font-size: 14px; color: var(--primary-text-color, #212121); background: var(--card-background-color, #fff); box-sizing: border-box; width: 100%; }
        ha-entity-picker { display: block; }
      </style>
      <div class="form">
        <div class="section">Entities</div>
        <div class="row"><label>Camera</label><ha-entity-picker id="camera" allow-custom-entity></ha-entity-picker></div>
        <div class="row"><label>Doorbell sensor</label><ha-entity-picker id="doorbell" allow-custom-entity></ha-entity-picker></div>
        <div class="row"><label>Motion sensor</label><ha-entity-picker id="motion" allow-custom-entity></ha-entity-picker></div>

        <div class="section">Display</div>
        <div class="row"><label>Title</label><input id="title" type="text" placeholder="Doorbell" /></div>
        <div class="row"><label>Camera aspect ratio</label><input id="camera_aspect_ratio" type="text" placeholder="e.g. 9/16, 4/3, 1/1 (auto if blank)" /></div>
      </div>
    `;

    const pickers = [
      ["camera", ["camera"]],
      ["doorbell", ["binary_sensor", "event"]],
      ["motion", ["binary_sensor", "event"]],
    ];
    for (const [id, domains] of pickers) {
      const picker = this.shadowRoot.getElementById(id);
      picker.value = c[id] ?? "";
      picker.includeDomains = domains;
      if (this._hass) picker.hass = this._hass;
      picker.addEventListener("value-changed", (e) => this._set(id, e.detail.value));
    }

    const titleEl = this.shadowRoot.getElementById("title");
    titleEl.value = c.title ?? "";
    titleEl.addEventListener("change", (e) => this._set("title", e.target.value));

    const arEl = this.shadowRoot.getElementById("camera_aspect_ratio");
    arEl.value = c.camera_aspect_ratio ?? "";
    arEl.addEventListener("change", (e) => this._set("camera_aspect_ratio", e.target.value));
  }
}

customElements.define("daires-hass-cards-doorbell-card-editor", DoorbellCardEditor);
