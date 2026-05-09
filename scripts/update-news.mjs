import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sources = [
  {
    name: "OpenAI News",
    type: "official",
    url: "https://openai.com/news/rss.xml",
  },
  {
    name: "GitHub Blog AI & ML",
    type: "official blog",
    url: "https://github.blog/ai-and-ml/feed/",
  },
  {
    name: "TechCrunch AI",
    type: "news",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    name: "The Verge AI",
    type: "news",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  },
  {
    name: "Creative Bloq",
    type: "design news",
    url: "https://www.creativebloq.com/feeds.xml",
  },
  {
    name: "Smashing Magazine",
    type: "design",
    url: "https://www.smashingmagazine.com/feed/",
  },
];

const topicRules = [
  ["visual", /image|video|visual|design|figma|adobe|creative|midjourney|runway|生成|图像|视频|视觉|设计/i],
  ["ux", /ux|ui|interface|product|chatgpt|voice|audio|wearable|用户|界面|语音|产品/i],
  ["workflow", /agent|codex|copilot|developer|api|tool|workflow|automation|github|工具|自动化|工作流/i],
  ["risk", /safety|security|privacy|policy|copyright|trust|ads|children|安全|隐私|版权|广告/i],
];

const aiRelevanceRule =
  /(^|\W)(ai|artificial intelligence|machine learning|ml|llm|gpt|chatgpt|openai|anthropic|claude|copilot|agent|generative|model|neural|midjourney|runway)(\W|$)|人工智能|生成式|大模型|模型|智能体/i;

const takeByTopic = {
  visual: "关注它对视觉生成、品牌素材、内容生产或设计资产管理的影响。",
  ux: "适合从交互反馈、对话语气、状态设计和用户信任角度拆解。",
  workflow: "可以判断它是否能减少重复劳动，或改变设计与开发协作方式。",
  risk: "需要留意安全、隐私、来源标记和平台规范对设计决策的约束。",
};

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, key) => named[key] || `&${key};`);
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return stripHtml(match[1]);
  }
  return "";
}

function firstLink(block) {
  const textLink = firstTag(block, ["link"]);
  if (textLink) return textLink;
  const href = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return href ? stripHtml(href[1]) : "";
}

function allCategories(block) {
  return [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function itemBlocks(xml) {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  if (rssItems.length) return rssItems;
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
}

function classify(item) {
  const text = [item.title, item.summary, item.categories.join(" ")].join(" ");
  const topics = topicRules.filter(([, rule]) => rule.test(text)).map(([topic]) => topic);
  return topics.length ? [...new Set(topics)] : ["ux"];
}

function designerTake(topics) {
  return topics.map((topic) => takeByTopic[topic]).find(Boolean) || "适合判断它对设计流程和产品体验的实际影响。";
}

function isRelevant(source, item) {
  if (!source.type.includes("design")) return true;
  return aiRelevanceRule.test([item.title, item.summary, item.categories.join(" ")].join(" "));
}

function relevanceScore(source, item, topics) {
  const text = [item.title, item.summary, item.categories.join(" ")].join(" ");
  let score = 40;
  if (source.type.includes("design")) score += 22;
  if (source.type.includes("official")) score += 8;
  if (topics.includes("visual")) score += 18;
  if (topics.includes("ux")) score += 16;
  if (topics.includes("workflow")) score += 12;
  if (/voice|image|video|design|ui|ux|creative|tool|workflow|copilot|agent|api|生成|设计|视觉|语音/i.test(text)) score += 20;
  if (/layoff|severance|stock|lawsuit|oust|valuation|裁员|股价|融资/i.test(text)) score -= 22;
  const hoursOld = (Date.now() - new Date(item.publishedAt).getTime()) / 36e5;
  score += Math.max(0, 24 - hoursOld) / 2;
  return Math.round(score);
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const xml = await fetchText(source.url, controller.signal);
    const items = itemBlocks(xml)
      .map((block) => {
        const title = firstTag(block, ["title"]);
        const summary = firstTag(block, ["description", "summary", "content:encoded"]);
        const url = firstLink(block) || firstTag(block, ["guid"]);
        const publishedAt = firstTag(block, ["pubDate", "updated", "published", "dc:date"]);
        const categories = allCategories(block);
        const parsedDate = Number.isNaN(Date.parse(publishedAt)) ? new Date().toISOString() : new Date(publishedAt).toISOString();
        const item = {
          id: `${source.name}:${url || title}`,
          title,
          summary: summary.slice(0, 220),
          url,
          publishedAt: parsedDate,
          sourceName: source.name,
          sourceType: source.type,
          categories,
        };
        const topics = classify(item);
        return {
          ...item,
          topics,
          relevanceScore: relevanceScore(source, item, topics),
          designerTake: designerTake(topics),
        };
      })
      .filter((item) => item.title && item.url && isRelevant(source, item));
    return { source, ok: true, items };
  } catch (error) {
    return { source, ok: false, error: error.message, items: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, signal) {
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        "user-agent": "AI Design Daily feed bot (+https://github.com/ison42/AIDaily)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    const { stdout } = await execFileAsync("curl", [
      "-L",
      "--max-time",
      "25",
      "-A",
      "AI Design Daily feed bot (+https://github.com/ison42/AIDaily)",
      url,
    ]);
    return stdout;
  }
}

const results = await Promise.all(sources.map(fetchSource));
const seen = new Set();
const items = results
  .flatMap((result) => result.items)
  .filter((item) => {
    const key = item.url.replace(/[#?].*$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => b.relevanceScore - a.relevanceScore || new Date(b.publishedAt) - new Date(a.publishedAt))
  .slice(0, 18);

const payload = {
  generatedAt: new Date().toISOString(),
  itemCount: items.length,
  sources: results.map((result) => ({
    name: result.source.name,
    type: result.source.type,
    url: result.source.url,
    ok: result.ok,
    itemCount: result.items.length,
    error: result.error || null,
  })),
  items,
};

await mkdir("data", { recursive: true });
await writeFile("data/hotspots.json", `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(
  "data/hotspots.js",
  `window.AI_DESIGN_DAILY_DATA = ${JSON.stringify(payload, null, 2)};\n`,
);

console.log(`Wrote ${items.length} real items from ${results.filter((result) => result.ok).length}/${sources.length} sources.`);
