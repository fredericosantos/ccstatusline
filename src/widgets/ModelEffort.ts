import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { resolveModelName } from './Model';
import { getEffortLabel } from './ThinkingEffort';
import {
    blendHex,
    colorText,
    dimText,
    filledPill,
    resolveBarColor
} from './shared/progress-bar';

const PILL_FILL = '#D97757';
const PILL_TEXT = '#FFFFFF';

// Model and thinking effort as one unit: (Sonnet|high), or with pill = true a filled capsule. The delimiters and separator are dimmed with the bar
// track colour; the text takes the widget colour. Effort is hidden when unset or medium, leaving (Sonnet).
export class ModelEffortWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string {
        return 'Model name and thinking effort in one unit, e.g. (Sonnet|high), or with pill = true a filled capsule.\n'
            + 'pill = true draws a filled capsule (fillColor default Claude orange, textColor default white, separator default \u2022, padding 1).\n'
            + 'Metadata: open / close (default "(" ")"), separator (default "|"), caps = rounded for Powerline caps, showMedium = true to show medium effort, shortName = true for the first word only.';
    }

    getDisplayName(): string { return 'Model + Effort'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const meta = item.metadata;
        const name = context.isPreview ? 'Sonnet' : resolveModelName(item, context);
        if (!name) {
            return null;
        }
        const effort = context.isPreview ? 'high' : getEffortLabel(context, meta?.showMedium === 'true');
        if (meta?.pill === 'true') {
            const fill = resolveBarColor(meta.fillColor, PILL_FILL);
            const text = resolveBarColor(meta.textColor, PILL_TEXT);
            const pad = ' '.repeat(Math.max(0, Math.min(3, Number.parseInt(meta.padding ?? '1', 10) || 0)));
            const sep = blendHex(text, fill, 0.35);
            const dot = meta.separator ?? '\u2022';
            const inner = colorText(name, text) + (effort ? colorText(dot, sep) + colorText(effort, text) : '');
            return filledPill(`${pad}${inner}${pad}`, fill, text);
        }
        const rounded = meta?.caps === 'rounded';
        const dim = (text: string): string => dimText(item, settings, text);

        return dim(rounded ? '' : meta?.open ?? '(')
            + name
            + (effort ? dim(meta?.separator ?? '|') + effort : '')
            + dim(rounded ? '' : meta?.close ?? ')');
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(): boolean { return true; }
}
