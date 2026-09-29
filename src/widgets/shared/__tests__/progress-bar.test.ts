import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { Settings } from '../../../types/Settings';
import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { getVisibleWidth } from '../../../utils/ansi';
import {
    applyColors,
    updateColorMap
} from '../../../utils/colors';
import {
    BAR_COLORS,
    getBarFillColor,
    makeStyledBar,
    renderUsageBar,
    resolveBarStyle
} from '../progress-bar';
import { cycleBarStyle } from '../usage-display';

const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'session-usage', metadata });
const settings = (progressBarStyle?: Settings['progressBarStyle']): Settings => ({ ...DEFAULT_SETTINGS, progressBarStyle });

// The 24-bit open code chalk emits for a hex colour
const fg = (hex: string): string => `\x1b[38;2;${[1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).join(';')}m`;
const bg = (hex: string): string => fg(hex).replace('[38;', '[48;');

describe('bar styles', () => {
    let previousLevel: typeof chalk.level;

    beforeEach(() => {
        previousLevel = chalk.level;
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = previousLevel;
        updateColorMap();
    });

    describe('dots', () => {
        it.each([5, 16, 32])('always renders %i dots', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                expect(strip(makeStyledBar(percent, width, { style: 'dots' }))).toBe('●'.repeat(width));
            }
        });

        it('colours filled dots with the fill colour and the rest with the track colour', () => {
            const bar = makeStyledBar(40, 5, { style: 'dots' });
            expect(bar).toBe(`${fg(BAR_COLORS.fill)}●${fg(BAR_COLORS.fill)}●${fg(BAR_COLORS.track)}●${fg(BAR_COLORS.track)}●${fg(BAR_COLORS.track)}●\x1b[39m`);
        });

        it('blends the boundary dot between track and fill', () => {
            // 50% of 5 cells: the third dot is half filled
            const bar = makeStyledBar(50, 5, { style: 'dots' });
            const blended = /\x1b\[38;2;(\d+);(\d+);(\d+)m●/g;
            const colors = [...bar.matchAll(blended)].map(m => [Number(m[1]), Number(m[2]), Number(m[3])]);
            const [track, fill] = [[59, 57, 54], [217, 119, 87]];
            const mid = colors[2] ?? [];
            expect(colors).toHaveLength(5);
            expect(mid[0]).toBeGreaterThan(track[0] ?? 0);
            expect(mid[0]).toBeLessThan(fill[0] ?? 0);
            expect(mid[1]).toBeGreaterThan(track[1] ?? 0);
            expect(mid[1]).toBeLessThan(fill[1] ?? 0);
        });
    });

    describe('pill', () => {
        it.each([5, 16, 32])('is width + 2 cells wide with caps at %i cells', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                const bar = makeStyledBar(percent, width, { style: 'pill' });
                const plain = strip(bar);
                expect(plain.startsWith('')).toBe(true);
                expect(plain.endsWith('')).toBe(true);
                expect(getVisibleWidth(bar)).toBe(width + 2);
            }
        });

        it('fills whole cells with the fill background and the rest with the track background', () => {
            const bar = makeStyledBar(40, 5, { style: 'pill' });
            expect(bar.split(bg(BAR_COLORS.fill))).toHaveLength(3);
            expect(bar.split(bg(BAR_COLORS.track))).toHaveLength(4);
        });

        it('advances the edge in eighths of a cell', () => {
            // 35% of 5 cells = 14 eighths: one whole cell plus 6/8
            expect(strip(makeStyledBar(35, 5, { style: 'pill' }))).toContain('▊');
            // 72% of 5 cells = 29 eighths: three whole cells plus 5/8
            expect(strip(makeStyledBar(72, 5, { style: 'pill' }))).toContain('▋');
        });

        it('colours each cap like its neighbouring cell', () => {
            const empty = makeStyledBar(0, 5, { style: 'pill' });
            const full = makeStyledBar(100, 5, { style: 'pill' });
            expect(empty.startsWith(`${fg(BAR_COLORS.track)}`)).toBe(true);
            expect(full.startsWith(`${fg(BAR_COLORS.fill)}`)).toBe(true);
            expect(full.endsWith(`${fg(BAR_COLORS.fill)}\x1b[39m`)).toBe(true);
            expect(empty.endsWith(`${fg(BAR_COLORS.track)}\x1b[39m`)).toBe(true);
        });
    });

    describe('line', () => {
        it.each([5, 16, 32])('renders %i cells with a half-cell edge', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                const bar = makeStyledBar(percent, width, { style: 'line' });
                expect(getVisibleWidth(bar)).toBe(width);
                expect(strip(bar)).toMatch(/^[━╸╺]+$/);
            }
        });

        it('uses a filled half cap at half a cell and a track cap at a whole cell', () => {
            expect(strip(makeStyledBar(30, 5, { style: 'line' }))).toBe('━╸━━━');
            expect(strip(makeStyledBar(40, 5, { style: 'line' }))).toBe('━━╺━━');
            expect(strip(makeStyledBar(0, 5, { style: 'line' }))).toBe('╺━━━━');
            expect(strip(makeStyledBar(100, 5, { style: 'line' }))).toBe('━━━━━');
        });
    });

    describe('blocks', () => {
        it('is the plain block bar without colour codes', () => {
            expect(makeStyledBar(40, 5, { style: 'blocks' })).toBe('██░░░');
            expect(makeStyledBar(100, 5, { style: 'blocks' })).toBe('█████');
        });
    });

    it('draws the time cursor in every style', () => {
        for (const style of ['dots', 'pill', 'line', 'blocks'] as const) {
            expect(strip(makeStyledBar(10, 10, { style, cursorPercent: 50 }))).toContain('│');
        }
    });

    describe('escalation colours', () => {
        it.each([
            [0, BAR_COLORS.fill],
            [74.9, BAR_COLORS.fill],
            [75, BAR_COLORS.warn],
            [89.9, BAR_COLORS.warn],
            [90, BAR_COLORS.danger],
            [100, BAR_COLORS.danger]
        ])('fills at %d%% with %s', (percent, color) => {
            expect(getBarFillColor(percent)).toBe(color);
            if (percent > 0) {
                expect(makeStyledBar(percent, 5, { style: 'dots', escalatePercent: percent })).toContain(fg(color));
            }
        });

        it('keeps the plain fill colour when escalation is off', () => {
            expect(getBarFillColor(undefined)).toBe(BAR_COLORS.fill);
            expect(makeStyledBar(95, 5, { style: 'dots' })).not.toContain(fg(BAR_COLORS.danger));
        });
    });

    describe('renderUsageBar', () => {
        it('defaults to dots and follows the global setting and the widget override', () => {
            expect(resolveBarStyle(item(), settings())).toBe('dots');
            expect(resolveBarStyle(item(), settings('pill'))).toBe('pill');
            expect(resolveBarStyle(item({ barStyle: 'line' }), settings('pill'))).toBe('line');
            expect(resolveBarStyle(item({ barStyle: 'nonsense' }), settings('pill'))).toBe('pill');
        });

        it('escalates on consumption unless metadata.escalate is false, and on used share when inverted', () => {
            const render = (meta: Record<string, string>, options: { escalate?: boolean }, percent = 95): string => renderUsageBar(item({ display: 'progress-xs', ...meta }), settings(), 'progress-xs', percent, `${percent}%`, options);

            expect(render({}, { escalate: true })).toContain(fg(BAR_COLORS.danger));
            expect(render({ escalate: 'false' }, { escalate: true })).not.toContain(fg(BAR_COLORS.danger));
            expect(render({}, {})).not.toContain(fg(BAR_COLORS.danger));
            // inverted shows the remaining share: 20% remaining = 80% used
            expect(render({ invert: 'true' }, { escalate: true }, 20)).toContain(fg(BAR_COLORS.warn));
            // 95% remaining = 5% used, so no escalation
            const relaxed = render({ invert: 'true' }, { escalate: true }, 95);
            expect(relaxed).not.toContain(fg(BAR_COLORS.warn));
            expect(relaxed).not.toContain(fg(BAR_COLORS.danger));
        });

        it('only brackets the blocks style on the longer bars', () => {
            const long = (style: Settings['progressBarStyle']): string => strip(renderUsageBar(item({ display: 'progress-short' }), settings(style), 'progress-short', 50, '50%'));

            expect(long('blocks')).toBe('[████████░░░░░░░░] 50%');
            expect(long('dots')).toBe('●●●●●●●●●●●●●●●● 50%');
            expect(long('pill')).not.toContain('[');
        });

        it('falls back to blocks without colour support', () => {
            chalk.level = 0;
            expect(resolveBarStyle(item({ barStyle: 'pill' }), settings('pill'))).toBe('blocks');
        });
    });

    describe('nested colours', () => {
        it('keeps the widget colours around and after an embedded bar', () => {
            const text = `${makeStyledBar(40, 5, { style: 'pill' })} 40%`;
            const wrapped = applyColors(text, 'red', 'bgBlue', false, 'truecolor');
            const outerFg = '\x1b[38;2;204;0;0m';
            const outerBg = '\x1b[48;2;52;101;164m';

            expect(wrapped.startsWith(outerBg + outerFg)).toBe(true);
            // every embedded fg / bg reset is followed by the outer colour again
            expect(wrapped.split('\x1b[39m').slice(1, -1).every(part => part.startsWith(outerFg))).toBe(true);
            expect(wrapped.split('\x1b[49m').slice(1, -1).every(part => part.startsWith(outerBg))).toBe(true);
            // the text after the bar is drawn in the outer colours
            const tail = wrapped.slice(wrapped.lastIndexOf(''));
            expect(tail).toContain(`${outerFg} 40%`);
            expect(wrapped.endsWith('\x1b[39m\x1b[49m')).toBe(true);
        });

        it('is a no-op for widgets without embedded resets', () => {
            expect(applyColors('plain', 'red', 'bgBlue', false, 'truecolor')).toBe('\x1b[48;2;52;101;164m\x1b[38;2;204;0;0mplain\x1b[39m\x1b[49m');
        });
    });
});

describe('cycleBarStyle', () => {
    it('walks global -> dots -> pill -> line -> blocks -> global', () => {
        let current = item({ display: 'progress' });
        const seen: (string | undefined)[] = [];
        for (let i = 0; i < 5; i++) {
            current = cycleBarStyle(current);
            seen.push(current.metadata?.barStyle);
        }
        expect(seen).toEqual(['dots', 'pill', 'line', 'blocks', undefined]);
        expect(current.metadata).toEqual({ display: 'progress' });
    });
});
