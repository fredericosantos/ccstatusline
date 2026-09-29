import chalk from 'chalk';

import type { BarStyle } from '../../types/BarStyle';
import { BAR_STYLES } from '../../types/BarStyle';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import {
    formatUsageProgress,
    getUsageProgressBarWidth,
    isUsageInverted,
    type UsageDisplayMode
} from './usage-display';

export interface TimerProgressBarOptions { cursorPercent?: number }

export function makeTimerProgressBar(
    percent: number,
    width: number,
    options?: TimerProgressBarOptions
): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.round((clampedPercent / 100) * width);

    const cursorPos = options?.cursorPercent !== undefined
        ? Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1)
        : -1;

    let bar = '';
    for (let i = 0; i < width; i++) {
        if (i === cursorPos) {
            bar += '│';
        } else if (i < filledWidth) {
            bar += '█';
        } else {
            bar += '░';
        }
    }

    return bar;
}

// Claude palette. Bars carry their own colours; the widget's configured colour
// still styles the percent text around them.
export const BAR_COLORS = {
    fill: '#D97757',
    warn: '#E5B454',
    danger: '#D4574A',
    track: '#3B3936',
    cursor: '#F4F3EE'
} as const;

const WARN_AT = 75;
const DANGER_AT = 90;
const EIGHTHS = ' ▏▎▍▌▋▊▉█';
const FG_OFF = '\x1b[39m';
const BG_OFF = '\x1b[49m';

// chalk downgrades the hex to the active colour level, so the open code is derived
// from it instead of hand-building truecolor / 256-colour sequences
function open(hex: string, background = false): string {
    const styled = (background ? chalk.bgHex(hex) : chalk.hex(hex))('x');
    return styled.slice(0, styled.indexOf('x'));
}

function blend(from: string, to: string, ratio: number): string {
    const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
    return '#' + [1, 3, 5]
        .map(at => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * ratio).toString(16).padStart(2, '0'))
        .join('');
}

export function resolveBarStyle(item: WidgetItem, settings: Settings): BarStyle {
    // Without colour the styles cannot tell fill from track, so fall back to blocks
    if (chalk.level === 0) {
        return 'blocks';
    }
    const override = item.metadata?.barStyle;
    return BAR_STYLES.find(style => style === override) ?? settings.progressBarStyle ?? 'dots';
}

export function getBarFillColor(usedPercent?: number): string {
    if (usedPercent === undefined) {
        return BAR_COLORS.fill;
    }
    return usedPercent >= DANGER_AT ? BAR_COLORS.danger : usedPercent >= WARN_AT ? BAR_COLORS.warn : BAR_COLORS.fill;
}

interface StyledBarOptions {
    style: BarStyle;
    // Percentage that drives the warn / danger colours; leave undefined for the plain fill colour
    escalatePercent?: number;
    cursorPercent?: number;
}

export function makeStyledBar(percent: number, width: number, options: StyledBarOptions): string {
    if (options.style === 'blocks') {
        return makeTimerProgressBar(percent, width, options);
    }

    const clamped = Math.max(0, Math.min(100, percent));
    const fill = getBarFillColor(options.escalatePercent);
    const cursorPos = options.cursorPercent === undefined
        ? -1
        : Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1);
    const cursor = (background: boolean): string => `${open(BAR_COLORS.cursor)}${background ? open(BAR_COLORS.track, true) : ''}│`;
    const cells = (paint: (i: number) => string): string => Array.from({ length: width }, (_, i) => i === cursorPos ? cursor(options.style === 'pill') : paint(i)).join('');

    if (options.style === 'dots') {
        const at = (clamped / 100) * width;
        return cells((i) => {
            const color = i + 1 <= at ? fill : i < at ? blend(BAR_COLORS.track, fill, at - i) : BAR_COLORS.track;
            return `${open(color)}●`;
        }) + FG_OFF;
    }

    if (options.style === 'line') {
        const halves = Math.round((clamped / 100) * width * 2);
        const full = Math.floor(halves / 2);
        return cells((i) => {
            if (i < full) {
                return `${open(fill)}━`;
            }
            if (i === full) {
                return halves % 2 === 1 ? `${open(fill)}╸` : `${open(BAR_COLORS.track)}╺`;
            }
            return `${open(BAR_COLORS.track)}━`;
        }) + FG_OFF;
    }

    // pill: rounded Powerline caps around cells that fill in eighths
    const eighths = Math.round((clamped / 100) * width * 8);
    const full = Math.floor(eighths / 8);
    const body = cells((i) => {
        if (i < full) {
            return `${open(fill, true)} `;
        }
        return i === full && eighths % 8 > 0
            ? `${open(fill)}${open(BAR_COLORS.track, true)}${EIGHTHS.charAt(eighths % 8)}`
            : `${open(BAR_COLORS.track, true)} `;
    });
    const leftCap = `${open(eighths > 0 ? fill : BAR_COLORS.track)}${FG_OFF}`;
    const rightCap = `${open(eighths >= width * 8 ? fill : BAR_COLORS.track)}${FG_OFF}`;

    return `${leftCap}${body}${BG_OFF}${rightCap}`;
}

interface UsageBarOptions {
    // Consumption widgets turn amber / red as they fill; timers keep the plain fill colour
    escalate?: boolean;
    cursor?: TimerProgressBarOptions;
}

// Bar plus percent text for every progress display mode, in the resolved style
export function renderUsageBar(
    item: WidgetItem,
    settings: Settings,
    mode: UsageDisplayMode,
    percent: number,
    percentText: string,
    options: UsageBarOptions = {}
): string {
    const style = resolveBarStyle(item, settings);
    const escalate = options.escalate === true && item.metadata?.escalate !== 'false';
    const bar = makeStyledBar(percent, getUsageProgressBarWidth(mode), {
        style,
        escalatePercent: escalate ? (isUsageInverted(item) ? 100 - percent : percent) : undefined,
        cursorPercent: options.cursor?.cursorPercent
    });

    return formatUsageProgress(item, mode, bar, percentText, style);
}
