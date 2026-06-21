#!/usr/bin/env node

/**
 * build.js - Compiles HTML templates into self-contained build/ outputs
 *
 * For weather.html: reads index.html, inlines CSS/JS (resolving @import),
 * injects README.md content, then writes weather.html, weather-full.html (with favicon),
 * and weather-prod.html (minified).
 *
 * For donkey.html: reads donkey.html, inlines CSS/JS, then writes
 * donkey-full.html (inlined) and donkey-prod.html (minified).
 *
 * All outputs go to ./build/ directory.
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');
const { execSync } = require('child_process');

// --- Configuration ---
const ROOT = __dirname;
const BUILD_DIR = path.join(ROOT, 'build');
const FAVICON_PATH = path.join(ROOT, 'hasWeather-low.png');

// Weather HTML inputs/outputs
const WEATHER_INPUT_HTML = path.join(ROOT, 'index.html');
const WEATHER_OUTPUT_HTML = path.join(BUILD_DIR, 'weather.html');
const WEATHER_OUTPUT_FULL_HTML = path.join(BUILD_DIR, 'weather-full.html');
const WEATHER_OUTPUT_PROD_HTML = path.join(BUILD_DIR, 'weather-prod.html');

// Donkey HTML inputs/outputs
const DONKEY_INPUT_HTML = path.join(ROOT, 'donkey.html');
const DONKEY_OUTPUT_FULL_HTML = path.join(BUILD_DIR, 'donkey-full.html');
const DONKEY_OUTPUT_PROD_HTML = path.join(BUILD_DIR, 'donkey-prod.html');

// --- Helper: Format file stats ---
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(date) {
  const d = date.toISOString().replace('T', ' ').substring(0, 19);
  return d;
}

function logFileEntry(label, filePath) {
  if (!fs.existsSync(filePath)) return;
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const modDate = formatDate(stats.mtime);
  const relPath = path.relative(ROOT, filePath);
  const suffix = label.endsWith(':') ? '' : ':';
  const paddedPath = relPath.padEnd(32);
  const paddedSize = formatFileSize(size).padEnd(10);
  console.log(`  ${label}${suffix} ${paddedPath} ${paddedSize} ${modDate}`);
}

// --- CSS @import resolver ---
function readCSSWithImports(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const cssDir = path.dirname(cssPath);

  return css.replace(/@import\s+['"]([^'"]+)['"];?\s*/gi, (_match, href) => {
    const resolvedPath = path.resolve(cssDir, href);
    if (!fs.existsSync(resolvedPath)) {
      return _match;
    }
    return readCSSWithImports(resolvedPath);
  });
}

// --- CSS file collector for logging ---
function collectCSSFiles(cssPath, cssSet) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const cssDir = path.dirname(cssPath);

  let match;
  const regex = /@import\s+['"]([^'"]+)['"];?\s*/gi;
  while ((match = regex.exec(css)) !== null) {
    const href = match[1];
    const resolvedPath = path.resolve(cssDir, href);
    if (fs.existsSync(resolvedPath) && !cssSet.has(resolvedPath)) {
      cssSet.add(resolvedPath);
      collectCSSFiles(resolvedPath, cssSet);
    }
  }
}

// --- Collect referenced files from HTML ---
function collectCssLinks(html) {
  const links = [];
  let match;
  const regex = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function collectJsLinks(html) {
  const files = [];
  let match;
  const regex = /<script\s+src="([^"]+)"><\/script>/gi;
  while ((match = regex.exec(html)) !== null) {
    files.push(match[1]);
  }
  return files;
}

