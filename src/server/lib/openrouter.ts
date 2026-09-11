import { z } from 'zod'

import { wordTranscriptSchema } from '../../shared/contracts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const TRANSCRIPTION_MODEL = 'microsoft/mai-transcribe-2'

const gamePhraseSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z][a-z ' -]*$/i)

const generatedWordSchema = z.object({
  word: gamePhraseSchema,
  acceptedAnswers: z.array(gamePhraseSchema).min(1).max(8),
  forbiddenWords: z.array(gamePhraseSchema).min(1).max(12),
})

const coachingSchema = z.object({
  score: z.number().int().min(0).max(100),
  feedback: z.string().trim().min(1).max(500),
})

const transcriptionSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  words: z.array(wordTranscriptSchema).optional().default([]),
})

const providerErrorSchema = z.object({
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
    })
    .optional(),
})

const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string() }),
    }),
  ),
})

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_configured' | 'request_failed' | 'invalid_response',
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

type OpenRouterConfiguration = {
  apiKey: string | undefined
  siteUrl?: string
  textModel: string | undefined
}

export async function generateGameWord(configuration: OpenRouterConfiguration, topic: string) {
  const response = await createStructuredCompletion(configuration, {
    name: 'explain_word',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['word', 'acceptedAnswers', 'forbiddenWords'],
      properties: {
        word: { type: 'string' },
        acceptedAnswers: { type: 'array', items: { type: 'string' } },
        forbiddenWords: { type: 'array', items: { type: 'string' } },
      },
    },
    system:
      'Create a fair English vocabulary game card for CEFR B1-B2 learners. Return only the requested JSON. Choose a common concrete word or short phrase. Accepted answers are equivalent spellings or singular/plural forms. Forbidden words contain only the answer and direct grammatical forms of it; do not ban useful clues.',
    user: `Topic: ${topic}`,
  })
  const parsed = generatedWordSchema.safeParse(response)
  if (!parsed.success)
    throw new OpenRouterError('The word model returned invalid data.', 'invalid_response')

  const word = parsed.data.word.toLowerCase()
  return {
    word,
    acceptedAnswers: uniquePhrases([word, ...parsed.data.acceptedAnswers]).slice(0, 8),
    forbiddenWords: uniquePhrases([word, ...parsed.data.forbiddenWords]).slice(0, 12),
  }
}

export async function transcribeExplanation(
  configuration: OpenRouterConfiguration,
  audioData: string,
  format: string,
) {
  if (!configuration.apiKey) {
    throw new OpenRouterError('OpenRouter is not configured.', 'not_configured')
  }

  const response = await fetch(`${OPENROUTER_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: openRouterHeaders(configuration),
    body: JSON.stringify({
      model: TRANSCRIPTION_MODEL,
      input_audio: { data: audioData, format },
      language: 'en',
      temperature: 0,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      provider: {
        options: {
          azure: {
            enhancedMode: { modelOptions: { transcribeStyle: 'verbatim' } },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const providerError = providerErrorSchema.safeParse(await response.json().catch(() => null))
    console.error('OpenRouter transcription failed', {
      status: response.status,
      code: providerError.success ? providerError.data.error?.code : undefined,
      message: providerError.success ? providerError.data.error?.message?.slice(0, 200) : undefined,
    })
    throw new OpenRouterError('The explanation could not be transcribed.', 'request_failed')
  }
  const parsed = transcriptionSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    throw new OpenRouterError('The transcription response was invalid.', 'invalid_response')
  }
  return parsed.data
}

export async function coachExplanation(
  configuration: OpenRouterConfiguration,
  input: { secretWord: string; transcript: string },
) {
  const response = await createStructuredCompletion(configuration, {
    name: 'explanation_coaching',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'feedback'],
      properties: {
        score: { type: 'integer', minimum: 0, maximum: 100 },
        feedback: { type: 'string' },
      },
    },
    system:
      'You coach an English learner playing an explain-the-word game. Score how clearly the transcript describes the target without relying on whether a friend guessed it. Give one short, supportive, specific suggestion. Do not reveal hidden reasoning. Return only the requested JSON.',
    user: `Target: ${input.secretWord}\nTranscript: ${input.transcript}`,
  })
  const parsed = coachingSchema.safeParse(response)
  if (!parsed.success)
    throw new OpenRouterError('The coaching model returned invalid data.', 'invalid_response')
  return parsed.data
}

async function createStructuredCompletion(
  configuration: OpenRouterConfiguration,
  input: {
    name: string
    schema: Record<string, unknown>
    system: string
    user: string
  },
) {
  if (!configuration.apiKey || !configuration.textModel) {
    throw new OpenRouterError('OpenRouter is not configured.', 'not_configured')
  }
  const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(configuration),
    body: JSON.stringify({
      model: configuration.textModel,
      temperature: 0.4,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: input.name, strict: true, schema: input.schema },
      },
    }),
  })

  if (!response.ok) {
    console.error('OpenRouter text request failed', { status: response.status })
    throw new OpenRouterError('The word coach is temporarily unavailable.', 'request_failed')
  }
  const parsed = chatCompletionSchema.safeParse(await response.json().catch(() => null))
  const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined
  if (!content)
    throw new OpenRouterError('The text model response was invalid.', 'invalid_response')
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw new OpenRouterError('The text model returned invalid JSON.', 'invalid_response')
  }
}

function openRouterHeaders(configuration: OpenRouterConfiguration) {
  return {
    Authorization: `Bearer ${configuration.apiKey}`,
    'Content-Type': 'application/json',
    ...(configuration.siteUrl ? { 'HTTP-Referer': configuration.siteUrl } : {}),
    'X-OpenRouter-Title': 'Meeting Place',
  }
}

function uniquePhrases(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))]
}
