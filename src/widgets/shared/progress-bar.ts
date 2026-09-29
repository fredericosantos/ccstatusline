import chalk from 'chalk';

import type { BarStyle } from '../../types/BarStyle';
import { BAR_STYLES } from '../../types/BarStyle';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getColorHex } from '../../utils/colors';

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

// Minimal defaults: white fill over a faint track. Bars carry their own colours; the
// widget's configured colour still styles the percent text around them.
export const BAR_COLORS = {
    fill: '#FFFFFF',
    track: '#4D4D4D',
    warn: '#E5B454',
    danger: '#D4574A',
    cursor: '#F4F3EE'
} as const;

const DEFAULT_SYMBOL = '●';
const WARN_AT = 75;
const DANGER_AT = 90;
const EIGHTHS = ' ▏▎▍▌▋▊▉█';
const FG_OFF = '\x1b[39m';

// chalk downgrades the hex to the active colour level, so the open code is derived
// from it instead of hand-building truecolor / 256-colour sequences
function open(hex: string): string {
    const styled = chalk.hex(hex)('x');
    return styled.slice(0, styled.indexOf('x'));
}

// Plain alpha compositing in sRGB, so "35% of the way to the fill" is literally 35% opacity
function blend(from: string, to: string, ratio: number): string {
    const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
    return '#' + [1, 3, 5]
        .map(at => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * ratio).toString(16).padStart(2, '0'))
        .join('');
}

// '#RRGGBB', 'hex:RRGGBB' or one of the project's colour names; anything else falls back
export function resolveBarColor(value: string | undefined, fallback: string): string {
    const hex = value ? /^(?:#|hex:)([0-9a-f]{6})$/i.exec(value)?.[1] : undefined;
    return hex ? `#${hex}` : (value ? getColorHex(value) : undefined) ?? fallback;
}

// One code point only; combining sequences are rejected (ponytail: use Intl.Segmenter if those are ever wanted)
export function resolveBarSymbol(value: string | undefined, fallback = DEFAULT_SYMBOL): string {
    return value !== undefined && Array.from(value).length === 1 ? value : fallback;
}

export function resolveBarStyle(item: WidgetItem, settings: Settings): BarStyle {
    // Without colour the styles cannot tell fill from track, so fall back to blocks
    if (chalk.level === 0) {
        return 'blocks';
    }
    const override = item.metadata?.barStyle;
    return BAR_STYLES.find(style => style === override) ?? settings.progressBarStyle ?? 'dots';
}

export function getBarFillColor(usedPercent?: number, base: string = BAR_COLORS.fill): string {
    if (usedPercent === undefined) {
        return base;
    }
    return usedPercent >= DANGER_AT ? BAR_COLORS.danger : usedPercent >= WARN_AT ? BAR_COLORS.warn : base;
}

interface StyledBarOptions {
    style: BarStyle;
    fill?: string;
    track?: string;
    // Symbol drawn by the dots style
    symbol?: string;
    // Percentage that drives the warn / danger colours; leave undefined for the plain fill colour
    escalatePercent?: number;
    cursorPercent?: number;
}

// Everything a widget needs to draw its bar: metadata wins over the global settings, then the defaults.
// consumedPercent is passed only by widgets that fill up with use, and only escalates when it is enabled.
export function barOptionsFor(item: WidgetItem, settings: Settings, consumedPercent?: number): StyledBarOptions {
    const meta = item.metadata;
    const escalate = meta?.escalate === 'true' || (meta?.escalate !== 'false' && settings.progressBarEscalate === true);
    return {
        style: resolveBarStyle(item, settings),
        fill: resolveBarColor(meta?.fillColor, resolveBarColor(settings.progressBarFillColor, BAR_COLORS.fill)),
        track: resolveBarColor(meta?.trackColor, resolveBarColor(settings.progressBarTrackColor, BAR_COLORS.track)),
        symbol: resolveBarSymbol(meta?.symbol, resolveBarSymbol(settings.progressBarSymbol)),
        escalatePercent: escalate ? consumedPercent : undefined
    };
}

export function makeStyledBar(percent: number, width: number, options: StyledBarOptions): string {
    if (options.style === 'blocks') {
        return makeTimerProgressBar(percent, width, options);
    }

    const clamped = Math.max(0, Math.min(100, percent));
    const track = options.track ?? BAR_COLORS.track;
    const fill = getBarFillColor(options.escalatePercent, options.fill);
    const cursorPos = options.cursorPercent === undefined
        ? -1
        : Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1);
    const cells = (paint: (i: number) => string): string => Array.from({ length: width }, (_, i) => i === cursorPos ? `${open(BAR_COLORS.cursor)}│` : paint(i)).join('');

    if (options.style === 'pill') {
        // Rounded Powerline caps around foreground-only cells that fill in eighths; no track at all,
        // so an empty pill is blank. The width stays constant: the cap slots hold a space until drawn.
        const eighths = Math.round((clamped / 100) * width * 8);
        const full = Math.floor(eighths / 8);
        const cap = (glyph: string, on: boolean): string => on ? `${open(fill)}${glyph}${FG_OFF}` : ' ';
        const body = cells(i => i < full
            ? `${open(fill)}█`
            : i === full && eighths % 8 > 0 ? `${open(fill)}${EIGHTHS.charAt(eighths % 8)}` : ' ');

        return `${cap('\ue0b6', eighths > 0)}${body}${eighths > 0 ? FG_OFF : ''}${cap('\ue0b4', eighths >= width * 8)}`;
    }

    // dots / line: each symbol owns an equal slice of the range. Symbols before the boundary are fully
    // filled, the boundary symbol fades from track to fill by how much of its own slice is covered.
    const symbol = options.style === 'line' ? '━' : options.symbol ?? DEFAULT_SYMBOL;
    const at = (clamped * width) / 100;
    const eps = 1e-9;
    return cells((i) => {
        const color = i + 1 <= at + eps ? fill : i < at - eps ? blend(track, fill, at - i) : track;
        return `${open(color)}${symbol}`;
    }) + FG_OFF;
}

interface UsageBarOptions {
    // Consumption widgets fill up with use and may turn amber / red (opt-in); timers never do
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
    const consumed = options.escalate === true ? (isUsageInverted(item) ? 100 - percent : percent) : undefined;
    const barOptions = barOptionsFor(item, settings, consumed);
    const bar = makeStyledBar(percent, getUsageProgressBarWidth(mode), { ...barOptions, cursorPercent: options.cursor?.cursorPercent });

    return formatUsageProgress(item, mode, bar, percentText, barOptions.style);
}
