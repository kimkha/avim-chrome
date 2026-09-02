/**
 * Chrome ships no test runner for third-party extensions: chrome.test needs a C++ ExtensionApiTest
 * harness inside a Chromium build, so the documented path is a browser driver with
 * --load-extension. This harness is that path, kept to the cases a fake DOM cannot model — real
 * injection, real Selection ranges, shadow-root retargeting, iframes and the system clipboard.
 */

import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");

const NESTED_PAGE = '<!DOCTYPE html><html><body><textarea id="nested"></textarea></body></html>';

function outerPage(altOrigin) {
	return `<!DOCTYPE html><html><body>
<textarea id="textarea"></textarea>
<input id="bare">
<input id="text" type="text">
<input id="search" type="search">
<input id="tel" type="tel">
<input id="emailType" type="email">
<input id="url" type="url">
<input id="password" type="password">
<input id="email">
<input id="byName" name="email">
<div id="editable" contenteditable="true"></div>
<div id="spaced" contenteditable="true">xin </div>
<div id="splitBold" contenteditable="true">ngu<b>oi</b></div>
<div id="splitSpans" contenteditable="true"><span>ngu</span><span>oi</span></div>
<div id="blocks" contenteditable="true"><div>xin</div><div>chao</div></div>
<div id="controlled" contenteditable="true" data-slate-editor="true"></div>
<textarea id="eventProbe"></textarea>
<div id="host"></div>
<div id="slot"></div>
<iframe id="sameOrigin" src="/nested"></iframe>
<iframe id="crossOrigin" src="${altOrigin}/nested"></iframe>
<iframe id="designMode"></iframe>
<script>
	document.getElementById("host").attachShadow({ mode: "open" }).innerHTML =
		'<textarea id="shadowTextarea"></textarea><input id="shadowText" type="text">';
	const dynamic = document.createElement("textarea");
	dynamic.id = "dynamic";
	document.getElementById("slot").appendChild(dynamic);
	document.getElementById("designMode").contentDocument.designMode = "on";
	window.__inputEvents = 0;
	document.getElementById("eventProbe").addEventListener("input", () => {
		window.__inputEvents++;
	});
	window.__editableInputEvents = 0;
	document.getElementById("editable").addEventListener("input", () => {
		window.__editableInputEvents++;
	});

	// #controlled stands in for Slate/Draft-style editors such as Discord's message box: it owns
	// beforeinput, applies each one to its own model, and re-renders the DOM from that model.
	const controlled = document.getElementById("controlled");
	let model = "";
	controlled.addEventListener("beforeinput", (event) => {
		event.preventDefault();
		if (event.inputType === "deleteContentBackward") {
			model = model.slice(0, -1);
		} else if ((event.inputType === "insertText") && (event.data != null)) {
			model += event.data;
		}
		controlled.textContent = model;
		const range = document.createRange();
		if (controlled.firstChild) {
			range.setStart(controlled.firstChild, controlled.firstChild.data.length);
		} else {
			range.setStart(controlled, 0);
		}
		range.collapse(true);
		const selection = getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	});
	window.__resetControlled = () => {
		model = "";
		controlled.textContent = "";
	};
</script>
</body></html>`;
}

/**
 * Real editor frameworks on one page, pulled from a CDN at run time so the repo keeps its
 * no-install test suite. Each is here for a different reason. Slate reverts a DOM edit AVIM makes
 * silently (#30). Lexical, Quill and ProseMirror reconcile it instead, and are what a synthetic
 * beforeinput sent to everyone would break. CKEditor reverts like Slate but corrupts that same
 * beforeinput, which is why the announcement is an allowlist and not a learned capability. The
 * controlled React input is here because a plain field has the same divergence: what the page reads
 * is the component's state, not the DOM value AVIM wrote.
 */
