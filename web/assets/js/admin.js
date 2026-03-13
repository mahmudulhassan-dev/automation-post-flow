const defaultApiBase =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8080/api"
    : "/api";

const state = {
  apiBase: localStorage.getItem("amanaflow:apiBase") || defaultApiBase,
  adminToken: localStorage.getItem("amanaflow:adminToken") || "",
  features: []
};

function $(id) {
  return document.getElementById(id);
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": state.adminToken
  };
}

async function adminGet(path) {
  const response = await fetch(`${state.apiBase}${path}`, {
    headers: { "x-admin-token": state.adminToken }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `GET ${path} failed`);
  }
  return data;
}

async function adminPut(path, payload) {
  const response = await fetch(`${state.apiBase}${path}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `PUT ${path} failed`);
  }
  return data;
}

async function adminPatch(path, payload) {
  const response = await fetch(`${state.apiBase}${path}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `PATCH ${path} failed`);
  }
  return data;
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".admin-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-tab");
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === `tab-${id}`);
      });
    });
  });
}

function renderSummary(summary) {
  $("summaryBox").innerHTML = `<pre>${JSON.stringify(summary, null, 2)}</pre>`;
}

function renderFeatures(keyword = "") {
  const featureGrid = $("featureGrid");
  const featureCounter = $("featureCounter");
  const filtered = state.features.filter((feature) =>
    feature.key.toLowerCase().includes(keyword.toLowerCase())
  );
  featureGrid.innerHTML = "";

  filtered.forEach((feature) => {
    const wrapper = document.createElement("article");
    wrapper.className = "feature-item";
    wrapper.innerHTML = `
      <h4>${feature.key}</h4>
      <p>${feature.description}</p>
      <div class="switch-row">
        <small>${feature.category}</small>
        <button class="switch ${feature.enabled ? "enabled" : ""}" type="button"></button>
      </div>
    `;
    const toggle = wrapper.querySelector("button");
    toggle.addEventListener("click", async () => {
      const previous = feature.enabled;
      feature.enabled = !feature.enabled;
      toggle.classList.toggle("enabled", feature.enabled);
      try {
        await adminPatch(`/admin/features/${feature.key}`, { enabled: feature.enabled });
        $("featureStatus").textContent = `Updated ${feature.key}`;
      } catch (error) {
        feature.enabled = previous;
        toggle.classList.toggle("enabled", previous);
        $("featureStatus").textContent = error.message;
      }
    });
    featureGrid.appendChild(wrapper);
  });

  const enabledCount = state.features.filter((feature) => feature.enabled).length;
  featureCounter.textContent = `Showing ${filtered.length}/${state.features.length} | Enabled ${enabledCount}`;
}

async function loadSummary() {
  try {
    const summary = await adminGet("/admin/summary");
    renderSummary(summary);
  } catch (error) {
    $("summaryBox").textContent = `Load failed: ${error.message}`;
  }
}

async function loadFeatures() {
  try {
    const data = await adminGet("/admin/features");
    state.features = data.features || [];
    renderFeatures($("featureSearch").value);
    $("featureStatus").textContent = "Feature sync complete";
  } catch (error) {
    $("featureStatus").textContent = `Feature load failed: ${error.message}`;
  }
}

async function loadSettingGroup(group) {
  try {
    const data = await adminGet(`/admin/settings/${group}`);
    return data.setting?.value || {};
  } catch {
    return {};
  }
}

function setupConnectionForm() {
  $("adminApiBase").value = state.apiBase;
  $("adminToken").value = state.adminToken;

  $("adminConnectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.apiBase = $("adminApiBase").value.trim().replace(/\/$/, "");
    state.adminToken = $("adminToken").value.trim();
    localStorage.setItem("amanaflow:apiBase", state.apiBase);
    localStorage.setItem("amanaflow:adminToken", state.adminToken);

    try {
      await loadSummary();
      $("adminConnectionStatus").textContent = "Connection successful";
      await Promise.all([loadFeatures(), hydrateSettings()]);
    } catch (error) {
      $("adminConnectionStatus").textContent = `Connection failed: ${error.message}`;
    }
  });

  $("loadSummary").addEventListener("click", loadSummary);
}

function setupBrandForm() {
  $("brandForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData($("brandForm")).entries());
    localStorage.setItem("amanaflow:brand", JSON.stringify(data));
    $("brandStatus").textContent = "Brand config saved in browser local storage";
  });
}

