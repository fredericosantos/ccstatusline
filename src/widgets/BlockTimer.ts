import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatUsageDuration,
    makeUsageProgressBar,
    resolveUsageWindowWithFallback
} from '../utils/usage';

import {
    formatProgressBarText,
    isProgressPercentVisible,
    toggleProgressPercent
} from './shared/progress-bar-display';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageProgressBarWidth,
    getUsageTimerCustomKeybinds,
    isUsageBarMode,
    isUsageCompact,
    isUsageInverted,
    toggleUsageCompact,
    toggleUsageInverted
} from './shared/usage-display';

export class BlockTimerWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows current 5hr block elapsed time or progress'; }
    getDisplayName(): string { return 'Block Timer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeCompact: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, ['compact']);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        if (action === 'toggle-compact') {
            return toggleUsageCompact(item);
        }

        if (action === 'toggle-percent') {
            return toggleProgressPercent(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);

        if (context.isPreview) {
            const previewPercent = inverted ? 26.1 : 73.9;

            if (isUsageBarMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const bar = makeUsageProgressBar(previewPercent, barWidth);
                const display = formatProgressBarText(bar, {
                    showPercent: isProgressPercentVisible(item),
                    percentText: `${previewPercent.toFixed(1)}%`
                });
                return formatRawOrLabeledValue(item, 'Block ', display);
            }

            return formatRawOrLabeledValue(item, 'Block: ', compact ? '3h45m' : '3hr 45m');
        }

        const usageData = context.usageData ?? {};
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics);

        if (!window) {
            if (isUsageBarMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const emptyBar = makeUsageProgressBar(0, barWidth);
                const display = formatProgressBarText(emptyBar, {
                    showPercent: isProgressPercentVisible(item),
                    percentText: '0.0%'
                });
                return formatRawOrLabeledValue(item, 'Block ', display);
            }

            return formatRawOrLabeledValue(item, 'Block: ', compact ? '0h' : '0hr 0m');
        }

        if (isUsageBarMode(displayMode)) {
            const barWidth = getUsageProgressBarWidth(displayMode);
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const bar = makeUsageProgressBar(percent, barWidth);
            const display = formatProgressBarText(bar, {
                showPercent: isProgressPercentVisible(item),
                percentText: `${percent.toFixed(1)}%`
            });
            return formatRawOrLabeledValue(item, 'Block ', display);
        }

        const elapsedTime = formatUsageDuration(window.elapsedMs, compact);
        return formatRawOrLabeledValue(item, 'Block: ', elapsedTime);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsageTimerCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}