const FRAMEWORK_EDITORS_PAGE = `<!DOCTYPE html><html><head><style>
	#lexical, .ProseMirror, .ql-editor { border: 1px solid #ccc; min-height: 32px; padding: 4px }
</style></head><body>
<textarea id="ready"></textarea>
<div id="slateRoot"></div>
<div id="lexical" contenteditable="true"></div>
<div id="quillRoot"></div>
<div id="pmRoot"></div>
<div id="ckRoot"></div>
<div id="reactRoot"></div>
<script type="module">
	const REACT = "react@18.3.1";
	const DOM = "react-dom@18.3.1";
	window.__loadErrors = [];
	window.__modelText = {};

	try {
		const React = (await import(\`https://esm.sh/\${REACT}\`)).default;
		const { createRoot } = await import(\`https://esm.sh/\${DOM}/client\`);
		const { createEditor } = await import("https://esm.sh/slate@0.112.0");
		const { Slate, Editable, withReact } =
			await import(\`https://esm.sh/slate-react@0.112.1?deps=\${REACT},\${DOM},slate@0.112.0\`);
		const App = () => {
			const editor = React.useMemo(() => withReact(createEditor()), []);
			const [value, setValue] = React.useState([{ type: "p", children: [{ text: "" }] }]);
			window.__modelText.slate = () =>
				value.map((block) => block.children.map((child) => child.text).join("")).join("\\n");
			return React.createElement(Slate, { editor, initialValue: value, onChange: setValue },
				React.createElement(Editable, { id: "slate" }));
		};
		createRoot(document.getElementById("slateRoot")).render(React.createElement(App));
	} catch (error) {
		window.__loadErrors.push("slate: " + error.message);
	}

	try {
		const { createEditor, $getRoot } = await import("https://esm.sh/lexical@0.21.0");
		const { registerPlainText } =
			await import("https://esm.sh/@lexical/plain-text@0.21.0?deps=lexical@0.21.0");
		const editor = createEditor({
			namespace: "avim",
			onError: (error) => window.__loadErrors.push("lexical: " + error.message),
		});
		editor.setRootElement(document.getElementById("lexical"));
		registerPlainText(editor);
		window.__modelText.lexical = () =>
			editor.getEditorState().read(() => $getRoot().getTextContent());
	} catch (error) {
		window.__loadErrors.push("lexical: " + error.message);
	}

	try {
		const Quill = (await import("https://esm.sh/quill@2.0.3")).default;
		const quill = new Quill("#quillRoot");
		window.__modelText.quill = () => quill.getText().replace(/\\n+$/, "");
	} catch (error) {
		window.__loadErrors.push("quill: " + error.message);
	}

	try {
		const { EditorState } = await import("https://esm.sh/prosemirror-state@1.4.3");
		const { EditorView } = await import(
			"https://esm.sh/prosemirror-view@1.34.3?deps=prosemirror-state@1.4.3,prosemirror-model@1.22.3");
		const { schema } = await import(
			"https://esm.sh/prosemirror-schema-basic@1.2.3?deps=prosemirror-model@1.22.3");
		const view = new EditorView(document.getElementById("pmRoot"), { state: EditorState.create({ schema }) });
		window.__modelText.prosemirror = () => view.state.doc.textContent;
	} catch (error) {
		window.__loadErrors.push("prosemirror: " + error.message);
	}

	try {
		const { default: ClassicEditor } =
			await import("https://esm.sh/@ckeditor/ckeditor5-build-classic@41.4.2");
		const editor = await ClassicEditor.create(document.getElementById("ckRoot"));
		window.__modelText.ckeditor = () => editor.getData().replace(/<[^>]*>/g, "").trim();
	} catch (error) {
		window.__loadErrors.push("ckeditor: " + error.message);
	}

	try {
		const React = (await import(\`https://esm.sh/\${REACT}\`)).default;
		const { createRoot } = await import(\`https://esm.sh/\${DOM}/client\`);
		const Controlled = () => {
			const [value, setValue] = React.useState("");
			window.__modelText.reactField = () => value;
			const bind = { value, onChange: (event) => setValue(event.target.value) };
			return React.createElement("div", null,
				React.createElement("input", { id: "reactInput", ...bind }),
				React.createElement("textarea", { id: "reactArea", ...bind }));
		};
		createRoot(document.getElementById("reactRoot")).render(React.createElement(Controlled));
	} catch (error) {
		window.__loadErrors.push("react: " + error.message);
	}

	window.__ready = true;
</script>
</body></html>`;

