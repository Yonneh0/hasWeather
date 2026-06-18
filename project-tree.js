#!/usr/bin/env node
import { readFileSync, statSync, readdirSync } from 'fs';
import { relative, join, basename } from 'path';

const rootName = basename(process.cwd());

const skippedFolders = new Map([
  ['node_modules', { display: 'node_modules', special: false }],
  ['.git', { display: '.git', special: true }],
  ['.vscode', { display: '.vscode', special: false }],
  ['dist', { display: 'dist', special: false }],
  ['build', { display: 'build', special: false }],
  ['.next', { display: '.next', special: false }],
  ['.nuxt', { display: '.nuxt', special: false }],
  ['coverage', { display: 'coverage', special: false }],
  ['.cache', { display: '.cache', special: false }],
  ['tmp', { display: 'tmp', special: false }],
  ['temp', { display: 'temp', special: false }],
]);

const binaryExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'mp4', 'webm', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'zip', 'gz', 'tar', 'wasm', 'exe', 'dll', 'so', 'dylib', 'pdf', 'bmp', 'webp', 'cur', 'tiff', 'tif']);

const mimeMap = {
  'js': 'JavaScript',
  'mjs': 'JavaScript Module',
  'cjs': 'CommonJS Module',
  'ts': 'TypeScript',
  'tsx': 'TypeScript React',
  'jsx': 'JavaScript React',
  'css': 'Cascading Style Sheet',
  'html': 'HTML Document',
  'htm': 'HTML Document',
  'json': 'JSON Data',
  'xml': 'XML Document',
  'md': 'Markdown Document',
  'txt': 'Plain Text',
  'csv': 'CSV Data',
  'yml': 'YAML Data',
  'yaml': 'YAML Data',
  'toml': 'TOML Data',
  'svg': 'SVG Image',
  'png': 'PNG Image',
  'jpg': 'JPEG Image',
  'jpeg': 'JPEG Image',
  'gif': 'GIF Image',
  'webp': 'WebP Image',
  'ico': 'ICO Image',
  'mp4': 'MPEG-4 Video',
  'webm': 'WebM Video',
  'mp3': 'MP3 Audio',
  'wav': 'WAV Audio',
  'woff': 'WOFF Font',
  'woff2': 'WOFF2 Font',
  'ttf': 'TrueType Font',
  'otf': 'OpenType Font',
  'eot': 'Embedded OpenType Font',
  'zip': 'ZIP Archive',
  'gz': 'GZIP Archive',
  'tar': 'TAR Archive',
  'wasm': 'WebAssembly Module',
  'lock': 'Lock File',
  'map': 'Source Map',
  'env': 'Environment Variable',
  'sh': 'Shell Script',
  'bat': 'Batch File',
  'ps1': 'PowerShell Script',
  'py': 'Python',
  'rb': 'Ruby',
  'go': 'Go Source',
  'rs': 'Rust',
  'c': 'C Source',
  'cpp': 'C++ Source',
  'h': 'C Header',
  'hpp': 'C++ Header',
  'java': 'Java Source',
  'kt': 'Kotlin',
  'php': 'PHP',
  'swift': 'Swift',
  'dart': 'Dart',
  'vue': 'Vue Component',
  'svelte': 'Svelte Component',
  'graphql': 'GraphQL Schema',
  'sql': 'SQL Script',
  'lua': 'Lua Script',
};

function headingLevel(depth) {
  const level = depth + 2;
  return '#'.repeat(Math.min(level, 6));
}

function countLines(filePath) {
  try {
    return readFileSync(filePath, 'utf-8').split(/\r?\n/).length;
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return 0;
    return -1;
  }
}

function mimeInfo(ext) {
  const type = mimeMap[ext] || 'Data';
  return [type, ext];
}

function isBinary(filePath, ext) {
  return binaryExtensions.has(ext);
}

function walk(dirPath, depth, rootDir) {
  const entries = readdirSync(dirPath);
  const dirs = entries.filter(n => statSync(join(dirPath, n)).isDirectory()).sort();
  const files = entries.filter(n => !statSync(join(dirPath, n)).isDirectory()).sort();
  const items = [...dirs, ...files];
  const lines = [];

  for (const name of items) {
    const fullPath = join(dirPath, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      if (skippedFolders.has(name)) {
        let childCount = 0;
        try {
          childCount = readdirSync(fullPath).length;
        } catch {}
        const info = skippedFolders.get(name);
        const specialTag = info.special ? ' - GIT Folder' : '';
        lines.push(`${headingLevel(depth)} ${info.display}/ - ${childCount} items${specialTag}`);
      } else {
        const subItems = readdirSync(fullPath);
        const dirName = name.endsWith('/') ? name : name + '/';
        lines.push(`${headingLevel(depth)} ${dirName} - ${subItems.length} items - Directory`);
        lines.push(...walk(fullPath, depth + 1, rootDir));
      }
    } else {
      const ext = basename(name).split('.').pop().toLowerCase();
      const [type] = mimeInfo(ext);
      const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
      if (isBinary(fullPath, ext)) {
        const size = statSync(fullPath).size;
        lines.push(`${headingLevel(depth)} ${relPath} - ${size} bytes - ${type} (${ext})`);
      } else {
        const lineCount = countLines(fullPath);
        if (lineCount > 0) {
          lines.push(`${headingLevel(depth)} ${relPath} - ${lineCount} lines - ${type} (${ext})`);
        } else {
          const size = statSync(fullPath).size;
          lines.push(`${headingLevel(depth)} ${relPath} - ${size} bytes - ${type} (${ext})`);
        }
      }
    }
  }

  return lines;
}

const rootDir = process.cwd();
const allRoot = readdirSync(rootDir);
const rootDirs = allRoot.filter(n => statSync(join(rootDir, n)).isDirectory()).sort();
const rootFiles = allRoot.filter(n => !statSync(join(rootDir, n)).isDirectory()).sort();
const rootItems = [...rootDirs, ...rootFiles];

console.log(`#${rootName}/\n`);

for (const name of rootItems) {
  let st;
  const fullPath = join(rootDir, name);
  try {
    st = statSync(fullPath);
  } catch {
    continue;
  }

  if (st.isDirectory()) {
    if (skippedFolders.has(name)) {
      let childCount = 0;
      try { childCount = readdirSync(fullPath).length; } catch {}
      const info = skippedFolders.get(name);
      const specialTag = info.special ? ' - GIT Folder' : '';
      console.log(`${headingLevel(0)} ${info.display}/ - ${childCount} items${specialTag}\n`);
    } else {
      const subItems = readdirSync(fullPath);
      const dirName = name + '/';
      console.log(`${headingLevel(0)} ${dirName} - ${subItems.length} items - Directory\n`);
      for (const line of walk(fullPath, 1, rootDir)) {
        console.log(line + '\n');
      }
    }
  } else {
    const ext = basename(name).split('.').pop().toLowerCase();
    const [type] = mimeInfo(ext);
    if (isBinary(fullPath, ext)) {
      const size = statSync(fullPath).size;
      console.log(`${headingLevel(0)} ${name} - ${size} bytes - ${type} (${ext})\n`);
    } else {
      const lineCount = countLines(fullPath);
      if (lineCount > 0) {
        console.log(`${headingLevel(0)} ${name} - ${lineCount} lines\n`);
      } else {
        const size = statSync(fullPath).size;
        console.log(`${headingLevel(0)} ${name} - ${size} bytes - ${type} (${ext})\n`);
      }
    }
  }
}