// src/utils/powerline-theme-index.ts
function countPowerlineThemeSlots(entries) {
  let previousVisibleWidget = null;
  let slotCount = 0;
  for (const entry of entries) {
    if (entry.widget.type === "separator" || entry.widget.type === "flex-separator") {
      previousVisibleWidget = null;
      continue;
    }
    if (!entry.content) {
      continue;
    }
    if (!previousVisibleWidget?.merge) {
      slotCount++;
    }
    previousVisibleWidget = entry.widget;
  }
  return slotCount;
}
function advanceGlobalPowerlineThemeIndex(currentIndex, entries) {
  return currentIndex + countPowerlineThemeSlots(entries);
}

// src/utils/separator-index.ts
function hasRenderedContent(widgetIndex, preRenderedWidgets) {
  return preRenderedWidgets ? Boolean(preRenderedWidgets[widgetIndex]?.content) : true;
}
function countSeparatorSlots(widgets, preRenderedWidgets) {
  let count = 0;
  let hasPreviousRenderableWidget = false;
  let previousRenderableWidgetMergesWithNext = false;
  for (let i = 0;i < widgets.length; i++) {
    const widget = widgets[i];
    if (!widget) {
      continue;
    }
    if (widget.type === "separator") {
      if (hasPreviousRenderableWidget) {
        previousRenderableWidgetMergesWithNext = false;
      }
      continue;
    }
    if (widget.type === "flex-separator") {
      hasPreviousRenderableWidget = false;
      previousRenderableWidgetMergesWithNext = false;
      continue;
    }
    if (!hasRenderedContent(i, preRenderedWidgets)) {
      continue;
    }
    if (hasPreviousRenderableWidget && !previousRenderableWidgetMergesWithNext) {
      count++;
    }
    hasPreviousRenderableWidget = true;
    previousRenderableWidgetMergesWithNext = Boolean(widget.merge);
  }
  return count;
}
function advanceGlobalSeparatorIndex(currentIndex, widgets, preRenderedWidgets) {
  return currentIndex + countSeparatorSlots(widgets, preRenderedWidgets);
}

export { advanceGlobalPowerlineThemeIndex, advanceGlobalSeparatorIndex };