async function resolveChromium() {
	let chromium;
	try {
		({ chromium } = await import("playwright-core"));
	} catch {
		return { skip: "playwright-core is not installed; run `yarn install`" };
	}

	let executablePath = process.env.AVIM_CHROME_PATH;
	if (!executablePath) {
		try {
			executablePath = chromium.executablePath();
		} catch (error) {
			return { skip: `playwright cannot locate chromium: ${error.message}` };
		}
	}
	if (!fs.existsSync(executablePath)) {
		return { skip: `no chromium at ${executablePath}; run \`npx playwright install chromium\`` };
	}
	return { chromium, executablePath };
}

function extensionDirs() {
	return ["src", "build"].filter((dir) => fs.existsSync(path.join(ROOT, dir, "manifest.json")));
}

function serve(body) {
	const server = http.createServer((request, response) => {
		response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		response.end(request.url === "/nested" ? NESTED_PAGE : body(server));
	});
	return server;
}

function listen(server) {
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

async function startFixtureServer() {
	// A second port is a second origin, which is all the cross-origin iframe case needs.
	const alt = serve(() => NESTED_PAGE);
	const altOrigin = await listen(alt);
	const main = serve(() => outerPage(altOrigin));
	const origin = await listen(main);

	return {
		origin,
		altOrigin,
		close: async () => {
			await new Promise((resolve) => main.close(resolve));
			await new Promise((resolve) => alt.close(resolve));
		},
	};
}

async function startFrameworkEditorServer() {
	const server = serve(() => FRAMEWORK_EDITORS_PAGE);
	const origin = await listen(server);
	return { origin, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function launchExtension(launcher, dir) {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "avim-browser-"));
	const extension = path.join(ROOT, dir);
	const context = await launcher.chromium.launchPersistentContext(profile, {
		executablePath: launcher.executablePath,
		headless: true,
		args: [
			`--disable-extensions-except=${extension}`,
			`--load-extension=${extension}`,
			"--no-sandbox",
		],
	});
	const worker =
		context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 30000 }));

	return {
		context,
		extensionId: new URL(worker.url()).host,
		close: async () => {
			await context.close();
			fs.rmSync(profile, { recursive: true, force: true });
		},
	};
}

function locate(page, target) {
	const spec = typeof target === "string" ? { selector: target } : target;
	const scope = spec.frame ? page.frameLocator(spec.frame) : page;
	return scope.locator(spec.selector);
}

function readEditable(element) {
	return element.value ?? element.textContent;
}

// The content script lands at document_idle and the popup boots off an async get_prefs, so the
// first keystrokes can predate the wiring. Retrying tells "slow" apart from "broken".
async function typeUntil(page, target, sequence, expected) {
	let value = "";
	for (let attempt = 0; attempt < 5; attempt++) {
		const locator = locate(page, target);
		await locator.evaluate((element) => {
			if (element.value === undefined) {
				element.textContent = "";
			} else {
				element.value = "";
			}
		});
		await locator.click();
		await page.keyboard.type(sequence, { delay: 15 });
		value = await locator.evaluate(readEditable);
		if (value === expected) {
			return value;
		}
		await page.waitForTimeout(400);
	}
	return value;
}

async function typeOnce(page, target, sequence) {
	const locator = locate(page, target);
	await locator.click();
	await page.keyboard.type(sequence, { delay: 15 });
	return locator.evaluate(readEditable);
}

export {
	resolveChromium,
	extensionDirs,
	startFixtureServer,
	startFrameworkEditorServer,
	launchExtension,
	typeUntil,
	typeOnce,
};