// --- Simple Markdown → HTML parser (no external deps) ---
function markdownToHtml(md) {
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = md.split('\n');
  let html = '';
  let inList = null;
  let inPre = false;
  let codeBuf = '';
  let inTable = false;
  let tableRows = [];

  function flushList() {
    if (inList) { html += `</${inList}>\n`; inList = null; }
  }

  function flushTable() {
    if (!inTable || tableRows.length === 0) return;
    html += '<table>\n';
    tableRows.forEach((row, i) => {
      const tag = i === 0 ? 'th' : 'td';
      html += '  <tr>';
      row.forEach(cell => {
        html += ` <${tag}>${cell}</${tag}>`;
      });
      html += '</tr>\n';
    });
    html += '</table>\n';
    tableRows = [];
    inTable = false;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineParse(s) {
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/&#35;/g, '#');
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inPre) {
        html += `<pre><code>${escapeHtml(codeBuf)}</code></pre>\n`;
        inPre = false;
        codeBuf = '';
      } else {
        flushList();
        flushTable();
        inPre = true;
      }
      continue;
    }
    if (inPre) {
      codeBuf += line + '\n';
      continue;
    }

    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushList();
      flushTable();
      html += '<hr class="line-sep">\n';
      continue;
    }

    if (line.includes('|') && /^\|/.test(line.trim())) {
      flushList();
      const cells = line.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map(c => inlineParse(escapeHtml(c.trim())));
      const isSep = /^\|[\s\-:|]+\|$/.test(line.trim());
      if (isSep) continue;
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineParse(escapeHtml(headingMatch[2]))}</h${level}>\n`;
      continue;
    }

    if (/^\s*[-*+]\s/.test(line)) {
      if (inList !== 'ul') { flushList(); inList = 'ul'; html += '<ul>\n'; }
      html += `  <li>${inlineParse(escapeHtml(line.replace(/^\s*[-*+]\s+/, '')))}</li>\n`;
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      if (inList !== 'ol') { flushList(); inList = 'ol'; html += '<ol>\n'; }
      html += `  <li>${inlineParse(escapeHtml(line.replace(/^\s*\d+\.\s+/, '')))}</li>\n`;
      continue;
    }

    if (line.trim() === '') {
      flushList();
      continue;
    }

    flushList();
    html += `<p>${inlineParse(escapeHtml(line))}</p>\n`;
  }

  if (inPre) { html += `<pre><code>${escapeHtml(codeBuf)}</code></pre>\n`; }
  flushList();
  flushTable();

  return html;
}

// --- Inject README.md into about panel stub content ---
function injectAboutContent(html) {
  const readmePath = path.join(ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.log('[build] README.md not found, skipping about panel injection');
    return html;
  }

  const md = fs.readFileSync(readmePath, 'utf8');
  const rendered = markdownToHtml(md);

  const re = /<!--\s*START README\.md\s*-->([\s\S]*?)<!--\s*END README\.md\s*-->/;
  const newContent = `<!-- START README.md -->\n${rendered}<!-- END README.md -->`;

  html = html.replace(re, newContent);
  console.log('[build] Injected README.md into about panel');
  return html;
}

// --- Inject donkey markdown files into their respective stub content ---
function injectDonkeyContent(html) {
  let changed = false;

  // Inject donkey-readme.md
  const donkeyReadmePath = path.join(ROOT, 'donkey-readme.md');
  if (fs.existsSync(donkeyReadmePath)) {
    const md = fs.readFileSync(donkeyReadmePath, 'utf8');
    const rendered = markdownToHtml(md);
    const re = /<!--\s*START DONKEY-README\.md\s*-->([\s\S]*?)<!--\s*END DONKEY-README\.md\s*-->/;
    const newContent = `<!-- START DONKEY-README.md -->\n${rendered}<!-- END DONKEY-README.md -->`;
    html = html.replace(re, newContent);
    console.log('[build] Injected donkey-readme.md into panel');
    changed = true;
  } else {
    console.log('[build] donkey-readme.md not found, skipping injection');
  }

  // Inject donkey-gameplay.md
  const donkeyGameplayPath = path.join(ROOT, 'donkey-gameplay.md');
  if (fs.existsSync(donkeyGameplayPath)) {
    const md = fs.readFileSync(donkeyGameplayPath, 'utf8');
    const rendered = markdownToHtml(md);
    const re = /<!--\s*START DONKEY-GAMEPLAY\.md\s*-->([\s\S]*?)<!--\s*END DONKEY-GAMEPLAY\.md\s*-->/;
    const newContent = `<!-- START DONKEY-GAMEPLAY.md -->\n${rendered}<!-- END DONKEY-GAMEPLAY.md -->`;
    html = html.replace(re, newContent);
    console.log('[build] Injected donkey-gameplay.md into panel');
    changed = true;
  } else {
    console.log('[build] donkey-gameplay.md not found, skipping injection');
  }

  return html;
}

// --- Reusable HTML compilation function ---
// Compiles an HTML file by inlining all CSS and JS references.
function compileHtmlFile(inputPath) {
  let html;
  try {
    html = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read ${inputPath}`);
    console.error(err.message);
    process.exit(1);
  }

  // Collect CSS files for logging
  const cssLinks = collectCssLinks(html);
  const jsLinks = collectJsLinks(html);

  if (cssLinks.length > 0) {
    console.log('');
    console.log('CSS files:');
    const cssSet = new Set();
    for (const href of cssLinks) {
      const cssPath = path.join(ROOT, href);
      cssSet.add(cssPath);
      collectCSSFiles(cssPath, cssSet);
    }
    for (const cssPath of [...cssSet].sort()) {
      logFileEntry('CSS:', cssPath);
    }
  }

  if (jsLinks.length > 0) {
    console.log('');
    console.log('JS files:');
    for (const jsHref of jsLinks) {
      const jsPath = path.join(ROOT, jsHref);
      logFileEntry('JS:', jsPath);
    }
  }

  // Inline CSS
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi,
    (_match, href) => {
      const cssPath = path.join(ROOT, href);
      let css;
      try {
        css = readCSSWithImports(cssPath);
      } catch {
        console.error(`Error: Cannot read CSS file: ${cssPath}`);
        process.exit(1);
      }
      return `<style>\n${css}\n</style>`;
    }
  );

  // Inline JS
  html = html.replace(
    /<script\s+src="([^"]+)"><\/script>/gi,
    (_match, src) => {
      const jsPath = path.join(ROOT, src);
      let js;
      try {
        js = fs.readFileSync(jsPath, 'utf8');
      } catch {
        console.error(`Error: Cannot read JS file: ${jsPath}`);
        process.exit(1);
      }
      return `<script>\n${js}\n<\/script>`;
    }
  );

  return html;
}

