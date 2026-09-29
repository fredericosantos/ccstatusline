import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import type { Settings } from '../../types/Settings';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getVisibleWidth } from '../../utils/ansi';
import {
    applyColors,
    updateColorMap
} from '../../utils/colors';
import * as usage from '../../utils/usage';
import {
    FIVE_HOUR_BLOCK_MS,
    SEVEN_DAY_WINDOW_MS
} from '../../utils/usage-types';
import {
    SessionPaceWidget,
    WeeklyPaceWidget
} from '../PaceBars';
import {
    PACE_COLORS,
    barOverhead,
    makePaceBar,
    resolvePaceColors,
    withFluidCells
} from '../shared/progress-bar';

const NOW = new Date('2026-06-01T12:00:00Z').getTime();
const TRACK = '#4d4d4d';
const USAGE = '#d97757';
const TIME = '#6a9bcc';
const BOTH = '#f4f3ee';
const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
const hex = (r: string, g: string, b: string): string => '#' + [r, g, b].map(n => Number(n).toString(16).padStart(2, '0')).join('');
// Colour of every symbol of a pace bar
const colors = (bar: string): string[] => [...bar.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m[^\x1b]/g)].map(m => hex(m[1] ?? '0', m[2] ?? '0', m[3] ?? '0'));
const item = (metadata?: Record<string, string>, type = 'session-pace'): WidgetItem => ({ id: 'p', type, metadata });
const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides });
const barOptions = { style: 'dots' as const, colors: { usage: USAGE, time: TIME, both: BOTH } };

// usage `u`% consumed with `t`% of the window elapsed
function sessionContext(u: number, t: number | null): RenderContext {
    return {
        usageData: {
            sessionUsage: u,
            ...(t === null ? {} : { sessionResetAt: new Date(NOW + (1 - t / 100) * FIVE_HOUR_BLOCK_MS).toISOString() })
        }
    };
}

function weeklyContext(u: number, t: number): RenderContext {
    return { usageData: { weeklyUsage: u, weeklyResetAt: new Date(NOW + (1 - t / 100) * SEVEN_DAY_WINDOW_MS).toISOString() } };
}

