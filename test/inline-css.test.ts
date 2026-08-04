import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inlineCssInHtml } from "../src/inline-html";
import {
	buildStyleTag,
	escapeCssForStyleTag,
	extractStylesheetLinks,
	resolveLocalCss,
} from "../src/resolve-css";

const FIXTURE_ROOT = join(import.meta.dir, ".fixtures");
const HTML_DIR = join(FIXTURE_ROOT, "pages");
const CSS_DIR = join(FIXTURE_ROOT, "pages", "static");
const CACHE_DIR = join(FIXTURE_ROOT, "cache");

beforeAll(async () => {
	await rm(FIXTURE_ROOT, { recursive: true, force: true });
	await mkdir(CSS_DIR, { recursive: true });
	await writeFile(
		join(CSS_DIR, "app.css"),
		"body { color: red; }\n/* </style> probe */\n",
	);
	await writeFile(
		join(CSS_DIR, "print.css"),
		"@media print { body { color: black; } }",
	);
});

afterAll(async () => {
	await rm(FIXTURE_ROOT, { recursive: true, force: true });
});

describe("extractStylesheetLinks", () => {
	test("finds stylesheet links and ignores icons", () => {
		const html = `
			<link rel="icon" href="/favicon.ico" />
			<link rel="stylesheet" href="./static/app.css" />
			<link href="./static/print.css" rel="stylesheet" media="print" />
			<link rel="preload" href="./static/app.css" as="style" />
		`;
		const links = extractStylesheetLinks(html);
		expect(links).toEqual([
			{ href: "./static/app.css", media: null },
			{ href: "./static/print.css", media: "print" },
		]);
	});
});

describe("escapeCssForStyleTag", () => {
	test("escapes closing style tags inside CSS", () => {
		expect(escapeCssForStyleTag("a{} /* </style> */")).toBe(
			"a{} /* <\\/style> */",
		);
	});
});

describe("buildStyleTag", () => {
	test("includes data attributes and media", () => {
		const tag = buildStyleTag("body{}", "./a.css", "print");
		expect(tag).toContain("data-inline-css");
		expect(tag).toContain('data-href="./a.css"');
		expect(tag).toContain('media="print"');
		expect(tag).toContain("body{}");
	});
});

describe("resolveLocalCss", () => {
	test("resolves relative to HTML path", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		const css = await resolveLocalCss("./static/app.css", htmlPath);
		expect(css).toContain("color: red");
	});

	test("resolves root-relative paths against resolveRoots, not OS root", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		// /static/app.css must map to FIXTURE_ROOT/pages/static/app.css via roots,
		// never to the filesystem path /static/app.css
		const css = await resolveLocalCss("/static/app.css", htmlPath, [
			HTML_DIR,
			FIXTURE_ROOT,
		]);
		expect(css).toContain("color: red");
	});

	test("resolves root-relative paths via cwd when under project root", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		// Place a file under a temp project-style root and point resolveRoots at it
		const projectRoot = join(FIXTURE_ROOT, "project");
		const absCssDir = join(projectRoot, "assets");
		await mkdir(absCssDir, { recursive: true });
		await writeFile(join(absCssDir, "site.css"), ".root { color: blue; }");

		const css = await resolveLocalCss("/assets/site.css", htmlPath, [
			projectRoot,
		]);
		expect(css).toContain("color: blue");
	});
});

describe("inlineCssInHtml root-relative", () => {
	test("inlines root-relative stylesheet links from project roots", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		const html = `<!doctype html><html><head>
			<link rel="stylesheet" href="/static/app.css" />
		</head><body></body></html>`;

		const out = await inlineCssInHtml(html, htmlPath, {
			inlineRemote: false,
			resolveRoots: [HTML_DIR],
			warn: () => {},
		});

		expect(out).not.toContain('rel="stylesheet"');
		expect(out).toContain("data-inline-css");
		expect(out).toContain("color: red");
	});
});

describe("inlineCssInHtml", () => {
	test("replaces local stylesheet links with style tags", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		const html = `<!doctype html><html><head>
			<link rel="stylesheet" href="./static/app.css" />
			<link rel="icon" href="/favicon.ico" />
		</head><body></body></html>`;

		const out = await inlineCssInHtml(html, htmlPath, {
			inlineRemote: false,
			warn: () => {},
		});

		expect(out).not.toContain('rel="stylesheet"');
		expect(out).toContain("<style");
		expect(out).toContain("data-inline-css");
		expect(out).toContain("color: red");
		expect(out).toContain('rel="icon"');
		// escaped probe from fixture CSS
		expect(out).toContain("<\\/style>");
	});

	test("preserves media attribute", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		const html = `<link rel="stylesheet" href="./static/print.css" media="print" />`;
		const out = await inlineCssInHtml(html, htmlPath, { warn: () => {} });
		expect(out).toContain('media="print"');
		expect(out).toContain("@media print");
	});

	test("leaves unresolved links alone", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		const html = `<link rel="stylesheet" href="./static/missing.css" />`;
		const out = await inlineCssInHtml(html, htmlPath, { warn: () => {} });
		expect(out).toContain('href="./static/missing.css"');
		expect(out).not.toContain("data-inline-css");
	});

	test("inlines remote CSS with cache", async () => {
		const htmlPath = join(HTML_DIR, "index.html");
		// Use a tiny data-less public CSS via httpbin alternative — use a
		// mock by writing through cache prefer path: spin a local server.
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response("/* remote */ .x { display:block }", {
					headers: { "Content-Type": "text/css" },
				});
			},
		});

		try {
			const url = `http://127.0.0.1:${server.port}/remote.css`;
			const html = `<link rel="stylesheet" href="${url}" />`;

			const out1 = await inlineCssInHtml(html, htmlPath, {
				cacheDir: CACHE_DIR,
				preferCache: false,
				warn: () => {},
			});
			expect(out1).toContain("data-inline-css");
			expect(out1).toContain(".x { display:block }");

			// Second call with preferCache should hit disk even if server is down
			server.stop(true);
			const out2 = await inlineCssInHtml(html, htmlPath, {
				cacheDir: CACHE_DIR,
				preferCache: true,
				warn: () => {},
			});
			expect(out2).toContain(".x { display:block }");
		} finally {
			try {
				server.stop(true);
			} catch {
				/* already stopped */
			}
		}
	});
});
