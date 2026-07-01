const API_BASE = "https://birdfyi.com/api/v1";
const CDN_BASE = "https://cdn.birdfyi.com";
const TOTAL_BIRDS = 11251;
const PAGE_SIZE = 20;
const MAX_FETCH_ATTEMPTS = 30;

const CONSERVATION_LABELS = {
  LC: "Least Concern",
  NT: "Near Threatened",
  VU: "Vulnerable",
  EN: "Endangered",
  CR: "Critically Endangered",
  EW: "Extinct in the Wild",
  EX: "Extinct",
};

const elements = {
  todayDate: document.getElementById("today-date"),
  loading: document.getElementById("loading"),
  content: document.getElementById("bird-content"),
  error: document.getElementById("error-state"),
  image: document.getElementById("bird-image"),
  badge: document.getElementById("conservation-badge"),
  name: document.getElementById("bird-name"),
  scientific: document.getElementById("bird-scientific"),
  family: document.getElementById("bird-family"),
  funFact: document.getElementById("fun-fact"),
  description: document.getElementById("bird-description"),
  stats: document.getElementById("bird-stats"),
  randomBtn: document.getElementById("random-btn"),
  dailyBtn: document.getElementById("daily-btn"),
  retryBtn: document.getElementById("retry-btn"),
};

let showingDaily = true;

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getBirdIndex(seed) {
  return hashString(seed) % TOTAL_BIRDS;
}

function getDailyBirdIndex(seed = getTodayKey()) {
  return getBirdIndex(seed);
}

function getRandomBirdIndex() {
  return Math.floor(Math.random() * TOTAL_BIRDS);
}

function getPageAndOffset(birdIndex) {
  return {
    page: Math.floor(birdIndex / PAGE_SIZE) + 1,
    offset: birdIndex % PAGE_SIZE,
  };
}

function fixWikimediaImageUrl(url) {
  return url.replace("/400px-", "/250px-");
}

function getImageCandidates(bird) {
  const candidates = [];

  if (bird.image_url?.trim()) {
    candidates.push(fixWikimediaImageUrl(bird.image_url.trim()));
    candidates.push(bird.image_url.trim());
  }

  return [...new Set(candidates)];
}

function setBirdImage(bird) {
  const candidates = getImageCandidates(bird);
  const imageWrap = elements.image.closest(".image-wrap");
  let index = 0;

  elements.image.onload = () => {
    elements.image.onerror = null;
    imageWrap?.classList.remove("no-image");
  };

  elements.image.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      elements.image.src = candidates[index];
      return;
    }

    elements.image.onerror = null;
    elements.image.removeAttribute("src");
    imageWrap?.classList.add("no-image");
  };

  imageWrap?.classList.remove("no-image");
  if (candidates.length === 0) {
    elements.image.removeAttribute("src");
    imageWrap?.classList.add("no-image");
    return;
  }

  elements.image.src = candidates[0];
}

function pickFunFact(bird, seed) {
  const curated = (bird.fun_facts || []).filter(Boolean);
  if (curated.length > 0) {
    return curated[hashString(seed) % curated.length];
  }

  const candidates = [
    bird.description,
    bird.diet && `Diet: ${bird.diet}`,
    bird.song_description && `Its call: ${bird.song_description}`,
    bird.nesting && `Nesting: ${bird.nesting}`,
    bird.plumage && `Plumage: ${bird.plumage}`,
    bird.habitat_description && `Habitat: ${bird.habitat_description}`,
    bird.geographic_range && `Found across ${bird.geographic_range}`,
    bird.bill_description && `Look for its ${bird.bill_description.toLowerCase()}.`,
    bird.wingspan_cm &&
      `This bird has a wingspan of about ${Math.round(bird.wingspan_cm)} cm.`,
    bird.weight_g && `It typically weighs around ${Math.round(bird.weight_g)} grams.`,
    bird.family_name && `It belongs to the ${bird.family_name} family.`,
    bird.conservation_status &&
      `Conservation status: ${CONSERVATION_LABELS[bird.conservation_status] || bird.conservation_status}.`,
    Array.isArray(bird.habitats) &&
      bird.habitats.length &&
      `You can often spot it in ${bird.habitats.join(", ")} habitats.`,
    `The ${bird.common_name} (${bird.scientific_name}) is one of over 11,000 bird species on our planet.`,
  ].filter(Boolean);

  return candidates[hashString(`${seed}-fact`) % candidates.length];
}

