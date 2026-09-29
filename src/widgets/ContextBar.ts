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
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { formatTokens } from '../utils/renderer';
import { makeUsageProgressBar } from '../utils/usage';

import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import {
    barOptionsFor,
    fluidBarCells,
    makeStyledBar
} from './shared/progress-bar';
import {
    cycleBarStyle,
    makeSliderBar
} from './shared/usage-display';

type DisplayMode = 'progress' | 'progress-short' | 'progress-xs' | 'fluid' | 'slider' | 'slider-only';

function getDisplayMode(item: WidgetItem): DisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'progress-xs' || mode === 'fluid' || mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'progress-short';
}

function isBarSliderMode(mode: DisplayMode): boolean {
    return mode === 'slider' || mode === 'slider-only';
}

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getDisplayMode(item);
        const modifiers: string[] = [];

        if (mode === 'progress-short') {
            modifiers.push('medium bar');
        } else if (mode === 'progress-xs' || mode === 'fluid') {
            modifiers.push(mode === 'fluid' ? 'fluid bar' : 'tiny bar');
            if (isMetadataFlagEnabled(item, 'showPercent')) {
                modifiers.push('percent');
            }
            if (isMetadataFlagEnabled(item, 'showUsage')) {
                modifiers.push('usage');
            }
        } else if (mode === 'slider') {
            modifiers.push('short bar');
        } else if (mode === 'slider-only') {
            modifiers.push('short bar only');
        }

        if (mode !== 'slider' && mode !== 'slider-only' && item.metadata?.barStyle) {
            modifiers.push(`${item.metadata.barStyle} style`);
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-bar-style') {
            return cycleBarStyle(item);
        }

        if (action === 'toggle-percent') {
            return toggleMetadataFlag(item, 'showPercent');
        }

        if (action === 'toggle-usage') {
            return toggleMetadataFlag(item, 'showUsage');
        }

        if (action !== 'toggle-progress') {
            return null;
        }

        const currentMode = getDisplayMode(item);
        const nextMode: DisplayMode = currentMode === 'progress-short'
            ? 'progress'
            : currentMode === 'progress'
                ? 'progress-xs'
                : currentMode === 'progress-xs'
                    ? 'slider'
                    : currentMode === 'slider'
                        ? 'slider-only'
                        : 'progress-short';

        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                display: nextMode
            }
        };
    }

    // The xs and fluid bars are bracket-less; percent and used/total are opt-in via showPercent / showUsage
    private makeBar(item: WidgetItem, settings: Settings, percent: number, width: number, framed = width > 5): string {
        const options = barOptionsFor(item, settings, percent);
        // Brackets only frame the blocks style on the longer bars
        return options.style === 'blocks' && framed
            ? makeUsageProgressBar(percent, width)
            : makeStyledBar(percent, width, options);
    }

    private renderXs(item: WidgetItem, settings: Settings, percent: number, usageText: string): string {
        const width = getDisplayMode(item) === 'fluid' ? fluidBarCells(item, settings) : 5;
        const parts = [this.makeBar(item, settings, percent, width, false)].filter(Boolean);
        if (isMetadataFlagEnabled(item, 'showPercent')) {
            parts.push(`${Math.round(percent)}%`);
        }
        if (isMetadataFlagEnabled(item, 'showUsage')) {
            parts.push(usageText);
        }
        if (parts.length === 0) {
            return '';
        }
        const display = parts.join(' ');
        return item.rawValue ? display : `Context: ${display}`;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getDisplayMode(item);
        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            if (displayMode === 'progress-xs' || displayMode === 'fluid') {
                return this.renderXs(item, settings, 25, '50k/200k');
            }
            const usedDisplay = formatTokens(50000, tokenFormat, 0);
            const totalDisplay = formatTokens(200000, tokenFormat, 0);
            const percentDisplay = formatPercent(25, percentFormat, 0);
            if (isBarSliderMode(displayMode)) {
                const slider = makeSliderBar(25);
                const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
                return item.rawValue ? sliderDisplay : `Context: ${sliderDisplay}`;
            }
            const barWidth = displayMode === 'progress' ? 32 : 16;
            const previewDisplay = `${this.makeBar(item, settings, 25, barWidth)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;
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
        const usedDisplay = formatTokens(used, tokenFormat, 0);
        const totalDisplay = formatTokens(total, tokenFormat, 0);
        const percentDisplay = formatPercent(clampedPercent, percentFormat, 0);

        if (displayMode === 'progress-xs' || displayMode === 'fluid') {
            return this.renderXs(item, settings, clampedPercent, `${Math.round(used / 1000)}k/${Math.round(total / 1000)}k`);
        }

        if (isBarSliderMode(displayMode)) {
            const slider = makeSliderBar(clampedPercent);
            const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
            return item.rawValue ? sliderDisplay : `Context: ${sliderDisplay}`;
        }

        const barWidth = displayMode === 'progress' ? 32 : 16;
        const display = `${this.makeBar(item, settings, clampedPercent, barWidth)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;

        return item.rawValue ? display : `Context: ${display}`;
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' }
        ];
        if (item && !isBarSliderMode(getDisplayMode(item))) {
            keybinds.push({ key: 'b', label: '(b)ar style', action: 'cycle-bar-style' });
        }
        if (item && ['progress-xs', 'fluid'].includes(getDisplayMode(item))) {
            keybinds.push(
                { key: 'e', label: 'show p(e)rcent', action: 'toggle-percent' },
                { key: 'u', label: 'show (u)sage', action: 'toggle-usage' }
            );
        }
        return keybinds;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
