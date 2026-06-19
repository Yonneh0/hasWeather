#!/usr/bin/env node

/**
 * build.js - Compiles src/index.html into a single self-contained weather.html
 *
 * Reads index.html, inlines all referenced CSS and JS files (resolving @import),
 * and writes weather.html. Then generates weather-full.html (with favicon) and
 * weather-prod.html (minified, no favicon).
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');
const { execSync } = require('child_process');

// --- Simple Markdown → HTML parser (no external deps) ---
  function markdownToHtml(md) {
    // Normalize Windows CRLF to LF so regexes work correctly
    md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = md.split('\n');
  let html = '';
  let inList = null;       // 'ul' or 'ol'
  let inPre = false;
  let preContent = '';
  let inTable = false;
  let tableRows = [];
  let codeInline = false;
  let codeBuf = '';

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
    // Bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Restore # heading markers that were escaped by escapeHtml
    s = s.replace(/&#35;/g, '#');
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks (``` ... ```)
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

    // Horizontal rule (---, ***, ___)
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushList();
      flushTable();
      html += '<hr class="line-sep">\n';
      continue;
    }

    // Table rows
    if (line.includes('|') && /^\|/.test(line.trim())) {
      flushList();
      const cells = line.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map(c => inlineParse(escapeHtml(c.trim())));
      const isSep = /^\|[\s\-:|]+\|$/.test(line.trim());
      if (isSep) continue; // skip separator line
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineParse(escapeHtml(headingMatch[2]))}</h${level}>\n`;
      continue;
    }

    // Unordered list item
    if (/^\s*[-*+]\s/.test(line)) {
      if (inList !== 'ul') { flushList(); inList = 'ul'; html += '<ul>\n'; }
      html += `  <li>${inlineParse(escapeHtml(line.replace(/^\s*[-*+]\s+/, '')))}</li>\n`;
      continue;
    }

    // Ordered list item
    if (/^\s*\d+\.\s/.test(line)) {
      if (inList !== 'ol') { flushList(); inList = 'ol'; html += '<ol>\n'; }
      html += `  <li>${inlineParse(escapeHtml(line.replace(/^\s*\d+\.\s+/, '')))}</li>\n`;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    html += `<p>${inlineParse(escapeHtml(line))}</p>\n`;
  }

  // Flush remaining
  if (inPre) { html += `<pre><code>${escapeHtml(codeBuf)}</code></pre>\n`; }
  flushList();
  flushTable();

  return html;
}

// --- Inject README.md into about panel stub content ---
function injectAboutContent(html, callNum) {
  const readmePath = path.join(ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.log('[build] README.md not found, skipping about panel injection');
    return html;
  }

  const md = fs.readFileSync(readmePath, 'utf8');
  const rendered = markdownToHtml(md);

  // Replace everything between <!-- START README.md --> and <!-- END README.md --> markers.
  const re = /<!--\s*START README\.md\s*-->([\s\S]*?)<!--\s*END README\.md\s*-->/;
  const newContent = `<!-- START README.md -->\n${rendered}<!-- END README.md -->`;

  const beforeMatch = re.test(html);
  html = html.replace(re, newContent);
  console.log(`[build] injectAboutContent call #${callNum}: marker found=${beforeMatch}, rendered md length=${rendered.length}`);

  return html;
}

// --- Configuration ---
const ROOT = __dirname;
const INPUT_HTML = path.join(ROOT, 'index.html');
const OUTPUT_HTML = path.join(ROOT, 'weather.html');
const OUTPUT_FULL_HTML = path.join(ROOT, 'weather-full.html');
const OUTPUT_PROD_HTML = path.join(ROOT, 'weather-prod.html');
const FAVICON_PATH = path.join(ROOT, 'hasWeather-low.png');

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
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const modDate = formatDate(stats.mtime);
  const relPath = path.relative(ROOT, filePath);
  // label should end with ':' (e.g. "Input:", "CSS:", "JS:", "Output:")
  const suffix = label.endsWith(':') ? '' : ':';
  // Pad filename and size for alignment: sizes max ~7 chars (e.g. "43.2 KB"), dates fixed 19 chars
  const paddedPath = relPath.padEnd(32);
  const paddedSize = formatFileSize(size).padEnd(10);
  console.log(`  ${label}${suffix} ${paddedPath} ${paddedSize} ${modDate}`);
}

// --- CSS @import resolver ---
// Recursively reads a CSS file and resolves all @import statements,
// replacing them with the referenced file's content.
function readCSSWithImports(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const cssDir = path.dirname(cssPath);

  return css.replace(/@import\s+['"]([^'"]+)['"];?\s*/gi, (_match, href) => {
    const resolvedPath = path.resolve(cssDir, href);
    // If the file doesn't exist locally, leave the @import as-is (external URL)
    if (!fs.existsSync(resolvedPath)) {
      return _match;
    }
    return readCSSWithImports(resolvedPath);
  });
}

