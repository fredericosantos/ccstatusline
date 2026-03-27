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
    getUsageErrorMessage,
    makeUsageProgressBar,
    resolveUsageWindowWithFallback
} from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    isUsageBarMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageProgressBarWidth,
    getUsageTimerCustomKeybinds,
    isUsageCompact,
    isUsageInverted,
    toggleUsageCompact,
    toggleUsageInverted
} from './shared/usage-display';
import {
    formatProgressBarText,
    isProgressPercentVisible,
    toggleProgressPercent
} from './shared/progress-bar-display';

export class BlockResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until current 5hr block reset window'; }
    getDisplayName(): string { return 'Block Reset Timer'; }
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
            const previewPercent = inverted ? 90.0 : 10.0;

            if (isUsageBarMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const bar = makeUsageProgressBar(previewPercent, barWidth);
                const display = formatProgressBarText(bar, {
                    showPercent: isProgressPercentVisible(item),
                    percentText: `${previewPercent.toFixed(1)}%`
                });
                return formatRawOrLabeledValue(item, 'Reset ', display);
            }

            return formatRawOrLabeledValue(item, 'Reset: ', compact ? '4h30m' : '4hr 30m');
        }

        const usageData = context.usageData ?? {};
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics);

        if (!window) {
            if (usageData.error) {
                return getUsageErrorMessage(usageData.error);
            }

            return null;
        }

        if (isUsageBarMode(displayMode)) {
            const barWidth = getUsageProgressBarWidth(displayMode);
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const bar = makeUsageProgressBar(percent, barWidth);
            const display = formatProgressBarText(bar, {
                showPercent: isProgressPercentVisible(item),
                percentText: `${percent.toFixed(1)}%`
            });
            return formatRawOrLabeledValue(item, 'Reset ', display);
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact);
        return formatRawOrLabeledValue(item, 'Reset: ', remainingTime);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsageTimerCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}