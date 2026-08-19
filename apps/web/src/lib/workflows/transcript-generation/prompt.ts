export const TRANSCRIPT_GENERATION_PROMPT_VERSION = 'v1';

/**
 * Prompt for transcribing a caption-less video from its platform URL
 * (sent alongside as a file part). Spike-verified shape: the model
 * returns sentence-level segments with second-precision timestamps
 * covering the full video. `parseGeneratedTranscript` tolerates the
 * known drift modes (fences, prose, truncation), so the prompt
 * optimizes for quality rather than defensive formatting rules.
 */
export function buildTranscriptGenerationPrompt(): string {
  return `Transcribe the speech in this video verbatim, in its original language.

Output ONLY a JSON array of segments, no markdown fences, no commentary.
Each segment: {"start": "MM:SS", "end": "MM:SS", "text": "..."}
Rules:
- Cover the ENTIRE video from 00:00 to the end. Do not summarize, skip, or abridge.
- Each segment should be one sentence or natural phrase (roughly 5-15 seconds).
- Timestamps must reflect when the words are actually spoken. Use "H:MM:SS" past the one-hour mark.
- Use proper punctuation in the transcribed text.`;
}
