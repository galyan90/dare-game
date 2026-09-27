// Basic sanity checks, no dependencies: node test/basic-test.js
// Loads the browser scripts in a stub environment and makes sure every function the
// HTML calls from an onclick/onsubmit handler actually exists.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let failures = 0;

function check(ok, message) {
    console.log(`${ok ? '✅' : '❌'} ${message}`);
    if (!ok) failures++;
}

// Minimal DOM stub – enough for the scripts to load, not to run the game.
const noop = () => {};
const element = new Proxy({}, { get: (t, k) => (k === 'style' || k === 'classList' || k === 'dataset' ? element : noop) });
const context = {
    console: { log: noop, warn: noop, error: console.error },
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: {},
    document: {
        addEventListener: noop,
        createElement: () => element,
        getElementById: () => element,
        querySelector: () => element,
        querySelectorAll: () => [],
        head: element,
        body: element,
    },
    addEventListener: noop,
    matchMedia: () => ({ matches: false }),
};
context.window = context;
vm.createContext(context);

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
check(scripts.length > 0, `index.html loads ${scripts.length} scripts`);
for (const src of scripts) {
    try {
        vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
        check(true, `${src} loads`);
    } catch (error) {
        check(false, `${src} failed to load: ${error.message}`);
    }
}

const handlers = new Set([...html.matchAll(/on(?:click|submit)="([A-Za-z_]\w*)\(/g)].map((m) => m[1]));
for (const name of handlers) {
    check(typeof context[name] === 'function', `${name}() is defined`);
}

const apiSource = fs.readFileSync(path.join(root, 'api/claude.js'), 'utf8');
check(!/gemini-pro/.test(apiSource), 'api/claude.js does not use the retired gemini-pro model');

for (const src of scripts) {
    const source = fs.readFileSync(path.join(root, src), 'utf8');
    check(!/AIza[0-9A-Za-z_-]{20,}/.test(source), `${src} contains no Gemini API key`);
}

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nAll checks passed');
