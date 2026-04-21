import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class ModelWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays the Claude model name (e.g., Claude 3.5 Sonnet)'; }
    getDisplayName(): string { return 'Model'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const shortName = item.metadata?.shortName === 'true';

        if (context.isPreview) {
            const preview = shortName ? 'Opus' : 'Claude';
            return item.rawValue ? preview : `Model: ${preview}`;
        }

        const model = context.data?.model;
        const fullName = typeof model === 'string'
            ? model
            : (model?.display_name ?? model?.id);

        if (!fullName) {
            return null;
        }

        const displayName = shortName ? (fullName.split(/\s+/)[0] ?? fullName) : fullName;
        return item.rawValue ? displayName : `Model: ${displayName}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}