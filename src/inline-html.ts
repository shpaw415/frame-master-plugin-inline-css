import {
	buildStyleTag,
	escapeCssForStyleTag,
	type ResolveCssOptions,
	resolveAllStylesheets,
} from "./resolve-css";

/**
 * Pre-resolve stylesheet contents, then use HTMLRewriter to replace
 * <link rel="stylesheet"> with <style> tags containing the CSS.
 *
 * Original CSS files on disk are never deleted.
 */
export async function inlineCssInHtml(
	html: string,
	htmlPath: string,
	options: ResolveCssOptions = {},
): Promise<string> {
	const cssByHref = await resolveAllStylesheets(html, htmlPath, options);
	if (cssByHref.size === 0) return html;

	const rewriter = new HTMLRewriter().on("link", {
		element(el) {
			const rel = (el.getAttribute("rel") ?? "").toLowerCase();
			const relTokens = rel.split(/\s+/).filter(Boolean);
			if (!relTokens.includes("stylesheet")) return;

			const href = el.getAttribute("href");
			if (!href || href.startsWith("data:")) return;

			const css = cssByHref.get(href);
			if (css == null) return;

			const media = el.getAttribute("media");
			const styleTag = buildStyleTag(css, href, media);

			// Replace the link element with an inline style tag.
			// HTMLRewriter's replace accepts raw HTML when html: true.
			el.replace(styleTag, { html: true });
		},
	});

	return rewriter.transform(html);
}

export { buildStyleTag, escapeCssForStyleTag };
