import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getUsageErrorMessage,
    makeUsageProgressBar
} from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    isUsageBarMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    getUsageProgressBarWidth,
    isUsageInverted,
    toggleUsageInverted
} from './shared/usage-display';
import {
    formatProgressBarText,
    isProgressPercentVisible,
    toggleProgressPercent
} from './shared/progress-bar-display';

export class WeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows weekly API usage percentage'; }
    getDisplayName(): string { return 'Weekly Usage'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        if (action === 'toggle-percent') {
            return toggleProgressPercent(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);

        if (context.isPreview) {
            const previewPercent = 12;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;
            const width = getUsageProgressBarWidth(displayMode);

            if (isUsageBarMode(displayMode)) {
                const bar = makeUsageProgressBar(renderedPercent, width);
                const display = formatProgressBarText(bar, {
                    showPercent: isProgressPercentVisible(item),
                    percentText: `${renderedPercent.toFixed(1)}%`
                });
                return formatRawOrLabeledValue(item, 'Weekly: ', display);
            }

            return formatRawOrLabeledValue(item, 'Weekly: ', `${previewPercent.toFixed(1)}%`);
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.weeklyUsage === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.weeklyUsage));
        const renderedPercent = inverted ? 100 - percent : percent;
        const width = getUsageProgressBarWidth(displayMode);

        if (isUsageBarMode(displayMode)) {
            const bar = makeUsageProgressBar(renderedPercent, width);
            const display = formatProgressBarText(bar, {
                showPercent: isProgressPercentVisible(item),
                percentText: `${renderedPercent.toFixed(1)}%`
            });
            return formatRawOrLabeledValue(item, 'Weekly: ', display);
        }

        return formatRawOrLabeledValue(item, 'Weekly: ', `${percent.toFixed(1)}%`);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}