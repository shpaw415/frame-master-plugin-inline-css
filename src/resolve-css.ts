import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

export type ResolveCssOptions = {
	/** When true, fetch and inline remote http(s) stylesheets. Default: true */
	inlineRemote?: boolean;
	/**
	 * Directory for cached remote CSS (especially useful in dev).
	 * Default: `.frame-master/cache/remote-css`
	 */
	cacheDir?: string;
	/**
	 * Always prefer cache when present. Default: true in non-production,
	 * false in production (still writes cache for next runs).
	 */
	preferCache?: boolean;
	/**
	 * Roots for root-relative local paths (`/assets/x.css`).
	 * Paths starting with `/` resolve under these roots (project-relative),
	 * not the OS filesystem root.
	 */
	resolveRoots?: string[];
	/** Custom fetch User-Agent for remote stylesheets (Google Fonts, etc.). */
	userAgent?: string;
	/** Logger for warnings; defaults to console.warn */
	warn?: (message: string) => void;
};

export type ResolvedStylesheet = {
	href: string;
	css: string;
	media: string | null;
	source: "local" | "remote" | "cache";
};

/**
 * HTML attribute that opts a specific `<link rel="stylesheet">` out of inlining.
 * Presence alone disables the plugin for that tag (value is ignored).
 *
 * @example
 * ```html
 * <link rel="stylesheet" href="./critical.css" data-no-inline-css />
 * ```
 */
export const NO_INLINE_CSS_ATTR = "data-no-inline-css";

const STYLESHEET_LINK_RE =
	/<link\b[^>]*\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet)[^>]*>/gi;

const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const MEDIA_RE = /\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const REL_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
/** Matches data-no-inline-css as a boolean attribute or with any value. */
const NO_INLINE_ATTR_RE = /\bdata-no-inline-css\b/i;

const DEFAULT_UA =
	"Mozilla/5.0 (compatible; frame-master-plugin-inline-css/0.1; +https://github.com/shpaw415/frame-master-plugin-inline-css)";

