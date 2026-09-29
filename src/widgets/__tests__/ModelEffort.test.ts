import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getVisibleWidth } from '../../utils/ansi';
import { updateColorMap } from '../../utils/colors';
import { ModelEffortWidget } from '../ModelEffort';

const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'me', type: 'model-effort', metadata });
const context = (effort?: string, model = 'Sonnet 4.6 (200K context)'): RenderContext => ({ data: { model: { id: 'claude-sonnet-4-6', display_name: model }, ...(effort ? { effort: { level: effort } } : {}) } });
const widget = new ModelEffortWidget();
const render = (metadata: Record<string, string> | undefined, ctx: RenderContext): string | null => widget.render(item(metadata), ctx, DEFAULT_SETTINGS);

describe('ModelEffortWidget', () => {
    let previousLevel: typeof chalk.level;

    beforeEach(() => {
        previousLevel = chalk.level;
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = previousLevel;
        updateColorMap();
    });

    it('renders (model|effort)', () => {
        expect(strip(render(undefined, context('high')) ?? '')).toBe('(Sonnet 4.6|high)');
    });

    it('uses the first word only with shortName', () => {
        expect(strip(render({ shortName: 'true' }, context('high')) ?? '')).toBe('(Sonnet|high)');
    });

    it('leaves out the effort when it is unset or medium', () => {
        expect(strip(render({ shortName: 'true' }, context()) ?? '')).toBe('(Sonnet)');
        expect(strip(render({ shortName: 'true' }, context('medium')) ?? '')).toBe('(Sonnet)');
    });

    it('shows medium with showMedium', () => {
        expect(strip(render({ shortName: 'true', showMedium: 'true' }, context('medium')) ?? '')).toBe('(Sonnet|medium)');
    });

    it('keeps unknown levels visible with a question mark', () => {
        expect(strip(render({ shortName: 'true' }, context('super-max')) ?? '')).toBe('(Sonnet|super-max?)');
    });

    it('supports custom delimiters and separator, including empty ones', () => {
        expect(strip(render({ shortName: 'true', open: '[', close: ']', separator: ' · ' }, context('high')) ?? '')).toBe('[Sonnet · high]');
        expect(strip(render({ shortName: 'true', open: '', close: '' }, context('high')) ?? '')).toBe('Sonnet|high');
    });

    it('uses rounded Powerline caps instead of the delimiters', () => {
        const out = render({ shortName: 'true', caps: 'rounded' }, context('high')) ?? '';
        expect(strip(out)).toBe('Sonnet|high');
        expect(getVisibleWidth(out)).toBe(getVisibleWidth('Sonnet|high'));
    });

    it('dims delimiters and separator with the track colour and leaves the text alone', () => {
        const out = render({ shortName: 'true' }, context('high')) ?? '';
        const dim = (text: string): string => `\x1b[38;2;77;77;77m${text}\x1b[39m`;
        expect(out).toBe(`${dim('(')}Sonnet${dim('|')}high${dim(')')}`);
        // trackColor overrides the dim colour
        expect(render({ shortName: 'true', trackColor: '#ff0000' }, context('high'))).toContain('\x1b[38;2;255;0;0m(\x1b[39m');
    });

    it('is plain text without colour support', () => {
        chalk.level = 0;
        updateColorMap();
        expect(render({ shortName: 'true' }, context('high'))).toBe('(Sonnet|high)');
    });

    it('returns null without a model and renders a preview', () => {
        expect(render(undefined, {})).toBeNull();
        expect(strip(widget.render(item(), { isPreview: true }, DEFAULT_SETTINGS) ?? '')).toBe('(Sonnet|high)');
    });
});
