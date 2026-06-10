#!/usr/bin/env node

/**
 * build.js - Compiles src/index.html into a single self-contained weather.html
 *
 * Reads index.html, inlines all referenced CSS and JS files, and writes weather.html.
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ROOT = __dirname;
const INPUT_HTML = path.join(ROOT, 'index.html');
const OUTPUT_HTML = path.join(ROOT, 'weather.html');

// --- Step 1: Read the HTML template ---
let html;
try {
  html = fs.readFileSync(INPUT_HTML, 'utf8');
} catch (err) {
  console.error(`Error: Cannot read ${INPUT_HTML}`);
  console.error(err.message);
  process.exit(1);
}

// --- Step 2: Inline all CSS (<link rel="stylesheet" href="...">) ---
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi,
  (_match, href) => {
    const cssPath = path.join(ROOT, href);
    let css;
    try {
      css = fs.readFileSync(cssPath, 'utf8');
    } catch {
      console.error(`Error: Cannot read CSS file: ${cssPath}`);
      process.exit(1);
    }
    return `<style>\n${css}\n</style>`;
  }
);

// --- Step 3: Inline all JS (<script src="..."></script>) ---
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

// --- Step 4: Write the output ---
try {
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`Built ${OUTPUT_HTML} successfully.`);
} catch (err) {
  console.error(`Error: Cannot write ${OUTPUT_HTML}`);
  console.error(err.message);
  process.exit(1);
}