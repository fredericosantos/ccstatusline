import { z } from 'zod';

export const BAR_STYLES = ['dots', 'pill', 'line', 'blocks'] as const;
export const BarStyleSchema = z.enum(BAR_STYLES);
export type BarStyle = z.infer<typeof BarStyleSchema>;
