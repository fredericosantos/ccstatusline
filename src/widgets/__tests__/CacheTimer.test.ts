import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CacheTimerWidget } from '../CacheTimer';

// Text mode unless a test asks for a bar; the widget itself defaults to the tiny bar
const item = (extra: Partial<WidgetItem> = {}): WidgetItem => ({ id: 'cache-timer', type: 'cache-timer', ...extra, metadata: { display: 'text', ...extra.metadata } });
const hidden: Partial<WidgetItem> = { metadata: { hide: 'empty' } };

const isoAgo = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();
const assistant = (seconds: number): string => JSON.stringify({ type: 'assistant', timestamp: isoAgo(seconds) });
const pendingUser = JSON.stringify({ type: 'user' });
const sidechain = (type: string, seconds: number): string => JSON.stringify({ type, timestamp: isoAgo(seconds), isSidechain: true });
const apiError = (seconds: number): string => JSON.stringify({ type: 'assistant', timestamp: isoAgo(seconds), isApiErrorMessage: true });
const assistantUsage = (seconds: number, usage: object): string => JSON.stringify({ type: 'assistant', timestamp: isoAgo(seconds), message: { usage } });
const noCacheUsage = { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe('CacheTimer widget', () => {
    let tmpDir: string;
    let fileCounter = 0;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cache-timer-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const transcriptContext = (lines: string[]): RenderContext => {
        const file = path.join(tmpDir, `transcript-${++fileCounter}.jsonl`);
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        return { data: { transcript_path: file } };
    };

    it('renders the preview as a labeled or raw sample', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), { isPreview: true }, DEFAULT_SETTINGS)).toBe('Cache: 🟢 5m');
        expect(widget.render(item({ rawValue: true }), { isPreview: true }, DEFAULT_SETTINGS)).toBe('🟢 5m');
    });

    it('renders n/a when no transcript is available by default', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), {}, DEFAULT_SETTINGS)).toBe('Cache: n/a');
        expect(widget.render(item({ rawValue: true }), {}, DEFAULT_SETTINGS)).toBe('n/a');
    });

    it('hides the widget when there is no data and hide-when-empty is enabled', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(hidden), {}, DEFAULT_SETTINGS)).toBeNull();
        expect(widget.render(item(hidden), transcriptContext([]), DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders n/a for an empty transcript by default', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
    });

    it('shows HOT while a turn is in flight, regardless of hide-when-empty', () => {
        const widget = new CacheTimerWidget();
        const context = transcriptContext([assistant(60), pendingUser]);
        expect(widget.render(item(), context, DEFAULT_SETTINGS)).toBe('Cache: 🔥 HOT');
        expect(widget.render(item(hidden), context, DEFAULT_SETTINGS)).toBe('Cache: 🔥 HOT');
    });

    const buckets = [
        { label: 'fresh', elapsed: 10, icon: '🟢' },
        { label: 'draining', elapsed: 180, icon: '🟡' },
        { label: 'almost cold', elapsed: 260, icon: '🔴' }
    ];
    for (const { label, elapsed, icon } of buckets) {
        it(`renders the ${label} countdown with the ${icon} icon`, () => {
            const widget = new CacheTimerWidget();
            const out = widget.render(item(), transcriptContext([assistant(elapsed)]), DEFAULT_SETTINGS);
            expect(out).toMatch(new RegExp(`^Cache: ${icon} \\d+m$`));
        });
    }

    it('renders COLD once the TTL has elapsed', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([assistant(400)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('renders a raw countdown without the label', () => {
        const widget = new CacheTimerWidget();
        const out = widget.render(item({ rawValue: true }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS);
        expect(out).toMatch(/^🟢 \d+m$/);
    });

    it('ignores sidechain rows when deriving the cache state', () => {
        const widget = new CacheTimerWidget();
        // A trailing sidechain user row must not report HOT...
        expect(widget.render(item(), transcriptContext([assistant(400), sidechain('user', 5)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
        // ...and a trailing sidechain assistant row must not restart the countdown.
        expect(widget.render(item(), transcriptContext([assistant(400), sidechain('assistant', 5)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('ignores synthetic API-error rows when deriving the cache state', () => {
        const widget = new CacheTimerWidget();
        // A failed request refreshes nothing, so the prior event still drives the countdown...
        expect(widget.render(item(), transcriptContext([assistant(400), apiError(5)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
        // ...and with no prior main-chain row there is no cache event to report.
        expect(widget.render(item(), transcriptContext([apiError(5)]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
    });

    it('skips assistant rows whose request had no cache activity', () => {
        const widget = new CacheTimerWidget();
        // The prior row that actually touched the cache still drives the countdown...
        const cached = assistantUsage(400, { cache_read_input_tokens: 100, cache_creation_input_tokens: 0 });
        expect(widget.render(item(), transcriptContext([cached, assistantUsage(10, noCacheUsage)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
        // ...and when caching never happened at all there is nothing to count down.
        expect(widget.render(item(), transcriptContext([assistantUsage(10, noCacheUsage)]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
    });

    it('does not report HOT for a finished turn whose response had no cache activity', () => {
        const widget = new CacheTimerWidget();
        // The user row that started the turn precedes the zero-cache response,
        // as in a real transcript; the finished turn must not read as in-flight.
        expect(widget.render(item(), transcriptContext([pendingUser, assistantUsage(10, noCacheUsage)]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
        // An older cache event still drives the countdown instead.
        const cached = assistantUsage(400, { cache_read_input_tokens: 100, cache_creation_input_tokens: 0 });
        expect(widget.render(item(), transcriptContext([cached, pendingUser, assistantUsage(10, noCacheUsage)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('does not report HOT for a turn that ended in an API error', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([pendingUser, apiError(5)]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
        expect(widget.render(item(), transcriptContext([assistant(400), pendingUser, apiError(5)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('starts the countdown from rows with cache reads or cache writes', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([assistantUsage(10, { cache_read_input_tokens: 1234 })]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+m$/);
        expect(widget.render(item(), transcriptContext([assistantUsage(10, { cache_creation_input_tokens: 55 })]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+m$/);
    });

    it('finds the trailing record even when it exceeds the initial 32 KiB tail read', () => {
        const widget = new CacheTimerWidget();
        // A pending user row bigger than the initial tail (e.g. a pasted prompt
        // or large tool result) must still report HOT...
        const bigUser = JSON.stringify({ type: 'user', content: 'x'.repeat(64 * 1024) });
        expect(widget.render(item(), transcriptContext([assistant(400), bigUser]), DEFAULT_SETTINGS)).toBe('Cache: 🔥 HOT');
        // ...and an oversized trailing assistant row must still drive the countdown.
        const bigAssistant = JSON.stringify({ type: 'assistant', timestamp: isoAgo(10), content: 'x'.repeat(64 * 1024) });
        expect(widget.render(item(), transcriptContext([bigAssistant]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+m$/);
    });

    it('finds a valid trailing record larger than 1 MiB', () => {
        const widget = new CacheTimerWidget();
        const huge = JSON.stringify({ type: 'assistant', timestamp: isoAgo(10), message: { usage: { cache_read_input_tokens: 42 } }, content: 'x'.repeat(2 * 1024 * 1024) });
        expect(widget.render(item(), transcriptContext([huge]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+m$/);
    });

    it('renders n/a after scanning a file with no parseable records', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext(['x'.repeat(2 * 1024 * 1024)]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
    });

    it('treats a malformed assistant timestamp as no data instead of rendering NaN', () => {
        const widget = new CacheTimerWidget();
        const context = transcriptContext([JSON.stringify({ type: 'assistant', timestamp: 'not-a-date' })]);
        expect(widget.render(item(), context, DEFAULT_SETTINGS)).toBe('Cache: n/a');
        expect(widget.render(item(hidden), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('declares the empty hideable state and leaves h to the shared checklist', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 't', label: '(t)tl', action: 'toggle-ttl' },
            { key: 'p', label: '(p)rogress bar / text', action: 'toggle-text' },
            { key: 'b', label: '(b)ar style', action: 'cycle-bar-style' },
            { key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }
        ]);
        expect(widget.getHideableStates().map(state => state.key)).toEqual(['empty']);
        expect(widget.handleEditorAction('unknown', item())).toBeNull();
    });

    it('annotates the editor with the display width only at default settings', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getEditorDisplay(item()).displayText).toBe('Cache Timer');
        expect(widget.getEditorDisplay(item()).modifierText).toBe('(text)');
        expect(widget.getEditorDisplay(item(hidden)).modifierText).toBe('(text)');
    });

    it('renders custom state glyphs from metadata overrides', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolCold: 'X' } }), transcriptContext([assistant(400)]), DEFAULT_SETTINGS)).toBe('Cache: X COLD');
        expect(widget.render(item({ metadata: { symbolFresh: '*' } }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS)).toMatch(/^Cache: \* \d+m$/);
        expect(widget.render(item({ metadata: { symbolHot: '>' } }), transcriptContext([assistant(60), pendingUser]), DEFAULT_SETTINGS)).toBe('Cache: > HOT');
    });

    it('drops the glyph and its space when an override is blanked', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolFresh: '' } }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS)).toMatch(/^Cache: \d+m$/);
    });

    it('reflects a custom fresh glyph in the preview', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolFresh: '#' } }), { isPreview: true }, DEFAULT_SETTINGS)).toBe('Cache: # 5m');
    });

    it('extends the countdown window when the TTL is set to 1 hour', () => {
        const widget = new CacheTimerWidget();
        // 600s in is COLD at the default 5-minute TTL...
        expect(widget.render(item(), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
        // ...but still fresh under a 1-hour TTL.
        expect(widget.render(item({ metadata: { ttlSeconds: '3600' } }), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+m$/);
    });

    it('falls back to the default TTL for a malformed value', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { ttlSeconds: 'abc' } }), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('cycles the TTL between 5m and 1h via the keybind', () => {
        const widget = new CacheTimerWidget();
        const toOneHour = widget.handleEditorAction('toggle-ttl', item());
        expect(toOneHour?.metadata?.ttlSeconds).toBe('3600');
        const backToDefault = widget.handleEditorAction('toggle-ttl', toOneHour ?? item());
        expect(backToDefault?.metadata?.ttlSeconds).toBeUndefined();
    });

    it('annotates the editor with a non-default TTL', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getEditorDisplay(item({ metadata: { ttlSeconds: '3600' } })).modifierText).toBe('(ttl 1h, text)');
        expect(widget.getEditorDisplay(item({ metadata: { ttlSeconds: '3600', hide: 'empty' } })).modifierText).toBe('(ttl 1h, text)');
    });

    // Colour is off under test, so the blocks style shows the fill as █ cells out of three
    it('defaults to a three-cell bar and toggles to text', () => {
        const widget = new CacheTimerWidget();
        const bare: WidgetItem = { id: 'c', type: 'cache-timer', metadata: { ttlSeconds: '3600' } };
        expect(widget.render(bare, transcriptContext([assistant(10)]), DEFAULT_SETTINGS)).toBe('███');
        const text = widget.handleEditorAction('toggle-text', bare) ?? bare;
        expect(text.metadata?.display).toBe('text');
        expect(widget.handleEditorAction('toggle-text', text)?.metadata?.display).toBeUndefined();
    });

    it('drains 3, 2, 1 cells by thirds of the TTL, shows minutes under 20, and fills red when cold', () => {
        const widget = new CacheTimerWidget();
        const bar = item({ metadata: { display: 'bar', ttlSeconds: '3600', label: 'cache' } });
        const at = (elapsed: number): string => widget.render(bar, transcriptContext([assistant(elapsed)]), DEFAULT_SETTINGS) ?? '';
        expect(at(60)).toBe('cache ███');
        expect(at(1500)).toBe('cache ██░');
        expect(at(2500)).toBe('cache █░░ 19m');
        expect(at(4000)).toBe('cache ███');
        expect(widget.render(bar, transcriptContext([assistant(10), pendingUser]), DEFAULT_SETTINGS)).toBe('cache ███');
    });

    it('prefers prompt_cache.expires_at and ttl over the transcript estimate', () => {
        const widget = new CacheTimerWidget();
        const bar = item({ metadata: { display: 'bar', ttlSeconds: '300' } });
        const ctx = (expires: number): RenderContext => {
            const base = transcriptContext([assistant(10)]);
            return { data: { ...base.data, prompt_cache: { warm: true, ttl: '1h', expires_at: expires } } };
        };
        const now = Date.now() / 1000;
        expect(widget.render(bar, ctx(now + 3000), DEFAULT_SETTINGS)).toBe('███');
        expect(widget.render(bar, ctx(now + 900), DEFAULT_SETTINGS)).toBe('█░░ 15m');
    });
});
