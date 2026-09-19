/**
 * Reads a base rule out of the stylesheet for layout assertions.
 *
 * Two things this has to get right, both learned the hard way:
 *  - Comments are stripped. The stylesheet explains its traps in prose, and a
 *    match against an explanation passes for the wrong reason.
 *  - The selector is anchored at column 0. The same selectors appear again,
 *    indented, inside the media queries; the first match in the file is the
 *    mobile one, and reading that instead silently tests something else.
 *    Ambiguity is an error rather than a guess.
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'css', 'style.css'), 'utf-8');
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [...BARE.matchAll(new RegExp(`^${esc}\\s*\\{`, 'gm'))];
  if (hits.length === 0) throw new Error(`no top-level rule for ${selector}`);
  if (hits.length > 1) throw new Error(`${hits.length} top-level rules for ${selector} — ambiguous`);
  const i = hits[0].index;
  return BARE.slice(i, BARE.indexOf('}', i));
}

/** True when a rule exists at all — for selectors that may legitimately repeat. */
function hasRule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc}\\s*\\{`, 'm').test(BARE);
}

module.exports = { rule, hasRule, CSS, BARE };
