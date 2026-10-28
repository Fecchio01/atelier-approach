import { describe, expect, test, vi } from 'vitest';

import { analyzeLeadWithGeminiWhenAllowed, generateGeminiReview, isGeminiFreeTierConfigured } from '../../lib/agents/gemini';

const input = {
  id: 'lead-1', version: 2, name: 'Oficina Exemplo', stage: 'PROPOSAL', phone: '+5511999999999',
  whatsapp: 'https://wa.me/5511888888888', website: 'https://example.com', instagram: 'https://instagram.com/exemplo',
  address: 'Rua confidencial, 123', category: 'oficina mecânica'
};

describe('Gemini review adapter', () => {
  test('only enables Gemini when the feature, key, and free project tier are explicit', () => {
    expect(isGeminiFreeTierConfigured({
      GEMINI_ASSISTANT_ENABLED: 'true', GEMINI_PROJECT_TIER: 'free', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    })).toBe(true);
    expect(isGeminiFreeTierConfigured({
      GEMINI_ASSISTANT_ENABLED: 'true', GEMINI_PROJECT_TIER: 'paid', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    })).toBe(false);
    expect(isGeminiFreeTierConfigured({
      GEMINI_ASSISTANT_ENABLED: 'true', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    })).toBe(false);
    expect(isGeminiFreeTierConfigured({
      GEMINI_PROJECT_TIER: 'free', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    })).toBe(false);
  });

  test('does not call Gemini or transmit lead data while free tier is not confirmed', async () => {
    const generate = vi.fn();
    await expect(generateGeminiReview(input, {}, generate)).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  test('sends only minimal business context and validates the structured recommendation', async () => {
    const generate = vi.fn(async (request: { prompt: string }) => {
      expect(request.prompt).toContain('Oficina Exemplo');
      expect(request.prompt).toContain('PROPOSAL');
      expect(request.prompt).not.toContain('+5511999999999');
      expect(request.prompt).not.toContain('5511888888888');
      expect(request.prompt).not.toContain('Rua confidencial');
      expect(request.prompt).not.toContain('https://example.com');
      return { output: {
        summary: 'A proposta registrada pede uma revisão humana de retorno.',
        title: 'Revisar retorno da proposta',
        description: 'Confira o histórico e defina o próximo contato manualmente.',
        priority: 'HIGH'
      }, inputTokens: 120, outputTokens: 40 };
    });

    await expect(generateGeminiReview(input, {
      GEMINI_ASSISTANT_ENABLED: 'true', GEMINI_PROJECT_TIER: 'free', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    }, generate)).resolves.toEqual({
      review: {
      summary: 'A proposta registrada pede uma revisão humana de retorno.',
      title: 'Revisar retorno da proposta',
      description: 'Confira o histórico e defina o próximo contato manualmente.',
      priority: 'HIGH'
      },
      inputTokens: 120,
      outputTokens: 40
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('rejects malformed model output instead of persisting it', async () => {
    const generate = vi.fn(async () => ({ output: { summary: 'Inválido', title: '', description: 'x', priority: 'URGENT' } }));
    await expect(generateGeminiReview(input, {
      GEMINI_ASSISTANT_ENABLED: 'true', GEMINI_PROJECT_TIER: 'free', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    }, generate)).rejects.toThrow();
  });

  test('keeps CRM facts local and marks the generated recommendation and usage', async () => {
    const result = await analyzeLeadWithGeminiWhenAllowed(input, new Date('2026-10-27T12:00:00.000Z'), {
      GEMINI_ASSISTANT_ENABLED: 'true', GEMINI_PROJECT_TIER: 'free', GOOGLE_GENERATIVE_AI_API_KEY: 'secret'
    }, async () => ({
      output: {
        summary: 'Revise a proposta e valide com a equipe o melhor próximo passo.',
        title: 'Revisar proposta', description: 'Confira a proposta registrada e decida se vale retomar o contato.', priority: 'HIGH'
      }, inputTokens: 100, outputTokens: 30
    }));

    expect(result.engine).toBe('GEMINI');
    expect(result.model).toBe('gemini-3.1-flash-lite');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30 });
    expect(result.knownFacts).toContain('Há um telefone salvo no cadastro.');
    expect(result.recommendation.taskType).toBe('WHATSAPP');
  });
});
