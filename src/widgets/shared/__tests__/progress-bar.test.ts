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
    allocateFluidCells,
    barOptionsFor,
    barOverhead,
    fluidBarCells,
    getBarFillColor,
    makeStyledBar,
    renderUsageBar,
    resolveBarColor,
    resolveBarStyle,
    resolveBarSymbol,
    resolveFluidLimits,
    withFluidCells
} from '../progress-bar';
import { cycleBarStyle } from '../usage-display';

const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'session-usage', metadata });
const settings = (progressBarStyle?: Settings['progressBarStyle']): Settings => ({ ...DEFAULT_SETTINGS, progressBarStyle });

// The 24-bit open code chalk emits for a hex colour
const fg = (hex: string): string => `\x1b[38;2;${[1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).join(';')}m`;

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

    // Colour of every symbol of a dots / line bar, as hex
    const symbolColors = (bar: string): string[] => [...bar.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m[^\x1b]/g)]
        .map(m => '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join(''));
    const { fill: F, track: T } = { fill: '#ffffff', track: '#4d4d4d' };

    describe('dots', () => {
        it.each([5, 16, 32])('always renders %i dots', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                expect(strip(makeStyledBar(percent, width, { style: 'dots' }))).toBe('●'.repeat(width));
            }
        });

        it('defaults to a white fill over a faint gray track', () => {
            expect(BAR_COLORS.fill.toLowerCase()).toBe(F);
            expect(BAR_COLORS.track.toLowerCase()).toBe(T);
        });

        it.each([
            [0, [T, T, T, T, T]],
            [20, [F, T, T, T, T]],
            [40, [F, F, T, T, T]],
            [100, [F, F, F, F, F]]
        ])('has no half-blended dot at the exact boundary %i%%', (percent, expected) => {
            expect(symbolColors(makeStyledBar(percent, 5, { style: 'dots' }))).toEqual(expected);
        });

        it('fades the boundary dot from track to fill by how much of its own slice is covered', () => {
            // 35% of 5 dots: dot 1 is full, dot 2 is 75% into its slice, the rest are untouched
            expect(symbolColors(makeStyledBar(35, 5, { style: 'dots' }))).toEqual([F, '#d3d3d3', T, T, T]);
            // 50%: the third dot is exactly half way
            expect(symbolColors(makeStyledBar(50, 5, { style: 'dots' }))[2]).toBe('#a6a6a6');
        });

        it('takes the fill, track and symbol from the options', () => {
            const bar = makeStyledBar(40, 5, { style: 'dots', fill: '#D97757', track: '#101010', symbol: '■' });
            expect(strip(bar)).toBe('■■■■■');
            expect(symbolColors(bar)).toEqual(['#d97757', '#d97757', '#101010', '#101010', '#101010']);
        });
    });

    describe('pill', () => {
        it.each([5, 16, 32])('is width + 2 cells wide at %i cells', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                expect(getVisibleWidth(makeStyledBar(percent, width, { style: 'pill' }))).toBe(width + 2);
            }
        });

        it('never paints a background', () => {
            for (const percent of [0, 35, 72, 100]) {
                expect(makeStyledBar(percent, 5, { style: 'pill' })).not.toContain('\x1b[48;');
            }
        });

        it('is blank when empty and a full capsule when full', () => {
            expect(makeStyledBar(0, 5, { style: 'pill' })).toBe('       ');
            expect(strip(makeStyledBar(100, 5, { style: 'pill' }))).toBe('\ue0b6█████\ue0b4');
        });

        it('fills whole cells in the fill colour and advances the edge in eighths', () => {
            const bar = makeStyledBar(40, 5, { style: 'pill' });
            expect(bar.split(fg(F)).length - 1).toBeGreaterThanOrEqual(3);
            // 35% of 5 cells = 14 eighths: one whole cell plus 6/8
            expect(strip(makeStyledBar(35, 5, { style: 'pill' }))).toBe('\ue0b6█▊    ');
            // 72% of 5 cells = 29 eighths: three whole cells plus 5/8
            expect(strip(makeStyledBar(72, 5, { style: 'pill' }))).toBe('\ue0b6███▋  ');
        });

        it('opens with the left cap as soon as there is fill and closes with the right cap only when full', () => {
            const partial = strip(makeStyledBar(35, 5, { style: 'pill' }));
            expect(partial.startsWith('\ue0b6')).toBe(true);
            expect(partial).not.toContain('\ue0b4');
            expect(strip(makeStyledBar(100, 5, { style: 'pill' })).endsWith('\ue0b4')).toBe(true);
            expect(strip(makeStyledBar(0, 5, { style: 'pill' }))).not.toContain('\ue0b6');
        });
    });

    describe('line', () => {
        it.each([5, 16, 32])('renders %i cells of ━', (width) => {
            for (const percent of [0, 35, 72, 95, 100]) {
                const bar = makeStyledBar(percent, width, { style: 'line' });
                expect(getVisibleWidth(bar)).toBe(width);
                expect(strip(bar)).toBe('━'.repeat(width));
            }
        });

        it('blends the boundary cell like the dots do and has no half-cell glyphs', () => {
            expect(symbolColors(makeStyledBar(40, 5, { style: 'line' }))).toEqual([F, F, T, T, T]);
            expect(symbolColors(makeStyledBar(35, 5, { style: 'line' }))).toEqual([F, '#d3d3d3', T, T, T]);
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
            expect(getBarFillColor(undefined, '#D97757')).toBe('#D97757');
            expect(makeStyledBar(95, 5, { style: 'dots' })).not.toContain(fg(BAR_COLORS.danger));
        });
    });

    describe('configuration', () => {
        it('reads colours as #RRGGBB, hex:RRGGBB or a colour name and falls back otherwise', () => {
            expect(resolveBarColor('#D97757', '#000000')).toBe('#D97757');
            expect(resolveBarColor('hex:00ff88', '#000000')).toBe('#00ff88');
            expect(resolveBarColor('red', '#000000')).toBe('#cc0000');
            expect(resolveBarColor('brightCyan', '#000000')).toBe('#34e2e2');
            for (const bad of [undefined, '', 'nonsense', '#12345', 'bgRed']) {
                expect(resolveBarColor(bad, '#000000')).toBe('#000000');
            }
        });

        it('resolves named colours whatever the current colour level is', () => {
            chalk.level = 1;
            expect(resolveBarColor('red', '#000000')).toBe('#cc0000');
            expect(chalk.level).toBe(1);
        });

        it('accepts exactly one character as the symbol', () => {
            expect(resolveBarSymbol('■')).toBe('■');
            expect(resolveBarSymbol('★')).toBe('★');
            for (const bad of [undefined, '', 'ab']) {
                expect(resolveBarSymbol(bad)).toBe('●');
            }
        });

        it('lets widget metadata beat the global settings, which beat the defaults', () => {
            const global: Settings = { ...settings(), progressBarFillColor: '#ff0000', progressBarTrackColor: 'hex:00ff00', progressBarSymbol: '◆' };
            expect(barOptionsFor(item(), settings())).toMatchObject({ fill: '#FFFFFF', track: '#4D4D4D', symbol: '●' });
            expect(barOptionsFor(item(), global)).toMatchObject({ fill: '#ff0000', track: '#00ff00', symbol: '◆' });
            expect(barOptionsFor(item({ fillColor: '#0000ff', trackColor: '#111111', symbol: '■' }), global))
                .toMatchObject({ fill: '#0000ff', track: '#111111', symbol: '■' });
            // an invalid widget value falls back to the global one, not straight to the default
            expect(barOptionsFor(item({ fillColor: 'nonsense', symbol: 'ab' }), global)).toMatchObject({ fill: '#ff0000', symbol: '◆' });
        });
    });

    describe('renderUsageBar', () => {
        it('defaults to dots and follows the global setting and the widget override', () => {
            expect(resolveBarStyle(item(), settings())).toBe('dots');
            expect(resolveBarStyle(item(), settings('pill'))).toBe('pill');
            expect(resolveBarStyle(item({ barStyle: 'line' }), settings('pill'))).toBe('line');
            expect(resolveBarStyle(item({ barStyle: 'nonsense' }), settings('pill'))).toBe('pill');
        });

        it('escalates only when enabled, on consumption widgets, using the used share when inverted', () => {
            const on: Settings = { ...settings(), progressBarEscalate: true };
            const render = (meta: Record<string, string>, options: { escalate?: boolean }, percent = 95, config = settings()): string => renderUsageBar(item({ display: 'progress-xs', ...meta }), config, 'progress-xs', percent, `${percent}%`, options);

            // opt-in: off by default
            expect(render({}, { escalate: true })).not.toContain(fg(BAR_COLORS.danger));
            expect(render({}, { escalate: true }, 95, on)).toContain(fg(BAR_COLORS.danger));
            expect(render({ escalate: 'true' }, { escalate: true })).toContain(fg(BAR_COLORS.danger));
            expect(render({ escalate: 'false' }, { escalate: true }, 95, on)).not.toContain(fg(BAR_COLORS.danger));
            // timers never escalate
            expect(render({ escalate: 'true' }, {})).not.toContain(fg(BAR_COLORS.danger));
            // inverted shows the remaining share: 20% remaining = 80% used
            expect(render({ invert: 'true', escalate: 'true' }, { escalate: true }, 20)).toContain(fg(BAR_COLORS.warn));
            // 95% remaining = 5% used, so no escalation
            const relaxed = render({ invert: 'true', escalate: 'true' }, { escalate: true }, 95);
            expect(relaxed).not.toContain(fg(BAR_COLORS.warn));
            expect(relaxed).not.toContain(fg(BAR_COLORS.danger));
        });

        it('draws the configured fill colour', () => {
            const out = renderUsageBar(item({ display: 'progress-xs', fillColor: '#D97757' }), settings(), 'progress-xs', 100, '100%', {});
            expect(out).toContain(fg('#D97757'));
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
            // two spaces: the empty right-cap slot, then the separator
            expect(wrapped).toContain(`${outerFg}  40%`);
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

describe('fluid bars', () => {
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

    describe('resolveFluidLimits', () => {
        it('defaults to 3..10', () => {
            expect(resolveFluidLimits(item(), DEFAULT_SETTINGS)).toEqual({ min: 3, max: 10 });
        });

        it('takes widget metadata over the global settings over the defaults', () => {
            const global = { ...DEFAULT_SETTINGS, progressBarMin: 2, progressBarMax: 8 };
            expect(resolveFluidLimits(item(), global)).toEqual({ min: 2, max: 8 });
            expect(resolveFluidLimits(item({ barMin: '4', barMax: '6' }), global)).toEqual({ min: 4, max: 6 });
        });

        it.each(['abc', '-1', '2.5', '', ' '])('ignores the invalid metadata value %j', (bad) => {
            expect(resolveFluidLimits(item({ barMin: bad, barMax: bad }), DEFAULT_SETTINGS)).toEqual({ min: 3, max: 10 });
        });

        it('ignores negative or fractional global values', () => {
            expect(resolveFluidLimits(item(), { ...DEFAULT_SETTINGS, progressBarMin: -2, progressBarMax: 4.5 })).toEqual({ min: 3, max: 10 });
        });

        it('never lets min exceed max', () => {
            expect(resolveFluidLimits(item({ barMax: '2' }), DEFAULT_SETTINGS)).toEqual({ min: 2, max: 2 });
            expect(resolveFluidLimits(item({ barMax: '0' }), DEFAULT_SETTINGS)).toEqual({ min: 0, max: 0 });
        });
    });

    describe('allocateFluidCells', () => {
        const bar = (max = 10, overhead = 0): { max: number; overhead: number } => ({ max, overhead });

        it('gives one bar all the room up to its max', () => {
            expect(allocateFluidCells(7, [bar()])).toEqual([7]);
            expect(allocateFluidCells(40, [bar()])).toEqual([10]);
        });

        it('splits the room equally and hands the remainder to the first bars', () => {
            expect(allocateFluidCells(21, [bar(), bar(), bar()])).toEqual([7, 7, 7]);
            expect(allocateFluidCells(23, [bar(), bar(), bar()])).toEqual([8, 8, 7]);
            expect(allocateFluidCells(7, [bar(), bar(), bar()])).toEqual([3, 2, 2]);
        });

        it('caps every bar at its own max', () => {
            expect(allocateFluidCells(100, [bar(), bar(), bar()])).toEqual([10, 10, 10]);
            expect(allocateFluidCells(40, [bar(4), bar(10)])).toEqual([4, 10]);
        });

        it('shrinks to nothing when the line is too narrow, never below zero', () => {
            expect(allocateFluidCells(0, [bar(), bar()])).toEqual([0, 0]);
            expect(allocateFluidCells(-9, [bar(), bar()])).toEqual([0, 0]);
            expect(allocateFluidCells(1, [bar(), bar(), bar()])).toEqual([1, 0, 0]);
        });

        it('reserves the pill caps before sharing', () => {
            expect(allocateFluidCells(20, [bar(10, 2), bar(10, 2)])).toEqual([8, 8]);
            expect(allocateFluidCells(3, [bar(10, 2), bar(10, 2)])).toEqual([0, 0]);
        });

        it('never overshoots the room it was given', () => {
            for (let room = 0; room <= 45; room++) {
                for (const overhead of [0, 2]) {
                    const cells = allocateFluidCells(room, [bar(10, overhead), bar(10, overhead), bar(6, overhead)]);
                    const used = cells.reduce((sum, c) => sum + (c > 0 ? c + overhead : 0), 0);
                    expect(used).toBeLessThanOrEqual(Math.max(0, room));
                }
            }
        });
    });

    describe('fluidBarCells', () => {
        it('falls back to 5 cells kept inside the limits when the renderer gave no share', () => {
            expect(fluidBarCells(item(), DEFAULT_SETTINGS)).toBe(5);
            expect(fluidBarCells(item({ barMax: '4' }), DEFAULT_SETTINGS)).toBe(4);
            expect(fluidBarCells(item({ barMin: '7' }), DEFAULT_SETTINGS)).toBe(7);
        });

        it('uses the stamped share, capped at the max', () => {
            expect(fluidBarCells(withFluidCells(item(), 7), DEFAULT_SETTINGS)).toBe(7);
            expect(fluidBarCells(withFluidCells(item(), 0), DEFAULT_SETTINGS)).toBe(0);
            expect(fluidBarCells(withFluidCells(item(), 12), DEFAULT_SETTINGS)).toBe(10);
        });
    });

    it('adds the pill caps as overhead only for the pill style', () => {
        expect(barOverhead(item(), settings('pill'))).toBe(2);
        expect(barOverhead(item(), settings('dots'))).toBe(0);
        expect(barOverhead(item({ barStyle: 'pill' }), settings('dots'))).toBe(2);
    });

    it.each(['dots', 'pill', 'line', 'blocks'] as const)('%s renders nothing at zero cells', (style) => {
        expect(makeStyledBar(50, 0, { style })).toBe('');
    });

    describe('renderUsageBar in fluid mode', () => {
        const fluid = (cells: number, extra: Record<string, string> = {}): WidgetItem => withFluidCells(item({ display: 'fluid', showPercent: 'true', ...extra }), cells);

        it('draws the stamped number of symbols, bracket-less, with the percent', () => {
            expect(strip(renderUsageBar(fluid(4), settings(), 'fluid', 35, '35%'))).toBe('●●●● 35%');
            expect(strip(renderUsageBar(fluid(7), settings('line'), 'fluid', 35, '35%'))).toBe('━━━━━━━ 35%');
            expect(strip(renderUsageBar(fluid(7), settings('blocks'), 'fluid', 35, '35%'))).toBe('██░░░░░ 35%');
        });

        it('counts the pill caps on top of the cells', () => {
            expect(getVisibleWidth(renderUsageBar(fluid(4), settings('pill'), 'fluid', 35, '35%'))).toBe(4 + 2 + 1 + 3);
        });

        it('collapses to just the percent at zero cells, or to nothing without showPercent', () => {
            expect(renderUsageBar(fluid(0), settings(), 'fluid', 35, '35%')).toBe('35%');
            expect(renderUsageBar(withFluidCells(item({ display: 'fluid' }), 0), settings(), 'fluid', 35, '35%')).toBe('');
        });

        it('keeps the blend at the boundary of the shorter bar', () => {
            const bar = renderUsageBar(fluid(4), settings(), 'fluid', 35, '35%');
            // 35% of 4 dots: dot 1 full, dot 2 is 40% into its slice
            expect(bar).toContain('\x1b[38;2;255;255;255m●');
        });
    });
});
