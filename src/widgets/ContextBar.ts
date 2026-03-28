import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';
import { makeUsageProgressBar } from '../utils/usage';

import {
    cycleProgressBarMode,
    formatProgressBarText,
    getProgressBarMode,
    getProgressBarWidth,
    isProgressPercentVisible,
    isProgressUsageVisible,
    type ProgressBarMode,
    toggleProgressPercent,
    toggleProgressUsage
} from './shared/progress-bar-display';

function getDisplayMode(item: WidgetItem): ProgressBarMode {
    return getProgressBarMode(item, 'progress-s');
}

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getDisplayMode(item);
        const labels: Record<ProgressBarMode, string> = {
            'progress': 'bar',
            'progress-s': 'bar s',
            'progress-xs': 'bar xs'
        };
        const modifiers = [labels[mode]];

        if (isProgressPercentVisible(item)) {
            modifiers.push('percent');
        }

        if (isProgressUsageVisible(item)) {
            modifiers.push('usage');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            const nextMode = cycleProgressBarMode(getDisplayMode(item));
            return {
                ...item,
                metadata: {
                    ...(item.metadata ?? {}),
                    display: nextMode
                }
            };
        }

        if (action === 'toggle-percent') {
            return toggleProgressPercent(item);
        }

        if (action === 'toggle-usage') {
            return toggleProgressUsage(item);
        }

        return null;
    }

    private buildDisplay(item: WidgetItem, percent: number, bar: string, usageText: string): string {
        return formatProgressBarText(bar, {
            showPercent: isProgressPercentVisible(item),
            percentText: `${Math.round(percent)}%`,
            showUsage: isProgressUsageVisible(item),
            usageText
        });
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getDisplayMode(item);
        const barWidth = getProgressBarWidth(displayMode);

        if (context.isPreview) {
            const previewBar = makeUsageProgressBar(25, barWidth);
            const previewDisplay = this.buildDisplay(item, 25, previewBar, '50k/200k');
            return item.rawValue ? previewDisplay : `Context: ${previewDisplay}`;
        }

        const contextWindowMetrics = getContextWindowMetrics(context.data);

        let total = contextWindowMetrics.windowSize;
        let used = contextWindowMetrics.contextLengthTokens;

        if (used === null && context.tokenMetrics) {
            used = context.tokenMetrics.contextLength;
        }

        if (total === null && context.tokenMetrics) {
            const modelIdentifier = getModelContextIdentifier(context.data?.model);
            total = getContextConfig(modelIdentifier).maxTokens;
        }

        if (used === null || total === null || total <= 0) {
            return null;
        }

        const percent = (used / total) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));
        const usedK = Math.round(used / 1000);
        const totalK = Math.round(total / 1000);
        const bar = makeUsageProgressBar(clampedPercent, barWidth);
        const display = this.buildDisplay(item, clampedPercent, bar, `${usedK}k/${totalK}k`);

        return item.rawValue ? display : `Context: ${display}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'e', label: 'show p(e)rcent', action: 'toggle-percent' },
            { key: 'u', label: 'show (u)sage', action: 'toggle-usage' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}