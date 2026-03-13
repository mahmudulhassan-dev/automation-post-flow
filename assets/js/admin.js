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

const featureGroups = [
  ["Publishing", "Queue", "Analytics", "Approval", "Brand Guard"],
  ["AI Prompt", "Tone", "Moderation", "Comment", "Auto DM"],
  ["Campaign", "Scheduler", "Lead", "CRM", "Webhook"],
  ["Invoice", "Subscription", "Checkout", "Settlement", "Payout"],
  ["Workspace", "Team", "Role", "Audit", "Backup"],
  ["Localization", "Bangla", "Template", "Persona", "Notification"],
  ["Composer", "Hashtag", "Variant", "Repurpose", "Content"],
  ["Security", "2FA", "Token", "Fraud", "Policy"]
];

const featureCatalog = [];
let seed = 1;
featureGroups.forEach((row, rowIndex) => {
  for (let i = 1; i <= 20; i += 1) {
    const name = `${row[i % row.length]} Control ${i + rowIndex}`;
    featureCatalog.push({
      id: `feature-${seed}`,
      title: name,
      description: `Configurable module ${seed} for admin policy and runtime behavior.`,
      enabled: seed % 2 === 0
    });
    seed += 1;
  }
});

const featureGrid = document.getElementById("featureGrid");
const featureSearch = document.getElementById("featureSearch");
const featureCounter = document.getElementById("featureCounter");
const exportButton = document.getElementById("exportConfig");

function renderFeatures(keyword = "") {
  const needle = keyword.trim().toLowerCase();
  const filtered = featureCatalog.filter((item) => item.title.toLowerCase().includes(needle));
  featureGrid.innerHTML = "";

  filtered.forEach((item) => {
    const wrapper = document.createElement("article");
    wrapper.className = "feature-item";
    const switchClass = item.enabled ? "switch enabled" : "switch";

    wrapper.innerHTML = `
      <h4>${item.title}</h4>
      <p>${item.description}</p>
      <div class="switch-row">
        <small>${item.id}</small>
        <button class="${switchClass}" type="button" aria-label="toggle ${item.title}"></button>
      </div>
    `;

    const toggle = wrapper.querySelector("button");
    toggle.addEventListener("click", () => {
      item.enabled = !item.enabled;
      toggle.classList.toggle("enabled", item.enabled);
      saveAdminState();
    });

    featureGrid.appendChild(wrapper);
  });

  const enabledCount = featureCatalog.filter((item) => item.enabled).length;
  featureCounter.textContent = `Showing ${filtered.length} of ${featureCatalog.length} | Enabled ${enabledCount}`;
}

function saveAdminState() {
  const brandForm = document.getElementById("brandForm");
  const formData = new FormData(brandForm);
  const payload = {
    brand: Object.fromEntries(formData.entries()),
    primaryModel: document.getElementById("primaryModel")?.value,
    fallbackModel: document.getElementById("fallbackModel")?.value,
    replyDelay: document.getElementById("replyDelay")?.value,
    minDelay: document.getElementById("minDelay")?.value,
    maxDelay: document.getElementById("maxDelay")?.value,
    maxRetries: document.getElementById("maxRetries")?.value,
    cooldown: document.getElementById("cooldown")?.value,
    features: featureCatalog
  };
  localStorage.setItem("amanaflow:admin", JSON.stringify(payload));
}

function loadAdminState() {
  const raw = localStorage.getItem("amanaflow:admin");
  if (!raw) {
    return;
  }
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.features) && data.features.length === featureCatalog.length) {
      data.features.forEach((feature, index) => {
        featureCatalog[index].enabled = !!feature.enabled;
      });
    }
    if (data.brand) {
      const form = document.getElementById("brandForm");
      Object.keys(data.brand).forEach((key) => {
        if (form.elements[key]) {
          form.elements[key].value = data.brand[key];
        }
      });
    }
    ["primaryModel", "fallbackModel", "replyDelay", "minDelay", "maxDelay", "maxRetries", "cooldown"].forEach((id) => {
      if (data[id] && document.getElementById(id)) {
        document.getElementById(id).value = data[id];
      }
    });
  } catch {
    // intentionally ignored to prevent broken UI on malformed local storage
  }
}

featureSearch?.addEventListener("input", (event) => {
  renderFeatures(event.target.value);
});

exportButton?.addEventListener("click", () => {
  saveAdminState();
  const data = localStorage.getItem("amanaflow:admin") || "{}";
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "amanaflow-admin-config.json";
  link.click();
  URL.revokeObjectURL(url);
});

const form = document.getElementById("brandForm");
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveAdminState();
  alert("Brand config saved successfully.");
});

document.querySelectorAll("input, select").forEach((el) => {
  el.addEventListener("change", saveAdminState);
});

loadAdminState();
renderFeatures();
