import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { ContextBarWidget } from '../ContextBar';
import { ContextLengthWidget } from '../ContextLength';
import { ContextWindowWidget } from '../ContextWindow';
import { withFluidCells } from '../shared/progress-bar';

describe('ContextBarWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(usage, 'makeUsageProgressBar').mockImplementation((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders from context_window data when available', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:15.0:16] 30k/200k (15%)');
    });

    it('falls back to token metrics and model context size', () => {
        const context: RenderContext = {
            data: { model: { id: 'claude-3-5-sonnet-20241022' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:25.0:16] 50k/200k (25%)');
    });

    it('uses 1M context label model IDs in fallback mode', () => {
        const context: RenderContext = {
            data: { model: { id: 'Opus 4.6 (1M context)' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:5.0:16] 50k/1.0M (5%)');
    });

    it('uses 1M in parentheses model IDs in fallback mode', () => {
        const context: RenderContext = {
            data: { model: { id: 'Opus 4.6 (1M)' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:5.0:16] 50k/1.0M (5%)');
    });

    it('clamps usage percentage to 100 when context length exceeds total', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 250000,
                        output_tokens: 50000,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:100.0:16] 250k/200k (100%)');
    });

    it('supports raw mode without context label', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 5000,
                        output_tokens: 5000,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('[bar:2.5:16] 5k/200k (3%)');
    });

    it('renders long progress bar mode when configured', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({
            id: 'ctx',
            type: 'context-bar',
            metadata: { display: 'progress' }
        }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:15.0:32] 30k/200k (15%)');
    });

    it('cycles display modes in the expected order', () => {
        const widget = new ContextBarWidget();
        const modes: (string | undefined)[] = [];
        let item: WidgetItem = { id: 'ctx', type: 'context-bar' };
        for (let n = 0; n < 5; n++) {
            item = widget.handleEditorAction('toggle-progress', item) ?? item;
            modes.push(item.metadata?.display);
        }

        expect(modes).toEqual(['progress', 'progress-xs', 'slider', 'slider-only', 'progress-short']);
    });

    describe('progress-xs mode', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const xs = (metadata: Record<string, string> = {}): WidgetItem => ({
            id: 'ctx',
            type: 'context-bar',
            metadata: { display: 'progress-xs', ...metadata }
        });

        it('renders only a 5-wide bar by default', () => {
            expect(new ContextBarWidget().render(xs(), context, DEFAULT_SETTINGS)).toBe('Context: █░░░░');
        });

        it('adds percent and usage when their flags are set', () => {
            const widget = new ContextBarWidget();

            expect(widget.render(xs({ showPercent: 'true' }), context, DEFAULT_SETTINGS)).toBe('Context: █░░░░ 15%');
            expect(widget.render(xs({ showPercent: 'true', showUsage: 'true' }), context, DEFAULT_SETTINGS)).toBe('Context: █░░░░ 15% 30k/200k');
            expect(widget.render({ ...xs({ showPercent: 'true' }), rawValue: true }, context, DEFAULT_SETTINGS)).toBe('█░░░░ 15%');
        });

        it('toggles the percent and usage flags', () => {
            const widget = new ContextBarWidget();
            const on = widget.handleEditorAction('toggle-percent', xs());
            const usage = widget.handleEditorAction('toggle-usage', xs());

            expect(on?.metadata?.showPercent).toBe('true');
            expect(usage?.metadata?.showUsage).toBe('true');
            expect(widget.getCustomKeybinds(xs()).map(k => k.action)).toEqual(['toggle-progress', 'cycle-bar-style', 'toggle-percent', 'toggle-usage']);
        });
    });

    describe('percent text escalation', () => {
        const context: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: { input_tokens: 170000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } } };
        const settings = { ...DEFAULT_SETTINGS, progressTextEscalation: [{ at: 60, color: '#E5B454' }, { at: 80, color: '#D97757' }] };
        let level: typeof chalk.level;
        beforeEach(() => {
            level = chalk.level;
            chalk.level = 3;
        });
        afterEach(() => {
            chalk.level = level;
        });

        it('colours only the percent of the xs bar and follows the used share', () => {
            const item: WidgetItem = { id: 'ctx', type: 'context-bar', rawValue: true, metadata: { display: 'progress-xs', showPercent: 'true' } };
            const out = new ContextBarWidget().render(item, context, settings) ?? '';
            expect(out.endsWith('\x1b[38;2;217;119;87m85%\x1b[39m')).toBe(true);
            expect(new ContextBarWidget().render(item, context, DEFAULT_SETTINGS)?.includes('85%')).toBe(true);
            expect(new ContextBarWidget().render(item, context, DEFAULT_SETTINGS)).not.toContain('\x1b[38;2;217;119;87m85%');
        });

        it('colours the percent in the long modes too', () => {
            const item: WidgetItem = { id: 'ctx', type: 'context-bar', rawValue: true, metadata: { display: 'progress' } };
            expect(new ContextBarWidget().render(item, context, settings)).toContain('(\x1b[38;2;217;119;87m85%\x1b[39m)');
        });
    });

    describe('fluid mode', () => {
        const usage = { input_tokens: 20000, output_tokens: 10000, cache_creation_input_tokens: 5000, cache_read_input_tokens: 5000 };
        const context: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: usage } } };
        const fluid = (cells: number, metadata: Record<string, string> = {}): WidgetItem => withFluidCells({
            id: 'ctx',
            type: 'context-bar',
            metadata: { display: 'fluid', ...metadata }
        }, cells);

        it('renders the number of cells the renderer stamped, without brackets', () => {
            expect(new ContextBarWidget().render(fluid(7), context, DEFAULT_SETTINGS)).toBe('Context: █░░░░░░');
            expect(new ContextBarWidget().render(fluid(3, { showPercent: 'true' }), context, DEFAULT_SETTINGS)).toBe('Context: ░░░ 15%');
        });

        it('collapses to the percent, or to nothing, at zero cells', () => {
            const widget = new ContextBarWidget();
            expect(widget.render(fluid(0, { showPercent: 'true' }), context, DEFAULT_SETTINGS)).toBe('Context: 15%');
            expect(widget.render(fluid(0), context, DEFAULT_SETTINGS)).toBe('');
        });

        it('offers the same toggles as progress-xs', () => {
            expect(new ContextBarWidget().getCustomKeybinds(fluid(5)).map(k => k.action)).toEqual(['toggle-progress', 'cycle-bar-style', 'toggle-percent', 'toggle-usage']);
        });
    });

    it('formats context preview samples with the selected styles', () => {
        const context: RenderContext = { isPreview: true };

        expect(new ContextLengthWidget().render({
            id: 'length',
            type: 'context-length',
            numberFormat: { style: 'whole' }
        }, context, DEFAULT_SETTINGS)).toBe('Ctx: 19k');
        expect(new ContextWindowWidget().render({
            id: 'window',
            type: 'context-window',
            numberFormat: { decimals: 2 }
        }, context, DEFAULT_SETTINGS)).toBe('Win: 200.00k');
        expect(new ContextBarWidget().render({
            id: 'bar',
            type: 'context-bar',
            numberFormat: { decimals: 2 }
        }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:25.0:16] 50.00k/200.00k (25.00%)');
    });
});
