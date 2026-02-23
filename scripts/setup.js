#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HOME = process.env.HOME || require('os').homedir();
const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(HOME, '.claude');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data/ directory');
}

// Check if Claude directory exists
if (!fs.existsSync(CLAUDE_DIR)) {
  console.log(`\nNote: Claude directory not found at ${CLAUDE_DIR}`);
  console.log('Set CLAUDE_DIR environment variable or install Claude Code first.');
  console.log('The dashboard will show empty data until Claude session files are available.\n');
} else {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (fs.existsSync(projectsDir)) {
    const count = fs.readdirSync(projectsDir).length;
    console.log(`Found ${count} project(s) in ${projectsDir}`);
  }
}

console.log('\nClaude Token Tracker ready! Run: npm start');