describe('pace bars', () => {
    let previousLevel: typeof chalk.level;

    beforeEach(() => {
        previousLevel = chalk.level;
        chalk.level = 3;
        updateColorMap();
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        chalk.level = previousLevel;
        updateColorMap();
    });

    describe('makePaceBar composite', () => {
        it('is fully "both" when usage matches time', () => {
            expect(colors(makePaceBar(40, 40, 5, barOptions))).toEqual([BOTH, BOTH, TRACK, TRACK, TRACK]);
        });

        it('shows the usage colour beyond the elapsed part when usage is ahead', () => {
            // usage 3.5 symbols, time 2: two shared, one usage-only, half a usage symbol over the track
            expect(colors(makePaceBar(70, 40, 5, barOptions))).toEqual([BOTH, BOTH, USAGE, '#936252', TRACK]);
        });

        it('shows the time colour beyond the used part when usage is behind', () => {
            expect(colors(makePaceBar(20, 60, 5, barOptions))).toEqual([BOTH, TIME, TIME, TRACK, TRACK]);
        });

        it('shows only the time colour with no usage', () => {
            expect(colors(makePaceBar(0, 40, 5, barOptions))).toEqual([TIME, TIME, TRACK, TRACK, TRACK]);
        });

        it('shows only the usage colour with no time elapsed', () => {
            expect(colors(makePaceBar(40, 0, 5, barOptions))).toEqual([USAGE, USAGE, TRACK, TRACK, TRACK]);
        });

        it('is all "both" when both are complete', () => {
            expect(colors(makePaceBar(100, 100, 5, barOptions))).toEqual([BOTH, BOTH, BOTH, BOTH, BOTH]);
        });

        it('is all track at 0 and 0', () => {
            expect(colors(makePaceBar(0, 0, 5, barOptions))).toEqual([TRACK, TRACK, TRACK, TRACK, TRACK]);
        });

        it('leaves no stray blended symbol on exact boundaries', () => {
            for (const pct of [20, 40, 60, 80]) {
                const filled = pct / 20;
                expect(colors(makePaceBar(pct, pct, 5, barOptions))).toEqual([...Array<string>(filled).fill(BOTH), ...Array<string>(5 - filled).fill(TRACK)]);
            }
            expect(colors(makePaceBar(30, 30, 10, barOptions))).toEqual([...Array<string>(3).fill(BOTH), ...Array<string>(7).fill(TRACK)]);
        });

        it('blends the boundary symbol by how much of its slice is covered (n=10)', () => {
            // 45% of 10 symbols = 4.5: four full, the fifth half way from track to "both"
            expect(colors(makePaceBar(45, 45, 10, barOptions)).slice(3, 6)).toEqual([BOTH, '#a1a09e', TRACK]);
        });

        it('draws the line style with ━ and nothing when the width is 0', () => {
            expect(strip(makePaceBar(40, 40, 5, { ...barOptions, style: 'line' }))).toBe('━━━━━');
            expect(makePaceBar(40, 40, 0, barOptions)).toBe('');
        });
    });

    describe('resolvePaceColors', () => {
        it('uses the Claude defaults', () => {
            expect(resolvePaceColors(item(), settings())).toEqual({ usage: PACE_COLORS.usage, time: PACE_COLORS.time, both: PACE_COLORS.both });
        });

        it('lets metadata win over settings, and settings over defaults', () => {
            const cfg = settings({ progressPaceColors: { usage: '#111111', time: '#222222', both: '#333333' } });
            expect(resolvePaceColors(item(), cfg)).toEqual({ usage: '#111111', time: '#222222', both: '#333333' });
            expect(resolvePaceColors(item({ usageColor: '#aaaaaa' }), cfg).usage).toBe('#aaaaaa');
        });

        it('averages the usage and time colours for "mix"', () => {
            expect(resolvePaceColors(item({ bothColor: 'mix', usageColor: '#000000', timeColor: '#ffffff' }), settings()).both).toBe('#808080');
            expect(resolvePaceColors(item(), settings({ progressPaceColors: { both: 'mix' } })).both).toBe('#a28992');
        });

        it('falls back to the defaults for invalid values without throwing', () => {
            const cfg = settings({ progressPaceColors: { usage: 42, time: 'nonsense', both: null } });
            expect(resolvePaceColors(item({ usageColor: 'nope' }), cfg)).toEqual({ usage: PACE_COLORS.usage, time: PACE_COLORS.time, both: PACE_COLORS.both });
        });
    });

    describe('SessionPaceWidget', () => {
        const widget = new SessionPaceWidget();
        const display = { display: 'progress-xs' };

        it('renders label, pace bar and usage percent by default', () => {
            const out = widget.render(item(display), sessionContext(70, 40), settings());
            expect(strip(out ?? '')).toBe('5h ●●●●● 70.0%');
            expect(colors(out ?? '')).toEqual([BOTH, BOTH, USAGE, '#936252', TRACK]);
        });

        it('defaults to a tiny bar when no progress display is set', () => {
            expect(strip(widget.render(item(), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●● 70.0%');
        });

        it('supports every text mode', () => {
            expect(strip(widget.render(item({ ...display, text: 'both' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●● 70/40%');
            expect(strip(widget.render(item({ ...display, text: 'delta' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●● +30');
            expect(strip(widget.render(item({ ...display, text: 'delta' }), sessionContext(20, 60), settings()) ?? '')).toBe('5h ●●●●● -40');
            expect(strip(widget.render(item({ ...display, text: 'delta' }), sessionContext(40, 40), settings()) ?? '')).toBe('5h ●●●●● 0');
            expect(strip(widget.render(item({ ...display, text: 'none' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●●');
        });

        it('colours the text with progressTextEscalation from the usage share', () => {
            const cfg = settings({ progressTextEscalation: [{ at: 60, color: '#E5B454' }] });
            expect(widget.render(item({ ...display, text: 'delta' }), sessionContext(70, 40), cfg)).toContain('\x1b[38;2;229;180;84m+30\x1b[39m');
            expect(widget.render(item({ ...display, text: 'delta' }), sessionContext(20, 60), cfg)).not.toContain('229;180;84');
        });

        it('handles the label: default, custom, hidden', () => {
            expect(strip(widget.render(item({ ...display, label: 'sess' }), sessionContext(70, 40), settings()) ?? '')).toBe('sess ●●●●● 70.0%');
            expect(strip(widget.render(item({ ...display, label: '' }), sessionContext(70, 40), settings()) ?? '')).toBe('●●●●● 70.0%');
            expect(strip(new WeeklyPaceWidget().render(item(display, 'weekly-pace'), weeklyContext(70, 40), settings()) ?? '')).toBe('7d ●●●●● 70.0%');
        });

        it('falls back to a plain usage bar in the normal fill colour when there is no time information', () => {
            // no reset time and no transcript block to fall back on
            vi.spyOn(usage, 'resolveUsageWindowWithFallback').mockReturnValue(null);
            const out = widget.render(item(display), sessionContext(70, null), settings());
            expect(strip(out ?? '')).toBe('5h ●●●●● 70.0%');
            // 70% of 5 symbols: three white, the fourth half way to the track, then the track
            expect(colors(out ?? '')).toEqual(['#ffffff', '#ffffff', '#ffffff', '#a6a6a6', TRACK]);
            expect(strip(widget.render(item({ ...display, text: 'delta' }), sessionContext(70, null), settings()) ?? '')).toBe('5h ●●●●● 70.0%');
        });

        it('returns null without usage data and shows the error unless hidden', () => {
            expect(widget.render(item(display), { usageData: {} }, settings())).toBeNull();
            expect(widget.render(item(display), {}, settings())).toBeNull();
            expect(widget.render(item(display), { usageData: { error: 'timeout' } }, settings())).toBe(usage.getUsageErrorMessage('timeout'));
            expect(widget.render(item({ ...display, hide: 'no-data' }), { usageData: { error: 'timeout' } }, settings())).toBeNull();
        });

        it('falls back to dots for pill and blocks, and keeps line', () => {
            expect(strip(widget.render(item({ ...display, barStyle: 'pill' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●● 70.0%');
            expect(strip(widget.render(item({ ...display, barStyle: 'blocks' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ●●●●● 70.0%');
            expect(strip(widget.render(item({ ...display, barStyle: 'line' }), sessionContext(70, 40), settings()) ?? '')).toBe('5h ━━━━━ 70.0%');
            expect(strip(widget.render(item(display), sessionContext(70, 40), settings({ progressBarSymbol: '■' })) ?? '')).toBe('5h ■■■■■ 70.0%');
        });

        it('reports no pill overhead for pace widgets', () => {
            expect(barOverhead(item({ barStyle: 'pill' }), settings())).toBe(0);
            expect(barOverhead(item({ barStyle: 'pill' }, 'session-usage'), settings())).toBe(2);
        });

        it('sizes medium and long bars and fluid bars from the stamped cell count', () => {
            expect(strip(widget.render(item({ display: 'progress-short' }), sessionContext(70, 40), settings()) ?? '')).toBe(`5h ${'●'.repeat(16)} 70.0%`);
            expect(strip(widget.render(item({ display: 'progress' }), sessionContext(70, 40), settings()) ?? '')).toBe(`5h ${'●'.repeat(32)} 70.0%`);
            expect(strip(widget.render(withFluidCells(item({ display: 'fluid' }), 7), sessionContext(70, 40), settings()) ?? '')).toBe(`5h ${'●'.repeat(7)} 70.0%`);
        });

        it('keeps label and text when a fluid bar shrinks to 0 cells', () => {
            expect(strip(widget.render(withFluidCells(item({ display: 'fluid' }), 0), sessionContext(70, 40), settings()) ?? '')).toBe('5h 70.0%');
            expect(strip(widget.render(withFluidCells(item({ display: 'fluid', text: 'none', label: '' }), 0), sessionContext(70, 40), settings()) ?? '')).toBe('');
            expect(widget.render(withFluidCells(item({ display: 'fluid', text: 'none', label: '' }), 0), sessionContext(70, 40), settings())).toBeNull();
        });

        it('degrades to the plain usage bar without colour support', () => {
            chalk.level = 0;
            updateColorMap();
            expect(widget.render(item(display), sessionContext(70, 40), settings())).toBe('5h ████░ 70.0%');
        });

        it('keeps the widget colour around and after the coloured symbols', () => {
            const out = widget.render(item(display), sessionContext(70, 40), settings()) ?? '';
            const wrapped = applyColors(out, 'red', undefined, false, 'truecolor');
            const outerFg = '\x1b[38;2;204;0;0m';
            expect(wrapped.split('\x1b[39m').slice(1, -1).every(part => part.startsWith(outerFg))).toBe(true);
            expect(getVisibleWidth(out)).toBe('5h ●●●●● 70.0%'.length);
        });

        it('renders a preview and a description that explains the colours', () => {
            expect(strip(widget.render(item(display), { isPreview: true }, settings()) ?? '')).toBe('5h ●●●●● 42.0%');
            expect(widget.getDescription()).toContain('orange = usage ahead');
        });
    });

    describe('WeeklyPaceWidget', () => {
        it('reads the weekly window', () => {
            const out = new WeeklyPaceWidget().render(item({ display: 'progress-xs' }, 'weekly-pace'), weeklyContext(40, 40), settings());
            expect(strip(out ?? '')).toBe('7d ●●●●● 40.0%');
            expect(colors(out ?? '')).toEqual([BOTH, BOTH, TRACK, TRACK, TRACK]);
        });
    });

    describe('editor actions', () => {
        const widget = new SessionPaceWidget();

        it('cycles the width, text mode and bar style', () => {
            expect(widget.handleEditorAction('cycle-width', item())?.metadata?.display).toBe('progress-short');
            expect(widget.handleEditorAction('cycle-width', item({ display: 'fluid' }))?.metadata?.display).toBe('progress-xs');
            expect(widget.handleEditorAction('cycle-text', item())?.metadata?.text).toBe('both');
            expect(widget.handleEditorAction('cycle-text', item({ text: 'none' }))?.metadata?.text).toBe('usage');
            expect(widget.handleEditorAction('cycle-bar-style', item())?.metadata?.barStyle).toBe('dots');
            expect(widget.handleEditorAction('unknown', item())).toBeNull();
            expect(widget.getEditorDisplay(item({ display: 'fluid', text: 'delta' })).modifierText).toBe('(fluid bar, text: delta)');
        });
    });
});