// --- Write file and log it ---
function writeOutput(label, outputPath, content) {
  try {
    fs.writeFileSync(outputPath, content, 'utf8');
    logFileEntry(label + ':', outputPath);
  } catch (err) {
    console.error(`Error: Cannot write ${outputPath}`);
    console.error(err.message);
    process.exit(1);
  }
}

// --- Main build function ---
async function main() {
  // Create build directory if needed
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  console.log('Half-Assed Solution: build weather');
  console.log('');

  // ============================================
  // Weather builds (from index.html)
  // ============================================
  let html = compileHtmlFile(WEATHER_INPUT_HTML);
  logFileEntry('Input:', WEATHER_INPUT_HTML);

  // --- weather.html (inlined, README injected) ---
  html = injectAboutContent(html);
  writeOutput('Output', WEATHER_OUTPUT_HTML, html);

  // --- weather-full.html (inlined + README + embedded favicon) ---
  let fullHtml = injectAboutContent(html);
  if (fs.existsSync(FAVICON_PATH)) {
    const faviconData = fs.readFileSync(FAVICON_PATH);
    const faviconBase64 = faviconData.toString('base64');
    fullHtml = fullHtml.replace(
      /<link[^>]*>/gi,
      (match) => {
        const lower = match.toLowerCase();
        if (lower.includes('rel="icon"') && lower.includes('hasweather-low.png')) {
          return `<link rel="icon" type="image/png" href="data:image/png;base64,${faviconBase64}">`;
        }
        return match;
      }
    );
  }
  writeOutput('Full', WEATHER_OUTPUT_FULL_HTML, fullHtml);
  console.log('');

  // --- weather-prod.html (inlined + README + minified) ---
  const prodHtml = await minify(injectAboutContent(html), {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    removeEmptyAttributes: true,
    collapseBooleanAttributes: false,
    sortAttributes: false,
  });
  writeOutput('Prod', WEATHER_OUTPUT_PROD_HTML, prodHtml);
  console.log('');

  // ============================================
  // Donkey builds (from donkey.html)
  // ============================================
  console.log('Half-Assed Solution: build donkey');
  console.log('');

  let donkeyHtml = compileHtmlFile(DONKEY_INPUT_HTML);
  logFileEntry('Input:', DONKEY_INPUT_HTML);

  // --- donkey-full.html (inlined + README injected, no minification) ---
  donkeyHtml = injectDonkeyContent(donkeyHtml);
  writeOutput('Full', DONKEY_OUTPUT_FULL_HTML, donkeyHtml);
  console.log('');

  // --- donkey-prod.html (inlined + README injected + minified) ---
  const donkeyProdHtml = await minify(injectDonkeyContent(donkeyHtml), {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    removeEmptyAttributes: true,
    collapseBooleanAttributes: false,
    sortAttributes: false,
  });
  writeOutput('Prod', DONKEY_OUTPUT_PROD_HTML, donkeyProdHtml);
  console.log('');

  // ============================================
  // Commit all build output to git
  // ============================================
  console.log('Committing build output...');
  try {
    execSync(`git add "${BUILD_DIR}"`, { stdio: 'inherit' });

    const sizes = [];
    const files = [
      ['weather.html', WEATHER_OUTPUT_HTML],
      ['weather-full.html', WEATHER_OUTPUT_FULL_HTML],
      ['weather-prod.html', WEATHER_OUTPUT_PROD_HTML],
      ['donkey-full.html', DONKEY_OUTPUT_FULL_HTML],
      ['donkey-prod.html', DONKEY_OUTPUT_PROD_HTML],
    ];
    for (const [name, filePath] of files) {
      if (fs.existsSync(filePath)) {
        sizes.push(`${name} [${formatFileSize(fs.statSync(filePath).size)}]`);
      }
    }

    execSync(
      `git commit -m "Build: ${sizes.join(', ')}"`,
      { stdio: 'inherit' }
    );
    console.log('');
    console.log('Build complete!');
  } catch (err) {
    console.error('Git commit failed (nothing to commit or no git repo?):', err.message);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});