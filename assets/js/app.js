const textMap = {
  bn: {
    navFeatures: "ফিচার",
    navPricing: "প্রাইসিং",
    navAdmin: "অ্যাডমিন",
    openAdmin: "Open Admin",
    eyebrow: "Amanaflow Brand Engine",
    heroTitle: "বাংলা-ফার্স্ট সোশ্যাল অটোমেশন প্ল্যাটফর্ম",
    heroLead: "এক জায়গা থেকে পোস্ট তৈরি, শিডিউল, এআই অটো-রিপ্লাই, পেমেন্ট এবং মাল্টি-চ্যানেল কন্ট্রোল করুন।",
    startNow: "এখনই শুরু",
    manageSettings: "সেটিংস ম্যানেজ",
    quickStatus: "Quick Status",
    statusAi: "AI Models",
    statusChannels: "Connected Channels",
    statusFeatures: "Admin Controls",
    statusLanguage: "Language",
    composerTitle: "AI Post Auto-Generation",
    composerSubtitle: "মডেল সিলেক্ট করে 2-10 সেকেন্ড delay সহ অটো-রিপ্লাই তৈরি করুন।",
    promptLabel: "আপনার পোস্টের আইডিয়া",
    modelLabel: "AI Model",
    delayLabel: "Reply Delay",
    generateBtn: "Generate Post",
    resultLabel: "Generated Content",
    resultPlaceholder: "এখানে AI generated পোস্ট দেখা যাবে...",
    featureTitle: "Core Platform Features",
    f1Title: "Smart Channel Publishing",
    f1Body: "Facebook, Instagram, Threads, YouTube, Google Business, TikTok, Telegram সহ মাল্টি-চ্যানেল পোস্টিং।",
    f2Title: "AI Workflow Controls",
    f2Body: "Model routing, auto-reply rules, tone profiles, delay windows, guardrails।",
    f3Title: "Business Payment Ready",
    f3Body: "SSLCommerz, bKash, Nagad configuration blocks, webhook and callback structure।",
    pricingTitle: "SaaS Pricing",
    starter1: "10 channels",
    starter2: "AI post generator",
    starter3: "বাংলা content templates",
    growth1: "Unlimited channels",
    growth2: "Auto DM workflows",
    growth3: "bKash/Nagad checkout",
    ent1: "White-label branding",
    ent2: "Custom AI model policies",
    ent3: "Dedicated onboarding",
    footerAdmin: "Admin Panel"
  },
  en: {
    navFeatures: "Features",
    navPricing: "Pricing",
    navAdmin: "Admin",
    openAdmin: "Open Admin",
    eyebrow: "Amanaflow Brand Engine",
    heroTitle: "Bangla-first social automation platform",
    heroLead: "Create, schedule, auto-reply with AI, control payments, and manage multi-channel publishing in one place.",
    startNow: "Start now",
    manageSettings: "Manage settings",
    quickStatus: "Quick Status",
    statusAi: "AI Models",
    statusChannels: "Connected Channels",
    statusFeatures: "Admin Controls",
    statusLanguage: "Language",
    composerTitle: "AI Post Auto-Generation",
    composerSubtitle: "Select a model and generate auto-replies with 2-10 second delays.",
    promptLabel: "Post idea",
    modelLabel: "AI Model",
    delayLabel: "Reply Delay",
    generateBtn: "Generate Post",
    resultLabel: "Generated Content",
    resultPlaceholder: "Generated post will appear here...",
    featureTitle: "Core Platform Features",
    f1Title: "Smart Channel Publishing",
    f1Body: "Multi-channel posting for Facebook, Instagram, Threads, YouTube, Google Business, TikTok, and Telegram.",
    f2Title: "AI Workflow Controls",
    f2Body: "Model routing, auto-reply rules, tone profiles, delay windows, and guardrails.",
    f3Title: "Business Payment Ready",
    f3Body: "SSLCommerz, bKash, and Nagad configuration blocks with callback architecture.",
    pricingTitle: "SaaS Pricing",
    starter1: "10 channels",
    starter2: "AI post generator",
    starter3: "Bangla templates",
    growth1: "Unlimited channels",
    growth2: "Auto DM workflows",
    growth3: "bKash/Nagad checkout",
    ent1: "White-label branding",
    ent2: "Custom AI model policies",
    ent3: "Dedicated onboarding",
    footerAdmin: "Admin Panel"
  }
};

const languageButton = document.getElementById("langToggle");
let currentLang = localStorage.getItem("amanaflow:lang") || "bn";

function applyLanguage(lang) {
  const dictionary = textMap[lang];
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (dictionary[key]) {
      element.textContent = dictionary[key];
    }
  });
  document.documentElement.lang = lang;
  languageButton.textContent = lang === "bn" ? "EN" : "বাংলা";
}

if (languageButton) {
  languageButton.addEventListener("click", () => {
    currentLang = currentLang === "bn" ? "en" : "bn";
    localStorage.setItem("amanaflow:lang", currentLang);
    applyLanguage(currentLang);
  });
}

const delay = document.getElementById("delay");
const delayValue = document.getElementById("delayValue");
if (delay && delayValue) {
  delay.addEventListener("input", () => {
    delayValue.textContent = delay.value;
  });
}

const generateBtn = document.getElementById("generateBtn");
const promptInput = document.getElementById("prompt");
const modelInput = document.getElementById("model");
const generatedPost = document.getElementById("generatedPost");

if (generateBtn && promptInput && modelInput && generatedPost) {
  generateBtn.addEventListener("click", () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      generatedPost.textContent = currentLang === "bn" ? "দয়া করে পোস্টের আইডিয়া লিখুন।" : "Please enter a post idea.";
      return;
    }

    const waitSeconds = Number(delay.value || 5);
    generatedPost.textContent = currentLang === "bn"
      ? `Generating with ${modelInput.value}... ${waitSeconds}s delay`
      : `Generating with ${modelInput.value}... ${waitSeconds}s delay`;

    generateBtn.disabled = true;
    window.setTimeout(() => {
      const base = currentLang === "bn"
        ? `🎯 আজকের আপডেট: ${prompt}\n\n✨ Amanaflow AI থেকে সাজেস্টেড কপি:\n${prompt} নিয়ে প্রিমিয়াম অফার চালু আছে। ইনবক্সে মেসেজ করুন, 5 মিনিটে সাপোর্ট পাবেন।\n\n#Amanaflow #Automation #বাংলাBusiness`
        : `🎯 Today's update: ${prompt}\n\n✨ Suggested copy from Amanaflow AI:\nNew offer based on ${prompt}. DM now for quick support and automated onboarding.\n\n#Amanaflow #Automation #SocialMedia`;

      generatedPost.textContent = base;
      generateBtn.disabled = false;
    }, waitSeconds * 1000);
  });
}

document.getElementById("year").textContent = new Date().getFullYear();
applyLanguage(currentLang);
