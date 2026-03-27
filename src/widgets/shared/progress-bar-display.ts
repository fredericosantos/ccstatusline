import type { WidgetItem } from '../../types/Widget';

import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

export type ProgressBarMode = 'progress' | 'progress-s' | 'progress-xs';

const PROGRESS_BAR_MODE_CYCLE: ProgressBarMode[] = ['progress-s', 'progress', 'progress-xs'];

export function isProgressBarMode(mode: string | undefined): mode is ProgressBarMode {
    return mode === 'progress' || mode === 'progress-s' || mode === 'progress-xs';
}

export function getProgressBarMode(item: WidgetItem, fallback: ProgressBarMode = 'progress-s'): ProgressBarMode {
    const mode = item.metadata?.display;
    return isProgressBarMode(mode) ? mode : fallback;
}

export function cycleProgressBarMode(currentMode: ProgressBarMode): ProgressBarMode {
    const currentIndex = PROGRESS_BAR_MODE_CYCLE.indexOf(currentMode);
    return PROGRESS_BAR_MODE_CYCLE[(currentIndex + 1) % PROGRESS_BAR_MODE_CYCLE.length] ?? 'progress-s';
}

export function getProgressBarWidth(mode: ProgressBarMode): number {
    if (mode === 'progress') return 32;
    if (mode === 'progress-xs') return 5;
    return 16;
}

export function isProgressPercentVisible(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'showPercent');
}

export function isProgressUsageVisible(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'showUsage');
}

export function toggleProgressPercent(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'showPercent');
}

export function toggleProgressUsage(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'showUsage');
}

interface ProgressBarTextOptions {
    showPercent: boolean;
    percentText: string;
    showUsage?: boolean;
    usageText?: string;
}

export function formatProgressBarText(bar: string, options: ProgressBarTextOptions): string {
    const parts = [bar];

    if (options.showPercent) {
        parts.push(options.percentText);
    }

    if (options.showUsage && options.usageText) {
        parts.push(options.usageText);
    }

    return parts.join(' ');
}
