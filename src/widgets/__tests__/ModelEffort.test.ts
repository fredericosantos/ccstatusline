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

    describe('outputStyle', () => {
        const withStyle = (name?: string): RenderContext => ({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' }, effort: { level: 'high' }, ...(name ? { output_style: { name } } : {}) } });
        const opts = { shortName: 'true', outputStyle: 'true' };

        it('appends a non-default style after the effort, in the plain and pill forms', () => {
            expect(strip(render(opts, withStyle('concise')) ?? '')).toBe('(Sonnet|high|concise)');
            expect(strip(render({ ...opts, pill: 'true' }, withStyle('concise')) ?? '')).toBe('\ue0b6 Sonnet\u2022high\u2022concise \ue0b4');
        });

        it('hides the style when it is "default" (any case), missing, or the option is off', () => {
            expect(strip(render(opts, withStyle('default')) ?? '')).toBe('(Sonnet|high)');
            expect(strip(render(opts, withStyle('Default')) ?? '')).toBe('(Sonnet|high)');
            expect(strip(render(opts, withStyle()) ?? '')).toBe('(Sonnet|high)');
            expect(strip(render({ shortName: 'true' }, withStyle('concise')) ?? '')).toBe('(Sonnet|high)');
        });

        it('changes the case of the style only, via styleCase, without touching the model or effort', () => {
            const ctx = withStyle('Concise');
            expect(strip(render(opts, ctx) ?? '')).toBe('(Sonnet|high|Concise)');
            expect(strip(render({ ...opts, styleCase: 'lower' }, ctx) ?? '')).toBe('(Sonnet|high|concise)');
            expect(strip(render({ ...opts, styleCase: 'upper' }, ctx) ?? '')).toBe('(Sonnet|high|CONCISE)');
            expect(strip(render({ ...opts, styleCase: 'capitalize' }, withStyle('eXPLANATORY')) ?? '')).toBe('(Sonnet|high|Explanatory)');
            expect(strip(render({ ...opts, styleCase: 'bogus' }, ctx) ?? '')).toBe('(Sonnet|high|Concise)');
        });

        it('still hides "Default" in any case after the case transform option is set', () => {
            expect(strip(render({ ...opts, styleCase: 'upper' }, withStyle('Default')) ?? '')).toBe('(Sonnet|high)');
        });

        it('keeps the style when the effort is hidden (medium)', () => {
            const ctx: RenderContext = { data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' }, effort: { level: 'medium' }, output_style: { name: 'concise' } } };
            expect(strip(render({ ...opts, pill: 'true' }, ctx) ?? '')).toBe('\ue0b6 Sonnet\u2022concise \ue0b4');
        });

        it('colours the style like the rest of the pill text and keeps widths consistent', () => {
            const out = render({ ...opts, pill: 'true' }, withStyle('concise')) ?? '';
            expect(out).toContain('\x1b[38;2;255;255;255mconcise\x1b[39m');
            expect(getVisibleWidth(out)).toBe(getVisibleWidth(strip(out)));
        });
    });

    describe('pill', () => {
        const pill = { pill: 'true', shortName: 'true' };

        it('draws rounded caps around orange-backed white text with a dot separator', () => {
            const out = render(pill, context('high')) ?? '';
            expect(strip(out)).toBe('\ue0b6 Sonnet\u2022high \ue0b4');
            expect(out.startsWith('\x1b[38;2;217;119;87m\ue0b6\x1b[39m\x1b[48;2;217;119;87m')).toBe(true);
            expect(out).toContain('\x1b[38;2;255;255;255mSonnet\x1b[39m');
            expect(out.endsWith('\x1b[49m\x1b[38;2;217;119;87m\ue0b4\x1b[39m')).toBe(true);
        });

        it('leaves out the effort and its dot when unset or medium', () => {
            expect(strip(render(pill, context()) ?? '')).toBe('\ue0b6 Sonnet \ue0b4');
        });

        it('takes custom colours, separator and padding, and reports a correct width', () => {
            const out = render({ ...pill, fillColor: '#112233', textColor: '#ffeedd', separator: '/', padding: '0' }, context('low')) ?? '';
            expect(strip(out)).toBe('\ue0b6Sonnet/low\ue0b4');
            expect(out).toContain('\x1b[48;2;17;34;51m');
            expect(getVisibleWidth(out)).toBe(getVisibleWidth(strip(out)));
        });

        it('falls back to plain parentheses without colour support', () => {
            chalk.level = 0;
            expect(render(pill, context('high'))).toBe('( Sonnet\u2022high )');
        });
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