function setupAiForm() {
  $("aiForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      primaryModel: $("primaryModel").value,
      fallbackModel: $("fallbackModel").value,
      minDelaySec: Number($("minDelay").value),
      maxDelaySec: Number($("maxDelay").value)
    };
    try {
      await adminPut("/admin/settings/ai_engine", payload);
      $("aiStatus").textContent = "AI engine setting updated";
    } catch (error) {
      $("aiStatus").textContent = `Save failed: ${error.message}`;
    }
  });
}

function setupIntegrationForm() {
  $("integrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      tiktok: {
        clientId: $("tiktokClientId").value,
        clientSecret: $("tiktokClientSecret").value,
        enabled: Boolean($("tiktokClientId").value)
      },
      facebook: {
        appId: $("facebookAppId").value,
        appSecret: $("facebookAppSecret").value,
        enabled: Boolean($("facebookAppId").value)
      },
      youtube: {
        clientId: $("youtubeClientId").value,
        clientSecret: $("youtubeClientSecret").value,
        enabled: Boolean($("youtubeClientId").value)
      }
    };
    try {
      await adminPut("/admin/settings/integrations", payload);
      $("integrationStatus").textContent = "Integration settings saved";
    } catch (error) {
      $("integrationStatus").textContent = `Save failed: ${error.message}`;
    }
  });
}

function setupPaymentForm() {
  $("paymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      sslcommerz: {
        enabled: Boolean($("sslStoreId").value),
        storeId: $("sslStoreId").value,
        storePassword: $("sslStorePassword").value
      },
      bkash: {
        enabled: Boolean($("bkashAppKey").value),
        appKey: $("bkashAppKey").value,
        appSecret: $("bkashAppSecret").value
      },
      nagad: {
        enabled: Boolean($("nagadMerchantId").value),
        merchantId: $("nagadMerchantId").value,
        publicKey: $("nagadPublicKey").value
      }
    };
    try {
      await adminPut("/admin/settings/payments", payload);
      $("paymentStatus").textContent = "Payment settings saved";
    } catch (error) {
      $("paymentStatus").textContent = `Save failed: ${error.message}`;
    }
  });
}

function setupFeatureControls() {
  $("featureSearch").addEventListener("input", (event) => {
    renderFeatures(event.target.value);
  });

  $("reloadFeatures").addEventListener("click", loadFeatures);
  $("exportConfig").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.features, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "amanaflow-features.json";
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function hydrateSettings() {
  const [integrations, payments, aiEngine] = await Promise.all([
    loadSettingGroup("integrations"),
    loadSettingGroup("payments"),
    loadSettingGroup("ai_engine")
  ]);

  $("tiktokClientId").value = integrations.tiktok?.clientId || "";
  $("tiktokClientSecret").value = integrations.tiktok?.clientSecret || "";
  $("facebookAppId").value = integrations.facebook?.appId || "";
  $("facebookAppSecret").value = integrations.facebook?.appSecret || "";
  $("youtubeClientId").value = integrations.youtube?.clientId || "";
  $("youtubeClientSecret").value = integrations.youtube?.clientSecret || "";

  $("sslStoreId").value = payments.sslcommerz?.storeId || "";
  $("sslStorePassword").value = payments.sslcommerz?.storePassword || "";
  $("bkashAppKey").value = payments.bkash?.appKey || "";
  $("bkashAppSecret").value = payments.bkash?.appSecret || "";
  $("nagadMerchantId").value = payments.nagad?.merchantId || "";
  $("nagadPublicKey").value = payments.nagad?.publicKey || "";

  $("primaryModel").value = aiEngine.primaryModel || "gemini-2.5-pro";
  $("fallbackModel").value = aiEngine.fallbackModel || "gpt-5-mini";
  $("minDelay").value = aiEngine.minDelaySec || 2;
  $("maxDelay").value = aiEngine.maxDelaySec || 10;
}

async function init() {
  setupTabs();
  setupConnectionForm();
  setupBrandForm();
  setupAiForm();
  setupIntegrationForm();
  setupPaymentForm();
  setupFeatureControls();

  if (state.adminToken) {
    await loadSummary();
    await loadFeatures();
    await hydrateSettings();
    $("adminConnectionStatus").textContent = "Loaded using saved admin token";
  }
}

init();