function birdHasUsefulContent(bird) {
  const hasImage = Boolean(bird.image_url?.trim());
  const hasText = Boolean(
    bird.description ||
      (bird.fun_facts && bird.fun_facts.length) ||
      bird.diet ||
      bird.song_description ||
      bird.plumage ||
      bird.habitat_description ||
      bird.geographic_range ||
      bird.wingspan_cm ||
      bird.weight_g ||
      (Array.isArray(bird.habitats) && bird.habitats.length)
  );

  return hasImage && hasText;
}

function formatStat(label, value) {
  if (value === null || value === undefined || value === "") return null;

  const item = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  item.append(dt, dd);
  return item;
}

function buildStats(bird) {
  elements.stats.replaceChildren();

  const stats = [
    formatStat("Wingspan", bird.wingspan_cm ? `${Math.round(bird.wingspan_cm)} cm` : null),
    formatStat("Weight", bird.weight_g ? `${Math.round(bird.weight_g)} g` : null),
    formatStat("Length", bird.length_cm ? `${Math.round(bird.length_cm)} cm` : null),
    formatStat(
      "Habitat",
      Array.isArray(bird.habitats) && bird.habitats.length
        ? bird.habitats.slice(0, 2).join(", ")
        : null
    ),
    formatStat("Clutch", bird.clutch_size || null),
  ].filter(Boolean);

  stats.forEach((stat) => elements.stats.append(stat));
}

function setViewState(state) {
  elements.loading.classList.toggle("hidden", state !== "loading");
  elements.content.classList.toggle("hidden", state !== "content");
  elements.error.classList.toggle("hidden", state !== "error");
}

function renderBird(bird, seed) {
  setBirdImage(bird);
  elements.image.alt = `${bird.common_name} in the wild`;
  elements.name.textContent = bird.common_name;
  elements.scientific.textContent = bird.scientific_name;
  elements.family.textContent = bird.family_name || "";
  elements.funFact.textContent = pickFunFact(bird, seed);
  elements.description.textContent = bird.description || "";

  const status = bird.conservation_status || "";
  const statusLabel = CONSERVATION_LABELS[status] || status;
  elements.badge.textContent = statusLabel;
  elements.badge.hidden = !statusLabel;

  buildStats(bird);
  setViewState("content");
}

async function fetchBirdSummary(birdIndex) {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const index = (birdIndex + attempt) % TOTAL_BIRDS;
    const { page, offset } = getPageAndOffset(index);
    const listResponse = await fetch(`${API_BASE}/birds/?page=${page}&page_size=${PAGE_SIZE}`);
    if (!listResponse.ok) {
      throw new Error("Failed to fetch bird list");
    }

    const listData = await listResponse.json();
    const summary = listData.results?.[offset];
    if (!summary?.slug) {
      continue;
    }

    const detailResponse = await fetch(`${API_BASE}/birds/${summary.slug}/`);
    if (!detailResponse.ok) {
      continue;
    }

    const bird = await detailResponse.json();
    console.log(bird);
    if (birdHasUsefulContent(bird)) {
      return bird;
    }
  }

  throw new Error("No bird found with enough detail");
}

async function loadBird({ daily = true } = {}) {
  showingDaily = daily;
  setViewState("loading");
  elements.dailyBtn.classList.toggle("hidden", daily);

  const seed = daily ? getTodayKey() : `random-${Date.now()}`;
  const birdIndex = daily ? getDailyBirdIndex(seed) : getRandomBirdIndex();

  try {
    const bird = await fetchBirdSummary(birdIndex);
    renderBird(bird, seed);
  } catch (error) {
    console.error(error);
    setViewState("error");
  }
}

function init() {
  const today = getTodayKey();
  elements.todayDate.textContent = formatDate(today);
  elements.randomBtn.addEventListener("click", () => loadBird({ daily: false }));
  elements.dailyBtn.addEventListener("click", () => loadBird({ daily: true }));
  elements.retryBtn.addEventListener("click", () => loadBird({ daily: showingDaily }));
  loadBird({ daily: true });
}

init();
