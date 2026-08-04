import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { name, version } from "./package.json";
import { inlineCssInHtml } from "./src/inline-html";
import type { ResolveCssOptions } from "./src/resolve-css";

export type InlineCssPluginOptions = ResolveCssOptions;

/**
 * frame-master-plugin-inline-css
 *
 * Inlines CSS from `<link rel="stylesheet">` tags into `<style>` tags during
 * the build `finally("html")` hook. This removes the flash of unstyled content
 * (FOUC) caused by waiting on stylesheet network/file loads.
 *
 * - Local CSS is read from disk (paths resolved relative to the HTML file).
 * - Remote CSS is fetched; responses are cached under `cacheDir` (great for dev).
 * - Original CSS asset files are always kept for other plugins / tooling.
 *
 * @example
 * ```ts
 * import InlineCss from "frame-master-plugin-inline-css";
 *
 * export default {
 *   plugins: [InlineCss()],
 * };
 * ```
 */
export default function InlineCss(
	options?: InlineCssPluginOptions,
): FrameMasterPlugin {
	return {
		name,
		version,
		build: {
			buildConfig: () => ({
				plugins: [
					{
						name: "frame-master-plugin-inline-css",
						setup(build) {
							build.finally("html", async ({ contents, path }) => {
								const html =
									typeof contents === "string"
										? contents
										: new TextDecoder().decode(contents);

								const next = await inlineCssInHtml(html, path, options);

								return { contents: next };
							});
						},
					},
				],
			}),
		},
	};
}

export { inlineCssInHtml } from "./src/inline-html";
export type { ResolveCssOptions, ResolvedStylesheet } from "./src/resolve-css";
export {
	buildStyleTag,
	escapeCssForStyleTag,
	extractStylesheetLinks,
	resolveAllStylesheets,
	resolveLocalCss,
	resolveRemoteCss,
} from "./src/resolve-css";
