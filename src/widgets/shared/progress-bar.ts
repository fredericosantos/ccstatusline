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

function openBg(hex: string): string {
    const styled = chalk.bgHex(hex)('x');
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

interface TextEscalationStep { at: number; color: string }

// progressTextEscalation as steps sorted by `at`; malformed steps are skipped, nothing valid means off
export function resolveTextEscalation(settings: Settings): TextEscalationStep[] {
    const raw = settings.progressTextEscalation;
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((step: unknown) => {
        const { at, color } = (step ?? {}) as { at?: unknown; color?: unknown };
        const hex = typeof color === 'string' ? resolveBarColor(color, '') : '';
        return typeof at === 'number' && Number.isFinite(at) && hex ? [{ at, color: hex }] : [];
    }).sort((a, b) => a.at - b.at);
}

// Colours only the percent text of a bar widget with the last step at or below the used share; below the first
// step it keeps the widget's colour. Consumption widgets opt in by default, timers via metadata.textEscalation.
export function escalatePercentText(item: WidgetItem, settings: Settings, text: string, usedPercent: number, consumption: boolean): string {
    const flag = item.metadata?.textEscalation;
    if (chalk.level === 0 || flag === 'false' || (flag !== 'true' && !consumption)) {
        return text;
    }
    const color = resolveTextEscalation(settings).filter(step => step.at <= usedPercent).pop()?.color;
    return color ? `${open(color)}${text}${FG_OFF}` : text;
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
    // A fluid bar squeezed down to nothing takes no space at all, caps included
    if (width <= 0) {
        return '';
    }
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

// Pace bars: one bar, two measures. Each symbol is coloured by how much of it usage covers, how much of it the
// elapsed part of the window covers, and where both do. Fully "both" means on pace.
export const PACE_COLORS = { usage: '#D97757', time: '#6A9BCC', both: '#F4F3EE' } as const;
const PACE_TYPES = new Set(['session-pace', 'weekly-pace']);

export interface PaceColors { usage: string; time: string; both: string }

// Weighted average in sRGB (the same maths as blend, for any number of colours)
function mix(parts: [string, number][]): string {
    const total = parts.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    return '#' + [1, 3, 5]
        .map(at => Math.round(parts.reduce((sum, [hex, weight]) => sum + parseInt(hex.slice(at, at + 2), 16) * weight, 0) / total).toString(16).padStart(2, '0'))
        .join('');
}

// metadata.usageColor / timeColor / bothColor, then settings.progressPaceColors, then the defaults.
// bothColor 'mix' is the plain average of the usage and time colours.
export function resolvePaceColors(item: WidgetItem, settings: Settings): PaceColors {
    const cfg: Record<string, unknown> = settings.progressPaceColors ?? {};
    const fromConfig = (key: string): string | undefined => typeof cfg[key] === 'string' ? cfg[key] : undefined;
    const pick = (meta: string | undefined, key: string, fallback: string): string => resolveBarColor(meta, resolveBarColor(fromConfig(key), fallback));
    const usage = pick(item.metadata?.usageColor, 'usage', PACE_COLORS.usage);
    const time = pick(item.metadata?.timeColor, 'time', PACE_COLORS.time);
    const wantsMix = (item.metadata?.bothColor ?? fromConfig('both')) === 'mix';
    return { usage, time, both: wantsMix ? mix([[usage, 1], [time, 1]]) : pick(item.metadata?.bothColor, 'both', PACE_COLORS.both) };
}

// Pace bars are dots or line; pill and blocks fall back to dots. Without colour they cannot show two
// measures, so they degrade to the plain usage bar ('blocks').
export function resolvePaceStyle(item: WidgetItem, settings: Settings): 'dots' | 'line' | 'blocks' {
    if (chalk.level === 0) {
        return 'blocks';
    }
    return resolveBarStyle(item, settings) === 'line' ? 'line' : 'dots';
}

interface PaceBarOptions { style: 'dots' | 'line'; symbol?: string; track?: string; colors: PaceColors }

export function makePaceBar(usedPercent: number, elapsedPercent: number, width: number, options: PaceBarOptions): string {
    if (width <= 0) {
        return '';
    }
    const track = options.track ?? BAR_COLORS.track;
    const symbol = options.style === 'line' ? '━' : options.symbol ?? DEFAULT_SYMBOL;
    // Share of symbol i a percentage covers; the epsilon keeps exact boundaries (40% of 5) from smearing
    const cover = (percent: number, i: number): number => Math.max(0, Math.min(1, (Math.max(0, Math.min(100, percent)) * width) / 100 - i + 1e-9));
    return Array.from({ length: width }, (_, i) => {
        const used = cover(usedPercent, i);
        const elapsed = cover(elapsedPercent, i);
        const both = Math.min(used, elapsed);
        const color = mix([[options.colors.both, both], [options.colors.usage, used - both], [options.colors.time, elapsed - both], [track, 1 - Math.max(used, elapsed)]]);
        return `${open(color)}${symbol}`;
    }).join('') + FG_OFF;
}

// Dims a delimiter with the track colour; plain text when there is no colour support
// Text in an explicit colour (no-op without colour support)
export function colorText(text: string, hex: string): string {
    return chalk.level === 0 || !text ? text : `${open(hex)}${text}${FG_OFF}`;
}

// Filled capsule: rounded Powerline caps in the fill colour around text on a fill-coloured background.
// `text` may carry its own colours; `textColor` is the colour it starts in. Plain "(text)" without colour support.
export function filledPill(text: string, fill: string, textColor: string): string {
    if (chalk.level === 0) {
        return `(${text.replace(/\x1b\[[0-9;]*m/g, '')})`;
    }
    return `${open(fill)}\ue0b6${FG_OFF}${openBg(fill)}${open(textColor)}${text}${FG_OFF}\x1b[49m${open(fill)}\ue0b4${FG_OFF}`;
}

// A colour part-way from `from` to `to` (0..1), for dimming text against its background
export function blendHex(from: string, to: string, ratio: number): string {
    return blend(from, to, ratio);
}

export function dimText(item: WidgetItem, settings: Settings, text: string): string {
    if (!text || chalk.level === 0) {
        return text;
    }
    const track = resolveBarColor(item.metadata?.trackColor, resolveBarColor(settings.progressBarTrackColor, BAR_COLORS.track));
    return `${open(track)}${text}${FG_OFF}`;
}

const DEFAULT_FLUID_MIN = 3;
const DEFAULT_FLUID_MAX = 10;
// Cells a fluid bar takes before the terminal width is known
const FLUID_FALLBACK_CELLS = 5;
const PILL_CAPS = 2;

export function isFluidBar(item: WidgetItem): boolean {
    return item.metadata?.display === 'fluid';
}

// Non-negative integers only; anything else (text, decimals, negatives) is ignored
function toCount(value: string | number | undefined): number | undefined {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
}

// metadata.barMin / barMax, then progressBarMin / progressBarMax, then 3 / 10. min never exceeds max.
export function resolveFluidLimits(item: WidgetItem, settings: Settings): { min: number; max: number } {
    const max = toCount(item.metadata?.barMax) ?? toCount(settings.progressBarMax) ?? DEFAULT_FLUID_MAX;
    const min = toCount(item.metadata?.barMin) ?? toCount(settings.progressBarMin) ?? DEFAULT_FLUID_MIN;
    return { min: Math.min(min, max), max };
}

// Extra cells a style adds around the bar (the pill's rounded caps) once the bar has any cell at all
export function barOverhead(item: WidgetItem, settings: Settings): number {
    return !PACE_TYPES.has(item.type) && resolveBarStyle(item, settings) === 'pill' ? PILL_CAPS : 0;
}

// The renderer stamps the line's share into fluidCells on the copy it renders; without it (width unknown, TUI
// editor) a fluid bar takes 5 cells kept inside its limits
export function fluidBarCells(item: WidgetItem, settings: Settings): number {
    const { min, max } = resolveFluidLimits(item, settings);
    return Math.min(max, toCount(item.metadata?.fluidCells) ?? Math.max(min, FLUID_FALLBACK_CELLS));
}

export function withFluidCells(item: WidgetItem, cells: number): WidgetItem {
    return { ...item, metadata: { ...item.metadata, fluidCells: String(cells) } };
}

// Splits the room left on a line between its fluid bars: an equal share each (first bars take the remainder),
// capped at each bar's max. Bars that would get nothing vanish along with their overhead. Never overshoots `available`.
export function allocateFluidCells(available: number, bars: { max: number; overhead: number }[]): number[] {
    const budget = Math.max(0, available - bars.reduce((sum, bar) => sum + bar.overhead, 0));
    const base = Math.floor(budget / Math.max(1, bars.length));
    const extra = budget - base * bars.length;
    return bars.map((bar, i) => Math.min(bar.max, base + (i < extra ? 1 : 0)));
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
    const used = isUsageInverted(item) ? 100 - percent : percent;
    const barOptions = barOptionsFor(item, settings, options.escalate === true ? used : undefined);
    const width = mode === 'fluid' ? fluidBarCells(item, settings) : getUsageProgressBarWidth(mode);
    const bar = makeStyledBar(percent, width, { ...barOptions, cursorPercent: options.cursor?.cursorPercent });

    return formatUsageProgress(item, mode, bar, escalatePercentText(item, settings, percentText, used, options.escalate === true), barOptions.style);
}
