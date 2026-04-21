import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getProjectCost } from '../utils/project-cost';

function formatCost(cost: number): string {
    if (cost >= 1000) {
        return `$${(cost / 1000).toFixed(1)}k`;
    }
    if (cost >= 100) {
        return `$${cost.toFixed(0)}`;
    }
    if (cost >= 10) {
        return `$${cost.toFixed(1)}`;
    }
    return `$${cost.toFixed(2)}`;
}

export class ProjectCostWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'All-time total cost (USD) for the current project, scanned from ~/.claude/projects/. Cached 30s.'; }
    getDisplayName(): string { return 'Project Cost'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '$42.17' : 'Project: $42.17';
        }

        const cwd = context.data?.workspace?.current_dir ?? context.data?.cwd;
        const result = getProjectCost(cwd);
        if (!result) {
            return null;
        }

        const formatted = formatCost(result.cost);
        return item.rawValue ? formatted : `Project: ${formatted}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}