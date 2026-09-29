import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import {
    getUsageErrorMessage,
    resolveUsageWindowWithFallback,
    resolveWeeklyUsageWindow
} from '../utils/usage';

import { makeModifierText } from './shared/editor-display';
import { isHidden } from './shared/hideable';
import {
    barOptionsFor,
    escalatePercentText,
    fluidBarCells,
    makePaceBar,
    makeStyledBar,
    resolvePaceColors,
    resolvePaceStyle
} from './shared/progress-bar';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleBarStyle,
    getUsageDisplayMode,
    getUsageProgressBarWidth,
    isUsageProgressMode,
    type UsageDisplayMode
} from './shared/usage-display';

type PaceKind = 'session' | 'weekly';

const KINDS = {
    session: { label: '5h', displayName: 'Session Pace', field: 'sessionUsage' as const, window: '5-hour' },
    weekly: { label: '7d', displayName: 'Weekly Pace', field: 'weeklyUsage' as const, window: 'weekly' }
};

const TEXT_MODES = ['usage', 'both', 'delta', 'none'] as const;
type TextMode = typeof TEXT_MODES[number];
const DISPLAYS: UsageDisplayMode[] = ['progress-xs', 'progress-short', 'progress', 'fluid'];

const WIDTH_NAMES: Record<string, string> = { 'progress-xs': 'tiny bar', 'progress-short': 'medium bar', 'progress': 'long bar', 'fluid': 'fluid bar' };

function cycle<T>(list: readonly T[], current: T): T {
    return list[(list.indexOf(current) + 1) % list.length] as T;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
const getTextMode = (item: WidgetItem): TextMode => TEXT_MODES.find(mode => mode === item.metadata?.text) ?? 'usage';
// Bars only: a widget without a progress display (the usage default is 'time') gets the tiny bar
const getDisplay = (item: WidgetItem): UsageDisplayMode => {
    const mode = getUsageDisplayMode(item);
    return isUsageProgressMode(mode) ? mode : 'progress-xs';
};

// Text after the bar: usage percent, usage/elapsed, or the signed gap in points. Coloured by progressTextEscalation
// from the usage share, like the other consumption bars.
function paceText(item: WidgetItem, settings: Settings, used: number, elapsed: number | undefined): string {
    const mode = getTextMode(item);
    if (mode === 'none') {
        return '';
    }
    const gap = Math.round(used - (elapsed ?? used));
    const text = elapsed === undefined || mode === 'usage'
        ? formatPercent(used, resolveNumberFormat('percent', item, settings))
        : mode === 'both' ? `${Math.round(used)}/${Math.round(elapsed)}%` : gap > 0 ? `+${gap}` : `${gap}`;
    return escalatePercentText(item, settings, text, used, true);
}

class PaceWidget implements Widget {
    constructor(private readonly kind: PaceKind) {}

    getDefaultColor(): string { return 'white'; }
    getDescription(): string {
        const { window } = KINDS[this.kind];
        return `One bar for the ${window} usage window with two measures: usage consumed and time elapsed.\n`
            + 'Blue = time elapsed ahead of usage (slack), orange = usage ahead of time (burning fast), cream = both (on pace).\n'
            + 'Colours: progressPaceColors or metadata usageColor / timeColor / bothColor. Text: metadata text = usage | both | delta | none.';
    }

    getDisplayName(): string { return KINDS[this.kind].displayName; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName(), modifierText: makeModifierText([WIDTH_NAMES[getDisplay(item)] ?? '', `text: ${getTextMode(item)}`]) };
    }

    getHideableStates(): HideableState[] { return [USAGE_NO_DATA_HIDEABLE_STATE]; }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress width', action: 'cycle-width' },
            { key: 't', label: '(t)ext', action: 'cycle-text' },
            { key: 'b', label: '(b)ar style', action: 'cycle-bar-style' }
        ];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-bar-style') {
            return cycleBarStyle(item);
        }
        if (action === 'cycle-width') {
            return { ...item, metadata: { ...item.metadata, display: cycle(DISPLAYS, getDisplay(item)) } };
        }
        return action === 'cycle-text'
            ? { ...item, metadata: { ...item.metadata, text: cycle(TEXT_MODES, getTextMode(item)) } }
            : null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const config = KINDS[this.kind];
        let used: number;
        let elapsed: number | undefined;

        if (context.isPreview) {
            used = 42;
            elapsed = 30;
        } else {
            const data = context.usageData ?? {};
            const usage = data[config.field];
            if (usage === undefined) {
                if (data.error) {
                    return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key) ? null : getUsageErrorMessage(data.error);
                }
                return null;
            }
            used = clamp(usage);
            const window = this.kind === 'session' ? resolveUsageWindowWithFallback(data, context.blockMetrics) : resolveWeeklyUsageWindow(data);
            elapsed = window?.elapsedPercent;
        }

        const display = getDisplay(item);
        const width = display === 'fluid' ? fluidBarCells(item, settings) : getUsageProgressBarWidth(display);
        const style = resolvePaceStyle(item, settings);
        const base = barOptionsFor(item, settings, used);
        // No time information (or no colour support): the plain usage bar, in the normal fill colour
        const bar = elapsed === undefined || style === 'blocks'
            ? makeStyledBar(used, width, { ...base, style })
            : makePaceBar(used, elapsed, width, { style, symbol: base.symbol, track: base.track, colors: resolvePaceColors(item, settings) });

        const label = item.metadata?.label ?? config.label;
        return [label, bar, paceText(item, settings, used, elapsed)].filter(Boolean).join(' ') || null;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(): boolean { return true; }
}

export class SessionPaceWidget extends PaceWidget { constructor() { super('session'); } }
export class WeeklyPaceWidget extends PaceWidget { constructor() { super('weekly'); } }
