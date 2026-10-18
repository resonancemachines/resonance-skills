#!/usr/bin/env node

/**
 * Resonance Platform Agent Skills Installer
 * Supports zero-dependency standalone installation, or acts as a companion to 'skills' CLI.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILLS = ['resonance-developer', 'resonance-contract-mesh', 'resonance-guardrail-auditor'];
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isGlobal = args.includes('-g') || args.includes('--global');
const isAll = args.includes('--all') || (!args.some(a => a.startsWith('-')));
const isList = args.includes('-l') || args.includes('--list');

console.log('\x1b[36m%s\x1b[0m', '╭───────────────────────────────────────────────────╮');
console.log('\x1b[36m%s\x1b[0m', '│       Resonance Platform Agent Skills Suite       │');
console.log('\x1b[36m%s\x1b[0m', '╰───────────────────────────────────────────────────╯');

if (isList) {
  console.log('\nAvailable skills in resonancemachines/resonance-skills:\n');
  for (const skill of SKILLS) {
    const skillMd = fs.readFileSync(path.join(ROOT_DIR, skill, 'SKILL.md'), 'utf8');
    const descMatch = skillMd.match(/description:\s*(?:>)?\s*([\s\S]*?)---/);
    const desc = descMatch ? descMatch[1].replace(/\n/g, ' ').trim() : '';
    console.log(`  • \x1b[32m${skill}\x1b[0m: ${desc.substring(0, 100)}...`);
  }
  process.exit(0);
}

// Target directory resolution
let targetBaseDir;
if (isGlobal) {
  targetBaseDir = path.join(os.homedir(), '.gemini', 'config', 'skills');
} else {
  targetBaseDir = path.join(process.cwd(), '.agent', 'skills');
}

console.log(`\nTarget Directory: \x1b[33m${targetBaseDir}\x1b[0m\n`);

let skillsToInstall = SKILLS;
const specificSkillArg = args.find(a => a.startsWith('--skill='));
if (specificSkillArg) {
  const selected = specificSkillArg.split('=')[1];
  skillsToInstall = SKILLS.filter(s => s === selected);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const skill of skillsToInstall) {
  const src = path.join(ROOT_DIR, skill);
  const dest = path.join(targetBaseDir, skill);
  console.log(`Installing \x1b[32m${skill}\x1b[0m -> ${dest}...`);
  copyRecursive(src, dest);
}

console.log('\n\x1b[32m✔ Successfully installed Resonance skills!\x1b[0m\n');
