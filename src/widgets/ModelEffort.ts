import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { resolveModelName } from './Model';
import { getEffortLabel } from './ThinkingEffort';
import { dimText } from './shared/progress-bar';

// Model and thinking effort as one unit: (Sonnet|high). The delimiters and separator are dimmed with the bar
// track colour; the text takes the widget colour. Effort is hidden when unset or medium, leaving (Sonnet).
export class ModelEffortWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string {
        return 'Model name and thinking effort in one unit, e.g. (Sonnet|high).\n'
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
