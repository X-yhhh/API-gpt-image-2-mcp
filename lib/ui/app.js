const DEFAULT_MODEL = "gpt-image-2";
const SOURCE_LABELS = {
  env: "From env",
  file: "From file",
  default: "Default"
};

const elements = {
  form: document.querySelector("#config-form"),
  baseUrl: document.querySelector("#base-url"),
  apiKey: document.querySelector("#api-key"),
  model: document.querySelector("#model"),
  saveButton: document.querySelector("#save-button"),
  reloadButton: document.querySelector("#reload-button"),
  toggleApiKey: document.querySelector("#toggle-api-key"),
  useDefaultModel: document.querySelector("#use-default-model"),
  copyConfigPath: document.querySelector("#copy-config-path"),
  configPath: document.querySelector("#config-path"),
  overrideBanner: document.querySelector("#override-banner"),
  formStatus: document.querySelector("#form-status"),
  formError: document.querySelector("#form-error"),
  liveStatus: document.querySelector("#live-status"),
  sourceBaseUrl: document.querySelector("#source-baseUrl"),
  sourceApiKey: document.querySelector("#source-apiKey"),
  sourceModel: document.querySelector("#source-model"),
  errorBaseUrl: document.querySelector("#error-baseUrl"),
  errorApiKey: document.querySelector("#error-apiKey"),
  errorModel: document.querySelector("#error-model")
};

let currentState;
let isBusy = false;

function preferredFieldValue(field, state) {
  return state.fileConfig?.[field] || state.effectiveConfig?.[field] || "";
}

function setBusy(nextBusy) {
  isBusy = nextBusy;
  elements.baseUrl.disabled = nextBusy;
  elements.apiKey.disabled = nextBusy;
  elements.model.disabled = nextBusy;
  elements.saveButton.disabled = nextBusy;
  elements.reloadButton.disabled = nextBusy;
  elements.toggleApiKey.disabled = nextBusy;
  elements.useDefaultModel.disabled = nextBusy;
  elements.copyConfigPath.disabled = nextBusy;
}

function setStatus(message, tone = "default") {
  elements.formStatus.textContent = message;
  elements.formStatus.dataset.tone = tone;
  elements.liveStatus.textContent = message;
}

function setFormError(message = "") {
  elements.formError.textContent = message;
  elements.formError.classList.toggle("hidden", !message);
}

function clearFieldErrors() {
  elements.errorBaseUrl.textContent = "";
  elements.errorApiKey.textContent = "";
  elements.errorModel.textContent = "";
}

function setFieldErrors(errors = {}) {
  elements.errorBaseUrl.textContent = errors.baseUrl || "";
  elements.errorApiKey.textContent = errors.apiKey || "";
  elements.errorModel.textContent = errors.model || "";
}

function updateSourceBadge(element, source) {
  element.textContent = SOURCE_LABELS[source] || "Default";
  element.dataset.source = source || "default";
}

function applyState(state) {
  currentState = state;
  elements.configPath.textContent = state.configPath || "Unavailable";
  elements.baseUrl.value = preferredFieldValue("baseUrl", state);
  elements.apiKey.value = preferredFieldValue("apiKey", state);
  elements.model.value = preferredFieldValue("model", state);

  updateSourceBadge(elements.sourceBaseUrl, state.fieldSources?.baseUrl);
  updateSourceBadge(elements.sourceApiKey, state.fieldSources?.apiKey);
  updateSourceBadge(elements.sourceModel, state.fieldSources?.model);

  elements.overrideBanner.classList.toggle("hidden", !state.hasOverrides);
  if (state.hasOverrides) {
    elements.overrideBanner.textContent =
      "Environment variables are overriding one or more saved fields. Saving still updates the real config file.";
  }
}

function validateConfig(payload) {
  const errors = {};

  if (!payload.baseUrl) {
    errors.baseUrl = "Base URL must be a valid URL.";
  } else {
    try {
      new URL(payload.baseUrl);
    } catch {
      errors.baseUrl = "Base URL must be a valid URL.";
    }
  }

  if (!payload.apiKey) {
    errors.apiKey = "API key is required.";
  }

  if (!payload.model) {
    errors.model = "Model is required.";
  }

  return errors;
}

function collectPayload() {
  return {
    baseUrl: elements.baseUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value.trim()
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function loadConfig(showMessage = false) {
  clearFieldErrors();
  setFormError("");
  setBusy(true);
  setStatus("Loading config…");

  try {
    const response = await fetch("/api/config");
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error?.message || "Failed to load runtime config.");
    }

    applyState(payload);
    setStatus(showMessage ? "Config reloaded." : "Ready.", "default");
  } catch (error) {
    setStatus("Unable to load config.", "error");
    setFormError(error instanceof Error ? error.message : "Unable to load config.");
  } finally {
    setBusy(false);
  }
}

async function saveConfig(event) {
  event.preventDefault();

  const payload = collectPayload();
  const errors = validateConfig(payload);

  clearFieldErrors();
  setFormError("");

  if (Object.keys(errors).length > 0) {
    setFieldErrors(errors);
    setStatus("Fix the highlighted fields before saving.", "error");
    return;
  }

  setBusy(true);
  setStatus("Saving config…");

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const responseBody = await readJsonResponse(response);

    if (response.status === 400 && responseBody.error?.fields) {
      setFieldErrors(responseBody.error.fields);
      setStatus("Fix the highlighted fields before saving.", "error");
      return;
    }

    if (!response.ok) {
      throw new Error(responseBody.error?.message || "Failed to save runtime config.");
    }

    applyState(responseBody);
    setStatus("Config saved to file.", "success");
  } catch (error) {
    setStatus("Unable to save config.", "error");
    setFormError(error instanceof Error ? error.message : "Unable to save config.");
  } finally {
    setBusy(false);
  }
}

async function copyConfigPath() {
  if (!currentState?.configPath) {
    setStatus("No config path is available to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(currentState.configPath);
    setStatus("Config path copied.", "success");
  } catch {
    setStatus("Clipboard access is unavailable in this browser.", "error");
  }
}

function toggleApiKeyVisibility() {
  const showPlainText = elements.apiKey.type === "password";
  elements.apiKey.type = showPlainText ? "text" : "password";
  elements.toggleApiKey.textContent = showPlainText ? "Hide key" : "Show key";
}

function useDefaultModel() {
  elements.model.value = DEFAULT_MODEL;
  setStatus("Default model inserted.", "default");
}

elements.form.addEventListener("submit", saveConfig);
elements.reloadButton.addEventListener("click", () => {
  void loadConfig(true);
});
elements.toggleApiKey.addEventListener("click", toggleApiKeyVisibility);
elements.useDefaultModel.addEventListener("click", useDefaultModel);
elements.copyConfigPath.addEventListener("click", () => {
  void copyConfigPath();
});

void loadConfig(false);
