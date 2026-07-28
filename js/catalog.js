/**
 * NeuraconX — catalog loading, filtering, and Neurabeach mapping.
 * Tries live Neurabeach when enabled; falls back to data/catalog.json.
 */

/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {string} [slug]
 * @property {string} name
 * @property {string} shortDescription
 * @property {'tool'|'game'|'research'} category
 * @property {'available'|'beta'|'coming_soon'|'installed'} status
 * @property {'download'|'launch'} action
 * @property {string} [version]
 * @property {string[]} [tags]
 * @property {string|null} [demoUrl]
 * @property {string|null} [projectUrl]
 * @property {string|null} [githubUrl]
 * @property {string|null} [installHint]
 */

/**
 * @typedef {Object} CatalogLoadResult
 * @property {CatalogItem[]} items
 * @property {'live'|'local'|'merged'} source
 * @property {string} [detail]
 * @property {number} [fetchedAt]
 */

export const DEFAULT_LIVE_URL = "https://neurabeach.com/api/projects";
export const DEFAULT_LOCAL_URL = "./data/catalog.json";
export const BEACH_PROJECT_BASE = "https://neurabeach.com/projects";

/** @param {string} [url] */
export async function loadLocalCatalog(url = DEFAULT_LOCAL_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load local catalog (${res.status})`);
  const data = await res.json();
  if (!data?.items || !Array.isArray(data.items)) {
    throw new Error("Catalog JSON missing items array");
  }
  return /** @type {CatalogItem[]} */ (data.items.map(normalizeItem));
}

/**
 * Map Neurabeach project categories → NeuraconX categories.
 * @param {string} beachCategory
 * @param {string[]} [tags]
 * @returns {'tool'|'game'|'research'}
 */
export function mapBeachCategory(beachCategory, tags = []) {
  const t = (tags || []).map((x) => String(x).toLowerCase());
  if (
    t.includes("game") ||
    t.includes("games") ||
    t.includes("puzzle") ||
    beachCategory === "game"
  ) {
    return "game";
  }
  if (
    beachCategory === "research_utility" ||
    beachCategory === "research" ||
    t.includes("research")
  ) {
    return "research";
  }
  // accessibility, computer_control, tools, etc.
  return "tool";
}

/**
 * @param {Record<string, unknown>} p
 * @returns {CatalogItem}
 */
export function mapBeachProject(p) {
  const slug = String(p.slug || p.id || "");
  const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
  const demoUrl = p.demo_video_url ? String(p.demo_video_url) : null;
  const githubUrl = p.github_url ? String(p.github_url) : null;
  const projectUrl = slug
    ? `${BEACH_PROJECT_BASE}/${slug}`
    : "https://neurabeach.com";
  const category = mapBeachCategory(String(p.category || "tool"), tags);
  const action = demoUrl ? "launch" : "download";

  let installHint = null;
  if (githubUrl && !githubUrl.includes("/tree/")) {
    installHint = `git clone ${githubUrl}`;
  } else if (githubUrl) {
    installHint = `See repository: ${githubUrl}`;
  } else {
    installHint = `Open project page: ${projectUrl}`;
  }

  return normalizeItem({
    id: String(p.slug || p.id),
    slug,
    name: String(p.title || p.name || slug),
    shortDescription: String(p.short_description || p.shortDescription || ""),
    category,
    status: "available",
    action,
    version: p.version ? String(p.version) : undefined,
    tags,
    demoUrl,
    projectUrl,
    githubUrl,
    installHint,
  });
}

/** @param {Partial<CatalogItem> & { id: string, name: string }} raw */
export function normalizeItem(raw) {
  return {
    id: raw.id,
    slug: raw.slug ?? null,
    name: raw.name,
    shortDescription: raw.shortDescription || "",
    category: raw.category || "tool",
    status: raw.status || "available",
    action: raw.action || (raw.demoUrl ? "launch" : "download"),
    version: raw.version,
    tags: raw.tags || [],
    demoUrl: raw.demoUrl ?? null,
    projectUrl: raw.projectUrl ?? null,
    githubUrl: raw.githubUrl ?? null,
    installHint: raw.installHint ?? null,
  };
}

/**
 * Merge live Beach projects with local-only extras (examples not on Beach).
 * Live wins on id/slug collisions.
 * @param {CatalogItem[]} live
 * @param {CatalogItem[]} local
 */
export function mergeCatalogs(live, local) {
  const byId = new Map();
  for (const item of live) byId.set(item.id, item);
  for (const item of local) {
    if (!byId.has(item.id)) {
      // Keep local-only placeholders and examples
      byId.set(item.id, item);
    } else {
      // Prefer live metadata but fill missing connect fields from local
      const liveItem = byId.get(item.id);
      byId.set(item.id, {
        ...item,
        ...liveItem,
        demoUrl: liveItem.demoUrl || item.demoUrl,
        projectUrl: liveItem.projectUrl || item.projectUrl,
        githubUrl: liveItem.githubUrl || item.githubUrl,
        installHint: liveItem.installHint || item.installHint,
      });
    }
  }
  return [...byId.values()];
}

/**
 * @param {{ preferLive?: boolean, liveUrl?: string, localUrl?: string }} [opts]
 * @returns {Promise<CatalogLoadResult>}
 */
export async function loadCatalog(opts = {}) {
  const preferLive = opts.preferLive !== false;
  const liveUrl = opts.liveUrl || DEFAULT_LIVE_URL;
  const localUrl = opts.localUrl || DEFAULT_LOCAL_URL;

  let local = [];
  try {
    local = await loadLocalCatalog(localUrl);
  } catch (err) {
    if (!preferLive) throw err;
    // continue; live might still work
  }

  if (!preferLive) {
    if (!local.length) throw new Error("Local catalog empty");
    return {
      items: local,
      source: "local",
      detail: "Bundled catalog (live disabled)",
      fetchedAt: Date.now(),
    };
  }

  try {
    const res = await fetch(liveUrl, {
      headers: { Accept: "application/json" },
      mode: "cors",
    });
    if (!res.ok) throw new Error(`Live catalog HTTP ${res.status}`);
    const data = await res.json();
    const projects = data.projects || data.data || [];
    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error("Live catalog returned no projects");
    }
    const live = projects.map(mapBeachProject);
    const items = local.length ? mergeCatalogs(live, local) : live;
    return {
      items,
      source: local.length ? "merged" : "live",
      detail: `Neurabeach · ${live.length} projects`,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    if (!local.length) throw err;
    const reason =
      err instanceof Error ? err.message : "live catalog unavailable";
    return {
      items: local,
      source: "local",
      detail: `Offline fallback (${reason})`,
      fetchedAt: Date.now(),
    };
  }
}

/**
 * @param {CatalogItem[]} items
 * @param {'all'|'tool'|'game'|'research'} filter
 */
export function filterCatalog(items, filter) {
  if (!filter || filter === "all") return items.slice();
  return items.filter((i) => i.category === filter);
}

/**
 * @param {number} width
 */
export function gridColumnsForWidth(width) {
  if (width < 560) return 1;
  if (width < 900) return 2;
  if (width < 1200) return 3;
  return 4;
}

/** @param {CatalogItem['category']} cat */
export function categoryLabel(cat) {
  switch (cat) {
    case "tool":
      return "Tool";
    case "game":
      return "Game";
    case "research":
      return "Research";
    default:
      return cat;
  }
}

/** @param {CatalogItem['status']} status */
export function statusLabel(status) {
  switch (status) {
    case "available":
      return "Available";
    case "beta":
      return "Beta";
    case "coming_soon":
      return "Coming soon";
    case "installed":
      return "Installed";
    default:
      return status;
  }
}

/** @param {CatalogItem} item */
export function actionLabel(item) {
  if (item.status === "coming_soon") return "Unavailable";
  if (item.demoUrl) return "Open demo";
  if (item.githubUrl) return "Open repo";
  if (item.projectUrl) return "Open Beach";
  return item.action === "launch" ? "Launch" : "Download";
}

/** @param {CatalogItem} item */
export function isActionable(item) {
  if (item.status === "coming_soon") return false;
  return !!(item.demoUrl || item.githubUrl || item.projectUrl || item.installHint);
}

/**
 * Primary connect target for an item.
 * @param {CatalogItem} item
 * @returns {{ kind: 'open'|'copy'|'none', url?: string, text?: string, label: string }}
 */
export function primaryConnectTarget(item) {
  if (item.action === "launch" && item.demoUrl) {
    return { kind: "open", url: item.demoUrl, label: "Open live demo" };
  }
  if (item.demoUrl) {
    return { kind: "open", url: item.demoUrl, label: "Open live demo" };
  }
  if (item.action === "download" && item.githubUrl) {
    return { kind: "open", url: item.githubUrl, label: "Open GitHub" };
  }
  if (item.githubUrl) {
    return { kind: "open", url: item.githubUrl, label: "Open GitHub" };
  }
  if (item.projectUrl) {
    return { kind: "open", url: item.projectUrl, label: "Open on Neurabeach" };
  }
  if (item.installHint) {
    return { kind: "copy", text: item.installHint, label: "Copy install command" };
  }
  return { kind: "none", label: "No connect target" };
}

/**
 * Secondary connect options for success panel.
 * @param {CatalogItem} item
 */
export function connectOptions(item) {
  /** @type {{ id: string, label: string, kind: 'open'|'copy', url?: string, text?: string }[]} */
  const opts = [];
  if (item.demoUrl) {
    opts.push({
      id: "demo",
      label: "Open live demo",
      kind: "open",
      url: item.demoUrl,
    });
  }
  if (item.projectUrl) {
    opts.push({
      id: "beach",
      label: "Open on Neurabeach",
      kind: "open",
      url: item.projectUrl,
    });
  }
  if (item.githubUrl) {
    opts.push({
      id: "github",
      label: "Open GitHub",
      kind: "open",
      url: item.githubUrl,
    });
  }
  if (item.installHint) {
    opts.push({
      id: "install",
      label: "Copy install command",
      kind: "copy",
      text: item.installHint,
    });
  }
  return opts;
}
