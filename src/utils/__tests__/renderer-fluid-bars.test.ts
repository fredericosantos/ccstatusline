import chalk from 'chalk';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getVisibleText,
    getVisibleWidth
} from '../ansi';
import { updateColorMap } from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';
import { resetTerminalWidthCache } from '../terminal';

const text = (id: string, customText: string): WidgetItem => ({ id, type: 'custom-text', customText });
const bar = (id: string, type: string, extra: Record<string, string> = {}): WidgetItem => ({
    id,
    type,
    rawValue: true,
    metadata: { display: 'fluid', showPercent: 'true', ...extra }
});

const settingsWith = (overrides: Partial<Settings> = {}): Settings => ({
    ...DEFAULT_SETTINGS,
    ...overrides,
    powerline: { ...DEFAULT_SETTINGS.powerline, ...(overrides.powerline ?? {}) }
});

// Same pipeline as ccstatusline.ts: the width comes from CCSTATUSLINE_WIDTH, exactly like a real render
function renderLines(lines: WidgetItem[][], settings = settingsWith()): string[] {
    const context: RenderContext = { usageData: { sessionUsage: 42, weeklyUsage: 15 } };
    const pre = preRenderAllWidgets(lines, settings, context);
    const maxWidths = calculateMaxWidthsFromPreRendered(pre, settings);
    return lines.map((line, i) => getVisibleText(renderStatusLine(line, settings, context, pre[i] ?? [], maxWidths)));
}

const dots = (line: string): number[] => [...line.matchAll(/●+/g)].map(m => m[0].length);

describe('fluid bars in a rendered line', () => {
    let previousLevel: typeof chalk.level;
    let previousWidth: string | undefined;

    beforeAll(() => {
        previousWidth = process.env.CCSTATUSLINE_WIDTH;
    });

    afterAll(() => {
        if (previousWidth === undefined) {
            delete process.env.CCSTATUSLINE_WIDTH;
        } else {
            process.env.CCSTATUSLINE_WIDTH = previousWidth;
        }
        resetTerminalWidthCache();
    });

    beforeEach(() => {
        previousLevel = chalk.level;
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = previousLevel;
        updateColorMap();
        resetTerminalWidthCache();
    });

    const at = (width: number): void => {
        process.env.CCSTATUSLINE_WIDTH = String(width);
        resetTerminalWidthCache();
    };

    const line = [text('a', 'Use'), bar('s', 'session-usage'), text('b', 'Wk'), bar('w', 'weekly-usage')];

    it.each([
        // effective width is the terminal width minus the 6 columns flexMode 'full' reserves
        [60, [10, 10]],
        [100, [10, 10]],
        [140, [10, 10]],
        [200, [10, 10]]
    ])('caps every bar at 10 cells on a %i column terminal', (width, expected) => {
        at(width);
        const [rendered = ''] = renderLines([line]);
        expect(dots(rendered)).toEqual(expected);
        expect(getVisibleWidth(rendered)).toBeLessThanOrEqual(width - 6);
    });

    it.each([28, 34, 40, 46])('shrinks the bars and never exceeds the width on a %i column terminal', (width) => {
        at(width);
        const [rendered = ''] = renderLines([line]);
        expect(getVisibleWidth(rendered)).toBeLessThanOrEqual(width - 6);
        const cells = dots(rendered);
        expect(cells.every(n => n <= 10)).toBe(true);
        // the bars use what is left: growing the terminal never makes them smaller
        at(width + 4);
        const wider = dots(renderLines([line])[0] ?? '');
        expect(wider.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(cells.reduce((a, b) => a + b, 0));
    });

    it('fills the line exactly when the room is not enough for the maximum', () => {
        at(40);
        const [rendered = ''] = renderLines([line]);
        // 34 columns for the line, minus the text and the two percentages, split between two bars
        expect(getVisibleWidth(rendered)).toBe(34);
        expect(dots(rendered)[0]).toBeGreaterThan(0);
    });

    it('drops the bars to percent text when even one cell does not fit', () => {
        at(20);
        const [rendered = ''] = renderLines([line]);
        expect(dots(rendered)).toEqual([]);
        expect(rendered).toContain('42.0%');
    });

    it('sizes every line on its own', () => {
        at(50);
        const [one = '', two = ''] = renderLines([line, [bar('s', 'session-usage'), text('x', 'a longer piece of static text here')]]);
        expect(dots(one).reduce((a, b) => a + b, 0)).toBeGreaterThan(dots(two).reduce((a, b) => a + b, 0));
        expect(getVisibleWidth(one)).toBeLessThanOrEqual(44);
        expect(getVisibleWidth(two)).toBeLessThanOrEqual(44);
    });

    it('honours barMax and the global progressBarMax', () => {
        at(200);
        expect(dots(renderLines([[bar('s', 'session-usage', { barMax: '4' })]])[0] ?? '')).toEqual([4]);
        expect(dots(renderLines([line], settingsWith({ progressBarMax: 6 }))[0] ?? '')).toEqual([6, 6]);
    });

    it('accounts for the pill caps', () => {
        at(200);
        const [rendered = ''] = renderLines([[bar('s', 'session-usage', { barStyle: 'pill' })]]);
        // 10 cells + 2 caps, a space and '42.0%'
        expect(getVisibleWidth(rendered.trim())).toBe(12 + 1 + 5);
    });

    it('leaves the rest of a flex-separator line for the separator', () => {
        at(120);
        const [rendered = ''] = renderLines([[text('a', 'left'), bar('s', 'session-usage'), { id: 'f', type: 'flex-separator' }, text('b', 'right')]]);
        expect(dots(rendered)).toEqual([10]);
        expect(getVisibleWidth(rendered)).toBe(114);
        expect(rendered.trimStart().startsWith('left')).toBe(true);
        expect(rendered.trimEnd().endsWith('right')).toBe(true);
    });

    it('keeps fluid bars working in powerline mode', () => {
        at(100);
        const settings = settingsWith({ powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } });
        const [rendered = ''] = renderLines([line], settings);
        expect(dots(rendered)).toEqual([10, 10]);
        expect(getVisibleWidth(rendered)).toBeLessThanOrEqual(94);
    });

    it('falls back to 5 cells when the width is unknown', () => {
        // 0 is what an undetectable width looks like once it reaches the renderer
        const context: RenderContext = { terminalWidth: 0, usageData: { sessionUsage: 42 } };
        const pre = preRenderAllWidgets([[bar('s', 'session-usage')]], settingsWith(), context);
        expect(dots(getVisibleText(pre[0]?.[0]?.content ?? ''))).toEqual([5]);
    });
});
