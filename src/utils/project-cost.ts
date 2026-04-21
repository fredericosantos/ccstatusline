import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { calcCost } from './pricing';

const CACHE_TTL_MS = 30_000;
const cacheDir = path.join(os.homedir(), '.cache', 'ccstatusline');

interface ProjectCostCache {
    cost: number;
    cachedTokens: number;
    computedAt: number;
}

function cacheFilePath(cwd: string): string {
    const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 16);
    return path.join(cacheDir, `project-cost-${hash}.json`);
}

function readCache(cwd: string): ProjectCostCache | null {
    try {
        const raw = fs.readFileSync(cacheFilePath(cwd), 'utf8');
        const parsed = JSON.parse(raw) as ProjectCostCache;
        if (Date.now() - parsed.computedAt < CACHE_TTL_MS) {
            return parsed;
        }
    } catch {
        // cache miss
    }
    return null;
}

function writeCache(cwd: string, data: ProjectCostCache): void {
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFilePath(cwd), JSON.stringify(data));
    } catch {
        // ignore write errors
    }
}

function encodeCwd(cwd: string): string {
    return cwd.replace(/\//g, '-');
}

interface AssistantLine {
    type?: string;
    message?: {
        model?: string;
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    };
}

function listJsonlFiles(projectDir: string): string[] {
    try {
        return fs.readdirSync(projectDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => path.join(projectDir, f));
    } catch {
        return [];
    }
}

function scanProjectDir(projectDir: string): { cost: number; cachedTokens: number } {
    let cost = 0;
    let cachedTokens = 0;

    for (const file of listJsonlFiles(projectDir)) {
        let content: string;
        try {
            content = fs.readFileSync(file, 'utf8');
        } catch {
            continue;
        }

        for (const line of content.split('\n')) {
            if (!line) {
                continue;
            }
            let data: AssistantLine;
            try {
                data = JSON.parse(line) as AssistantLine;
            } catch {
                continue;
            }

            const usage = data.message?.usage;
            if (!usage || data.type !== 'assistant') {
                continue;
            }

            const input = usage.input_tokens ?? 0;
            const output = usage.output_tokens ?? 0;
            const cacheWrite = usage.cache_creation_input_tokens ?? 0;
            const cacheRead = usage.cache_read_input_tokens ?? 0;

            cost += calcCost(data.message?.model, { input, output, cacheWrite, cacheRead });
            cachedTokens += cacheWrite + cacheRead;
        }
    }

    return { cost, cachedTokens };
}

export interface ProjectCostResult {
    cost: number;
    cachedTokens: number;
}

export function getProjectCost(cwd: string | undefined): ProjectCostResult | null {
    if (!cwd) {
        return null;
    }

    const cached = readCache(cwd);
    if (cached) {
        return { cost: cached.cost, cachedTokens: cached.cachedTokens };
    }

    const projectDir = path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd));
    if (!fs.existsSync(projectDir)) {
        return null;
    }

    const result = scanProjectDir(projectDir);
    writeCache(cwd, { ...result, computedAt: Date.now() });
    return result;
}