#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync } from 'fs';

function hasBun() {
    try {
        execSync('bun --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

if (!hasBun()) {
    if (existsSync('dist/ccstatusline.js')) {
        console.log('Skipping build (bun not found, using pre-built dist)');
        process.exit(0);
    }
    console.error('Error: bun is required to build ccstatusline. Install it: curl -fsSL https://bun.sh/install | bash');
    process.exit(1);
}

console.log('Building with bun...');
execSync('bun build src/ccstatusline.ts --target=node --outfile=dist/ccstatusline.js --target-version=14', {
    stdio: 'inherit'
});
execSync('bun run scripts/replace-version.ts', { stdio: 'inherit' });
