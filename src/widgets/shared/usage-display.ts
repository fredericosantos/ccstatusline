import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    type ProgressBarMode,
    getProgressBarWidth,
    isProgressPercentVisible,
    isProgressUsageVisible,
    isProgressBarMode
} from './progress-bar-display';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './metadata';

export type UsageDisplayMode = 'time' | ProgressBarMode;


const PROGRESS_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' };
const INVERT_TOGGLE_KEYBIND: CustomKeybind = { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' };
const PERCENT_TOGGLE_KEYBIND: CustomKeybind = { key: 'e', label: 'show p(e)rcent', action: 'toggle-percent' };
const USAGE_TOGGLE_KEYBIND: CustomKeybind = { key: 'u', label: 'show (u)sage', action: 'toggle-usage' };
const COMPACT_TOGGLE_KEYBIND: CustomKeybind = { key: 's', label: '(s)hort time', action: 'toggle-compact' };

export function getUsageDisplayMode(item: WidgetItem): UsageDisplayMode {
    return isProgressBarMode(item.metadata?.display) ? item.metadata.display : 'time';
}

export function isUsageProgressMode(mode: UsageDisplayMode): boolean {
    return mode !== 'time';
}

export function isUsageBarMode(mode: UsageDisplayMode): boolean {
    return isUsageProgressMode(mode);
}

export function getUsageProgressBarWidth(mode: UsageDisplayMode): number {
    return mode === 'time' ? 16 : getProgressBarWidth(mode);
}

export function isUsageInverted(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'invert');
}

export function isUsageCompact(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'compact');
}

export function toggleUsageCompact(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'compact');
}

interface UsageDisplayModifierOptions { includeCompact?: boolean }

export function getUsageDisplayModifierText(
    item: WidgetItem,
    options: UsageDisplayModifierOptions = {}
): string | undefined {
    const mode = getUsageDisplayMode(item);
    const modifiers: string[] = [];

    if (mode === 'progress') {
        modifiers.push('bar');
    } else if (mode === 'progress-s') {
        modifiers.push('bar s');
    } else if (mode === 'progress-xs') {
        modifiers.push('bar xs');
    }

    if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (isUsageBarMode(mode) && isProgressPercentVisible(item)) {
        modifiers.push('percent');
    }

    if (isUsageBarMode(mode) && isProgressUsageVisible(item)) {
        modifiers.push('usage');
    }

    if (options.includeCompact && !isUsageBarMode(mode) && isUsageCompact(item)) {
        modifiers.push('compact');
    }

    return makeModifierText(modifiers);
}

export function cycleUsageDisplayMode(item: WidgetItem, disabledInProgressKeys: string[] = []): WidgetItem {
    const currentMode = getUsageDisplayMode(item);
    const cycle: UsageDisplayMode[] = ['time', 'progress', 'progress-s', 'progress-xs'];
    const currentIndex = cycle.indexOf(currentMode);
    const nextMode: UsageDisplayMode = cycle[(currentIndex + 1) % cycle.length] ?? 'time';

    const nextItem = removeMetadataKeys(item, nextMode === 'time'
        ? ['invert']
        : disabledInProgressKeys);
    const nextMetadata: Record<string, string> = {
        ...(nextItem.metadata ?? {}),
        display: nextMode
    };

    return {
        ...nextItem,
        metadata: nextMetadata
    };
}

export function toggleUsageInverted(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'invert');
}

export function getUsagePercentCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    if (item && isUsageBarMode(getUsageDisplayMode(item))) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
        keybinds.push(PERCENT_TOGGLE_KEYBIND);
    }

    return keybinds;
}

interface UsageTimerKeybindOptions {
    includeUsageToggle?: boolean;
}

export function getUsageTimerCustomKeybinds(item?: WidgetItem, options: UsageTimerKeybindOptions = {}): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    if (item && isUsageBarMode(getUsageDisplayMode(item))) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
        keybinds.push(PERCENT_TOGGLE_KEYBIND);

        if (options.includeUsageToggle) {
            keybinds.push(USAGE_TOGGLE_KEYBIND);
        }
    } else {
        keybinds.push(COMPACT_TOGGLE_KEYBIND);
    }

    return keybinds;
}