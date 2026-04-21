export interface ModelPricing {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}

const OPUS: ModelPricing = { input: 15e-6, output: 75e-6, cacheWrite: 1875e-8, cacheRead: 15e-7 };
const SONNET: ModelPricing = { input: 3e-6, output: 15e-6, cacheWrite: 375e-8, cacheRead: 3e-7 };
const HAIKU: ModelPricing = { input: 1e-6, output: 5e-6, cacheWrite: 125e-8, cacheRead: 1e-7 };

// $ per token (from codeburn FALLBACK_PRICING)
const PRICING: Record<string, ModelPricing> = {
    'claude-opus-4-7': OPUS,
    'claude-opus-4-6': OPUS,
    'claude-opus-4-5': OPUS,
    'claude-opus-4-1': OPUS,
    'claude-opus-4': OPUS,
    'claude-opus': OPUS,
    'claude-sonnet-4-6': SONNET,
    'claude-sonnet-4-5': SONNET,
    'claude-sonnet-4': SONNET,
    'claude-3-5-sonnet': SONNET,
    'claude-sonnet': SONNET,
    'claude-haiku-4-5': HAIKU,
    'claude-3-5-haiku': HAIKU,
    'claude-haiku': HAIKU,
    'claude-3-opus': OPUS
};

export function getPricing(modelId: string | undefined): ModelPricing {
    if (!modelId) {
        return SONNET;
    }
    const normalized = modelId.toLowerCase().replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
    for (const [key, pricing] of Object.entries(PRICING)) {
        if (normalized.startsWith(key)) {
            return pricing;
        }
    }
    return SONNET;
}

export interface UsageTokens {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}

export function calcCost(model: string | undefined, u: UsageTokens): number {
    const p = getPricing(model);
    return u.input * p.input
        + u.output * p.output
        + u.cacheWrite * p.cacheWrite
        + u.cacheRead * p.cacheRead;
}