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

// --- Build Entry ---
console.log('Half-Assed Solution: build weather');
console.log('');

// --- Step 1: Read the HTML template ---
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

// --- Step 6: Write the output (weather.html - complete debug version) ---
try {
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
} catch (err) {
  console.error(`Error: Cannot write ${OUTPUT_HTML}`);
  console.error(err.message);
  process.exit(1);
}

// Log output file stats
console.log('');
logFileEntry('Output:', OUTPUT_HTML);

// --- Step 7: Generate weather-full.html (with embedded favicon) ---
let fullHtml = html;

// Read favicon as base64
if (fs.existsSync(FAVICON_PATH)) {
  const faviconData = fs.readFileSync(FAVICON_PATH);
  const faviconBase64 = faviconData.toString('base64');

  // Replace the favicon link tag with an inline data URI
  fullHtml = fullHtml.replace(
    /<link[^>]*>/gi,
    (match) => {
      const lower = match.toLowerCase();
      if (lower.includes('rel="icon"') && lower.includes('hasWeather-low.png')) {
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
let prodHtml = html;

// Step 8a: Remove HTML comments
prodHtml = prodHtml.replace(/<!--[\s\S]*?-->/g, '');

// Step 8b: Remove unnecessary whitespace while preserving content inside <style> and <script> tags
// Strategy: Extract style/script contents, strip whitespace outside them, then restore
const placeholders = [];

// Extract <style> block contents
prodHtml = prodHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, content) => {
  const idx = placeholders.length;
  placeholders.push({ type: 'style', content });
  return `__PLACEHOLDER_${idx}__`;
});

// Extract <script> block contents
prodHtml = prodHtml.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_match, content) => {
  const idx = placeholders.length;
  placeholders.push({ type: 'script', content });
  return `__PLACEHOLDER_${idx}__`;
});

// Remove unnecessary whitespace: collapse multiple whitespace to single space, remove spaces around tags
prodHtml = prodHtml.replace(/>\s+</g, '><');
prodHtml = prodHtml.replace(/\s{2,}/g, ' ');

// Restore placeholders
placeholders.forEach((p, idx) => {
  prodHtml = prodHtml.replace(`__PLACEHOLDER_${idx}__`, p.content);
});

// Clean up any trailing/leading whitespace on lines
prodHtml = prodHtml.replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '');

try {
  fs.writeFileSync(OUTPUT_PROD_HTML, prodHtml, 'utf8');
} catch (err) {
  console.error(`Error: Cannot write ${OUTPUT_PROD_HTML}`);
  console.error(err.message);
  process.exit(1);
}

logFileEntry('Prod:', OUTPUT_PROD_HTML);

// --- Step 9: Commit the 3 files to git ---
console.log('');
console.log('Committing build output...');

const { execSync } = require('child_process');

try {
  execSync('git add weather.html weather-full.html weather-prod.html', { stdio: 'inherit' });
  execSync(`git commit -m "Build: weather.html [${formatFileSize(fs.statSync(OUTPUT_HTML).size)}], weather-full.html [${formatFileSize(fs.statSync(OUTPUT_FULL_HTML).size)}], weather-prod.html [${formatFileSize(fs.statSync(OUTPUT_PROD_HTML).size)}]"`, { stdio: 'inherit' });
  console.log('');
  console.log('Build complete!');
} catch (err) {
  console.error('Git commit failed (nothing to commit or no git repo?):', err.message);
}