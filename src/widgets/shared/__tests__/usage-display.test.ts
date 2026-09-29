import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    cycleUsageDisplayMode,
    formatUsageProgress,
    getUsageDisplayMode,
    getUsageProgressBarWidth,
    isUsageProgressMode,
    makeSliderBar
} from '../usage-display';

describe('makeSliderBar', () => {
    it('renders fully empty bar at 0%', () => {
        expect(makeSliderBar(0)).toBe('░░░░░░░░░░');
    });

    it('renders fully filled bar at 100%', () => {
        expect(makeSliderBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('renders half-filled bar at 50%', () => {
        expect(makeSliderBar(50)).toBe('▓▓▓▓▓░░░░░');
    });

    it('clamps values below 0', () => {
        expect(makeSliderBar(-10)).toBe('░░░░░░░░░░');
    });

    it('clamps values above 100', () => {
        expect(makeSliderBar(150)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('accepts custom width', () => {
        expect(makeSliderBar(50, 6)).toBe('▓▓▓░░░');
    });

    it('renders a time cursor when cursorPercent is provided', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: 50 })).toBe('▓▓▓▓▓│░░░░');
    });

    it('clamps slider cursor percent', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: -10 })).toBe('│▓▓▓▓░░░░░');
        expect(makeSliderBar(50, 10, { cursorPercent: 150 })).toBe('▓▓▓▓▓░░░░│');
    });
});

describe('cycleUsageDisplayMode with slider', () => {
    const base: WidgetItem = { id: 'test', type: 'session-usage' };

    function cycle(item: WidgetItem, times: number, includeSlider: boolean): WidgetItem[] {
        const items: WidgetItem[] = [];
        let current = item;
        for (let n = 0; n < times; n++) {
            current = cycleUsageDisplayMode(current, [], includeSlider);
            items.push(current);
        }
        return items;
    }

    it('includes slider modes when includeSlider is true', () => {
        const modes = cycle(base, 6, true).map(item => item.metadata?.display);
        expect(modes).toEqual(['progress', 'progress-short', 'progress-xs', 'slider', 'slider-only', 'time']);
    });

    it('skips slider modes when includeSlider is false', () => {
        const modes = cycle(base, 4, false).map(item => item.metadata?.display);
        expect(modes).toEqual(['progress', 'progress-short', 'progress-xs', 'time']);
    });

    it('keeps cursor metadata through slider modes and clears it when returning to time mode', () => {
        const cursorBase: WidgetItem = { ...base, metadata: { cursor: 'true' } };
        const items = cycle(cursorBase, 6, true);

        expect(items.slice(0, 5).map(item => item.metadata?.cursor)).toEqual(['true', 'true', 'true', 'true', 'true']);
        expect(items[5]?.metadata?.cursor).toBeUndefined();
    });
});

describe('progress-xs mode', () => {
    const xs: WidgetItem = { id: 'test', type: 'session-usage', metadata: { display: 'progress-xs' } };

    it('is a 5-wide progress mode', () => {
        expect(getUsageDisplayMode(xs)).toBe('progress-xs');
        expect(isUsageProgressMode('progress-xs')).toBe(true);
        expect(getUsageProgressBarWidth('progress-xs')).toBe(5);
    });

    it('renders bracket-less and shows percent only when showPercent is set', () => {
        expect(formatUsageProgress(xs, 'progress-xs', '██░░░', '42.0%')).toBe('██░░░');
        const withPercent = { ...xs, metadata: { ...xs.metadata, showPercent: 'true' } };
        expect(formatUsageProgress(withPercent, 'progress-xs', '██░░░', '42.0%')).toBe('██░░░ 42.0%');
        expect(formatUsageProgress(xs, 'progress', '██░░░', '42.0%')).toBe('[██░░░] 42.0%');
    });

    it('clears showPercent when cycling away from xs', () => {
        const withPercent: WidgetItem = { ...xs, metadata: { display: 'progress-xs', showPercent: 'true' } };
        expect(cycleUsageDisplayMode(withPercent).metadata?.showPercent).toBeUndefined();
        const short: WidgetItem = { ...xs, metadata: { display: 'progress-short', showPercent: 'true' } };
        expect(cycleUsageDisplayMode(short).metadata?.showPercent).toBe('true');
    });
});
