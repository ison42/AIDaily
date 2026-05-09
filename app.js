const state = {
  activeFilter: "all",
  items: [],
};

const els = {
  filterButtons: [...document.querySelectorAll(".filter")],
  searchInput: document.querySelector("#searchInput"),
  updatedPill: document.querySelector("#updatedPill"),
  heroSubtitle: document.querySelector("#heroSubtitle"),
  metricItems: document.querySelector("#metricItems"),
  metricSources: document.querySelector("#metricSources"),
  metricLatest: document.querySelector("#metricLatest"),
  sourceCount: document.querySelector("#sourceCount"),
  sourceSummary: document.querySelector("#sourceSummary"),
  feedStatus: document.querySelector("#feedStatus"),
  contentGrid: document.querySelector("#contentGrid"),
  leadCard: document.querySelector("#leadCard"),
  newsList: document.querySelector("#newsList"),
  briefText: document.querySelector("#briefText"),
};

function normalize(value = "") {
  return value.trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatUpdate(value) {
  if (!value) return ["真实来源", "待更新"];
  const date = new Date(value);
  return [
    new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date),
    new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date),
  ];
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function topicLabel(topic) {
  const labels = {
    visual: "视觉生成",
    ux: "UX / 产品",
    workflow: "工作流",
    risk: "风险与规范",
  };
  return labels[topic] || topic;
}

function thumbClass(item) {
  if (item.topics.includes("risk")) return "thumb-safety";
  if (item.topics.includes("workflow")) return "thumb-cli";
  if (item.topics.includes("ux")) return "thumb-language";
  return "thumb-wearable";
}

function cardMatches(item) {
  const query = normalize(els.searchInput.value);
  const matchesFilter = state.activeFilter === "all" || item.topics.includes(state.activeFilter);
  const haystack = normalize(
    [item.title, item.summary, item.sourceName, item.sourceType, item.topics.join(" ")].join(" "),
  );
  return matchesFilter && (!query || haystack.includes(query));
}

function renderLead(item) {
  els.leadCard.href = item.url;
  els.leadCard.dataset.topic = item.topics.join(" ");
  els.leadCard.innerHTML = `
    <div class="card-media media-voice">
      <span>${escapeHtml(item.sourceName)}</span>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span>${escapeHtml(item.sourceName)} · 真实来源</span>
        <time datetime="${escapeHtml(item.publishedAt)}">${formatDate(item.publishedAt)}</time>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary || "原始来源未提供摘要。")}</p>
      <div class="designer-take">
        <strong>设计师看点</strong>
        <span>${escapeHtml(item.designerTake)}</span>
      </div>
    </div>
  `;
}

function renderNews(items) {
  els.newsList.innerHTML = items
    .map(
      (item) => `
        <a class="news-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-topic="${escapeHtml(item.topics.join(" "))}">
          <div class="news-thumb ${thumbClass(item)}"></div>
          <div>
            <div class="card-meta">
              <span>${escapeHtml(item.sourceName)}</span>
              <time datetime="${escapeHtml(item.publishedAt)}">${formatDate(item.publishedAt)}</time>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.summary || "原始来源未提供摘要。")}</p>
            <div class="tags">
              ${item.topics.map((topic) => `<span>${topicLabel(topic)}</span>`).join("")}
              <span>原文</span>
            </div>
          </div>
        </a>
      `,
    )
    .join("");
}

function updateVisibleCards() {
  const filtered = state.items.filter(cardMatches);
  const [lead, ...rest] = filtered;

  if (!filtered.length) {
    els.contentGrid.hidden = true;
    els.feedStatus.hidden = false;
    els.feedStatus.textContent = "没有符合当前筛选的真实条目。";
    return;
  }

  renderLead(lead);
  renderNews(rest);
  els.contentGrid.hidden = false;
  els.feedStatus.hidden = true;
}

function renderMeta(data) {
  const sources = data.sources || [];
  const latest = [...state.items].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
  const [dateText, timeText] = formatUpdate(data.generatedAt);
  els.updatedPill.innerHTML = `<span>${dateText}</span><strong>${timeText}</strong>`;
  els.metricItems.textContent = String(state.items.length);
  els.metricSources.textContent = String(sources.filter((source) => source.ok).length);
  els.metricLatest.textContent = latest ? formatDate(latest.publishedAt) : "暂无";
  els.sourceCount.textContent = `${sources.filter((source) => source.ok).length}/${sources.length}`;
  els.sourceSummary.textContent = sources
    .filter((source) => source.ok)
    .map((source) => source.name)
    .join("、");
  els.heroSubtitle.textContent = `当前展示 ${state.items.length} 条真实抓取内容，生成时间 ${new Date(
    data.generatedAt,
  ).toLocaleString("zh-CN")}。点击任意卡片可打开原文。`;
  els.briefText.textContent = latest
    ? `最新条目来自 ${latest.sourceName}：“${latest.title}”。今天适合重点看 ${[
        ...new Set(state.items.flatMap((item) => item.topics).map(topicLabel)),
      ]
        .slice(0, 3)
        .join("、")}。`
    : "暂时没有抓到真实条目，请稍后刷新。";
}

async function loadFeed() {
  try {
    const data = await loadData();
    state.items = data.items || [];

    if (!state.items.length) {
      throw new Error("数据文件里没有真实条目");
    }

    renderMeta(data);
    updateVisibleCards();
  } catch (error) {
    els.feedStatus.hidden = false;
    els.contentGrid.hidden = true;
    els.feedStatus.textContent = `真实内容加载失败：${error.message}`;
    els.metricItems.textContent = "0";
    els.metricSources.textContent = "0";
    els.metricLatest.textContent = "失败";
    els.sourceCount.textContent = "失败";
  }
}

async function loadData() {
  try {
    const response = await fetch(`data/hotspots.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (window.AI_DESIGN_DAILY_DATA) return window.AI_DESIGN_DAILY_DATA;
    throw error;
  }
}

els.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeFilter = button.dataset.filter;
    els.filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    updateVisibleCards();
  });
});

els.searchInput.addEventListener("input", updateVisibleCards);

loadFeed();
