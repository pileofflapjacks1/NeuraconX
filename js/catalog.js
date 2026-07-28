/**
 * Catalog loading + filtering.
 * Placeholder data lives in data/catalog.json and can be swapped for Neurabeach API later.
 */

/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {string} name
 * @property {string} shortDescription
 * @property {'tool'|'game'|'research'} category
 * @property {'available'|'beta'|'coming_soon'|'installed'} status
 * @property {'download'|'launch'} action
 * @property {string} [version]
 * @property {string[]} [tags]
 */

/**
 * @param {string} [url]
 * @returns {Promise<CatalogItem[]>}
 */
export async function loadCatalog(url = "./data/catalog.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
  const data = await res.json();
  if (!data?.items || !Array.isArray(data.items)) {
    throw new Error("Catalog JSON missing items array");
  }
  return data.items;
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
 * Column count for grid navigation. Mirrors CSS breakpoints.
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
  return item.action === "launch" ? "Launch" : "Download";
}

/** @param {CatalogItem} item */
export function isActionable(item) {
  return item.status !== "coming_soon";
}