export function extractStylesheetLinks(
	html: string,
): Array<{ href: string; media: string | null }> {
	const found: Array<{ href: string; media: string | null }> = [];
	const seen = new Set<string>();

	for (const match of html.matchAll(STYLESHEET_LINK_RE)) {
		const tag = match[0] ?? "";
		// Opt-out: leave this link alone (do not resolve / inline).
		if (hasNoInlineCssAttr(tag)) continue;

		const rel = pickAttr(tag, REL_RE)?.toLowerCase() ?? "";
		if (!rel.split(/\s+/).includes("stylesheet")) continue;

		const href = pickAttr(tag, HREF_RE);
		if (!href || href.startsWith("data:")) continue;

		const media = pickAttr(tag, MEDIA_RE);
		const key = `${href}::${media ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		found.push({ href, media });
	}

	return found;
}

function pickAttr(tag: string, re: RegExp): string | null {
	const m = tag.match(re);
	if (!m) return null;
	return m[1] ?? m[2] ?? m[3] ?? null;
}

/** True when the raw tag markup includes the opt-out attribute. */
export function hasNoInlineCssAttr(tag: string): boolean {
	return NO_INLINE_ATTR_RE.test(tag);
}

export function isRemoteHref(href: string): boolean {
	return /^https?:\/\//i.test(href) || href.startsWith("//");
}

export function normalizeRemoteUrl(href: string): string {
	if (href.startsWith("//")) return `https:${href}`;
	return href;
}

export function cacheKeyForUrl(url: string): string {
	return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

/**
 * Escape CSS so it is safe inside a <style> element body.
 * Prevents premature </style> termination.
 */
export function escapeCssForStyleTag(css: string): string {
	return css.replace(/<\/style/gi, "<\\/style");
}

export function buildStyleTag(
	css: string,
	href: string,
	media: string | null,
): string {
	const attrs = [
		`data-inline-css`,
		`data-href="${escapeAttr(href)}"`,
		media ? `media="${escapeAttr(media)}"` : null,
	]
		.filter(Boolean)
		.join(" ");

	return `<style ${attrs}>${escapeCssForStyleTag(css)}</style>`;
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Resolve a local stylesheet href to file contents.
 *
 * Root-relative web paths (`/assets/x.css`) are resolved against `resolveRoots`
 * / project cwd — never the OS filesystem root. On POSIX, `path.isAbsolute("/x")`
 * is true, so we must treat leading `/` as a web root, not a system path.
 */
export async function resolveLocalCss(
	href: string,
	htmlPath: string,
	resolveRoots: string[] = [],
): Promise<string | null> {
	const candidates: string[] = [];
	const htmlDir = dirname(htmlPath);

	// Root-relative web path (/assets/x.css) — not an OS absolute path.
	// Protocol-relative URLs (//cdn...) are remote and should not reach here.
	if (href.startsWith("/") && !href.startsWith("//")) {
		const relative = href.replace(/^\/+/, "");
		for (const root of resolveRoots) {
			candidates.push(join(root, relative));
		}
		candidates.push(join(process.cwd(), relative));
		// Also try next to the HTML file's parent chain (build root)
		candidates.push(join(htmlDir, relative));
		candidates.push(join(dirname(htmlDir), relative));
	} else if (isAbsolute(href)) {
		// True OS absolute path (e.g. Windows drive letter); rare for hrefs
		candidates.push(href);
	} else {
		// Relative to the HTML file
		candidates.push(normalize(resolve(htmlDir, href)));
		// Fallback: cwd-relative
		candidates.push(normalize(resolve(process.cwd(), href)));
	}

	for (const candidate of candidates) {
		const file = Bun.file(candidate);
		if (await file.exists()) {
			return await file.text();
		}
	}

	return null;
}

export async function resolveRemoteCss(
	href: string,
	options: ResolveCssOptions,
): Promise<{ css: string; source: "remote" | "cache" } | null> {
	const url = normalizeRemoteUrl(href);
	const cacheDir =
		options.cacheDir ?? join(process.cwd(), ".frame-master/cache/remote-css");
	const key = cacheKeyForUrl(url);
	const cachePath = join(cacheDir, `${key}.css`);
	const metaPath = join(cacheDir, `${key}.json`);

	const preferCache =
		options.preferCache ?? process.env.NODE_ENV !== "production";

	const cached = Bun.file(cachePath);
	if (preferCache && (await cached.exists())) {
		return { css: await cached.text(), source: "cache" };
	}

	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent": options.userAgent ?? DEFAULT_UA,
				Accept: "text/css,*/*;q=0.1",
			},
		});
		if (!res.ok) {
			options.warn?.(`[inline-css] Failed to fetch ${url}: HTTP ${res.status}`);
			// Fall back to stale cache if available
			if (await cached.exists()) {
				return { css: await cached.text(), source: "cache" };
			}
			return null;
		}

		const css = await res.text();
		await mkdir(cacheDir, { recursive: true });
		await Bun.write(cachePath, css);
		await Bun.write(
			metaPath,
			JSON.stringify(
				{ url, fetchedAt: new Date().toISOString(), status: res.status },
				null,
				2,
			),
		);
		return { css, source: "remote" };
	} catch (err) {
		options.warn?.(
			`[inline-css] Error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
		);
		if (await cached.exists()) {
			return { css: await cached.text(), source: "cache" };
		}
		return null;
	}
}

/**
 * Resolve all stylesheet links found in HTML to CSS content maps keyed by href.
 * Media is preserved separately per occurrence via a composite key when needed;
 * the rewriter matches primarily by href and applies media from the live element.
 */
export async function resolveAllStylesheets(
	html: string,
	htmlPath: string,
	options: ResolveCssOptions = {},
): Promise<Map<string, string>> {
	const links = extractStylesheetLinks(html);
	const map = new Map<string, string>();
	const inlineRemote = options.inlineRemote !== false;
	const warn = options.warn ?? ((m: string) => console.warn(m));
	const resolveRoots = options.resolveRoots ?? [
		process.cwd(),
		dirname(htmlPath),
	];

	await Promise.all(
		links.map(async ({ href }) => {
			if (map.has(href)) return;

			if (isRemoteHref(href)) {
				if (!inlineRemote) return;
				const remote = await resolveRemoteCss(href, { ...options, warn });
				if (remote) {
					map.set(href, remote.css);
				} else {
					warn(`[inline-css] Leaving remote link as-is (unresolved): ${href}`);
				}
				return;
			}

			const local = await resolveLocalCss(href, htmlPath, resolveRoots);
			if (local != null) {
				map.set(href, local);
			} else {
				warn(`[inline-css] Leaving local link as-is (file not found): ${href}`);
			}
		}),
	);

	return map;
}
