import type {
  AIContext,
  BriefDraft,
  SuggestionDraft,
} from "@/lib/ai/types";

export interface AIEngine {
  name: string;
  generateMorning(ctx: AIContext): Promise<BriefDraft>;
  generateEvening(ctx: AIContext): Promise<BriefDraft>;
  generateSuggestions(ctx: AIContext): Promise<SuggestionDraft[]>;
}
