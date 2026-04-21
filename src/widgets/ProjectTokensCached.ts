import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getProjectCost } from '../utils/project-cost';

function formatTokens(n: number): string {
    if (n >= 1e9) {
        return `${(n / 1e9).toFixed(1)}B`;
    }
    if (n >= 1e6) {
        return `${(n / 1e6).toFixed(1)}M`;
    }
    if (n >= 1e3) {
        return `${(n / 1e3).toFixed(1)}k`;
    }
    return `${n}`;
}

export class ProjectTokensCachedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'All-time cached tokens (read + write) for the current project, scanned from ~/.claude/projects/. Shares the 30s project-cost cache.'; }
    getDisplayName(): string { return 'Project Cached Tokens'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '12.4M' : 'Proj Cached: 12.4M';
        }

        const cwd = context.data?.workspace?.current_dir ?? context.data?.cwd;
        const result = getProjectCost(cwd);
        if (!result) {
            return null;
        }

        const formatted = formatTokens(result.cachedTokens);
        return item.rawValue ? formatted : `Proj Cached: ${formatted}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}