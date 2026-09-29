import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

// The model name as the Model widget shows it: no "(1M context)" suffix, first word only with shortName
export function resolveModelName(item: WidgetItem, context: RenderContext): string | null {
    const model = context.data?.model;
    const modelDisplayName = typeof model === 'string'
        ? model
        : (model?.display_name ?? model?.id);

    if (!modelDisplayName) {
        return null;
    }
    const stripped = modelDisplayName.replace(/\s*\(.*\)$/, '');
    return item.metadata?.shortName === 'true' ? (stripped.split(/\s+/)[0] ?? stripped) : stripped;
}

export class ModelWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays the Claude model name (e.g., Claude 3.5 Sonnet)'; }
    getDisplayName(): string { return 'Model'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const firstWordOnly = item.metadata?.shortName === 'true';

        if (context.isPreview) {
            const preview = firstWordOnly ? 'Opus' : 'Claude';
            return item.rawValue ? preview : `Model: ${preview}`;
        }

        const name = resolveModelName(item, context);
        if (name) {
            return item.rawValue ? name : `Model: ${name}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