// --- Main build function ---
async function main() {
  console.log('Half-Assed Solution: build weather');
  console.log('');

  // --- Step 1: Read the HTML template ---
  let html;
  try {
    html = fs.readFileSync(INPUT_HTML, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read ${INPUT_HTML}`);
    console.error(err.message);
    process.exit(1);
  }
  logFileEntry('Input:', INPUT_HTML);

  // --- Step 2: Resolve all CSS files (with @import recursion) ---
  function collectCSSFiles(cssPath) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const cssDir = path.dirname(cssPath);

    let match;
    const regex = /@import\s+['"]([^'"]+)['"];?\s*/gi;
    while ((match = regex.exec(css)) !== null) {
      const href = match[1];
      const resolvedPath = path.resolve(cssDir, href);
      if (fs.existsSync(resolvedPath)) {
        cssSet.add(resolvedPath);
        collectCSSFiles(resolvedPath);
      }
    }
  }

  // Scan index.html for CSS <link> tags
  const cssLinks = [];
  let cssMatch;
  const cssRegex = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi;
  while ((cssMatch = cssRegex.exec(html)) !== null) {
    cssLinks.push(cssMatch[1]);
  }

  // Collect all CSS files recursively
  const cssSet = new Set();
  for (const href of cssLinks) {
    const cssPath = path.join(ROOT, href);
    cssSet.add(cssPath);
    collectCSSFiles(cssPath);
  }

  // De-duplicate and log CSS files
  console.log('');
  console.log('CSS files:');
  for (const cssPath of [...cssSet].sort()) {
    logFileEntry('CSS:', cssPath);
  }

  // --- Step 3: Collect JS files ---
  const jsFiles = [];
  let jsMatch;
  const jsRegex = /<script\s+src="([^"]+)"><\/script>/gi;
  while ((jsMatch = jsRegex.exec(html)) !== null) {
    jsFiles.push(jsMatch[1]);
  }

  console.log('');
  console.log('JS files:');
  for (const jsHref of jsFiles) {
    const jsPath = path.join(ROOT, jsHref);
    logFileEntry('JS:', jsPath);
  }

  // --- Step 4: Inline all CSS ---
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

  // --- Step 5: Inline all JS ---
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

  // --- Step 6: Inject README.md into about panel, then write output ---
  html = injectAboutContent(html, 1);

  try {
    fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot write ${OUTPUT_HTML}`);
    console.error(err.message);
    process.exit(1);
  }
  logFileEntry('Output:', OUTPUT_HTML);

  // --- Step 7: Generate weather-full.html (with embedded favicon) ---
  let fullHtml = injectAboutContent(html, 2);

  // Read favicon as base64
  if (fs.existsSync(FAVICON_PATH)) {
    const faviconData = fs.readFileSync(FAVICON_PATH);
    const faviconBase64 = faviconData.toString('base64');

    // Replace the favicon link tag with an inline data URI
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

  try {
    fs.writeFileSync(OUTPUT_FULL_HTML, fullHtml, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot write ${OUTPUT_FULL_HTML}`);
    console.error(err.message);
    process.exit(1);
  }
  logFileEntry('Full:', OUTPUT_FULL_HTML);
  console.log('');

  // --- Step 8: Generate weather-prod.html (minified, no favicon) ---
  const prodHtml = await minify(injectAboutContent(html, 3), {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    removeEmptyAttributes: true,
    collapseBooleanAttributes: false,
    sortAttributes: false,
  });

  try {
    fs.writeFileSync(OUTPUT_PROD_HTML, prodHtml, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot write ${OUTPUT_PROD_HTML}`);
    console.error(err.message);
    process.exit(1);
  }
  logFileEntry('Prod:', OUTPUT_PROD_HTML);
  console.log('');

  // --- Step 9: Commit the 3 files to git ---
  console.log('Committing build output...');
  try {
    execSync('git add weather.html weather-full.html weather-prod.html', { stdio: 'inherit' });
    execSync(
      `git commit -m "Build: weather.html [${formatFileSize(fs.statSync(OUTPUT_HTML).size)}], weather-full.html [${formatFileSize(fs.statSync(OUTPUT_FULL_HTML).size)}], weather-prod.html [${formatFileSize(fs.statSync(OUTPUT_PROD_HTML).size)}]"`,
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