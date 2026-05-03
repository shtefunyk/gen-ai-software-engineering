import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    this.models = { generateContent };
  }),
}));

const { classificationService } = await import('../src/services/classificationService.js');

beforeEach(async () => {
  generateContent.mockReset();
});

const ticket = {
  id: 't1',
  subject: 'cannot login',
  description: 'two days no access to my account',
  metadata: { source: 'web_form' },
};

describe('classificationService.classify (mocked Gemini)', () => {
  it('returns parsed result on valid LLM JSON', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        category: 'account_access',
        priority: 'urgent',
        confidence: 0.92,
        reasoning: 'mentions cannot login',
        keywords: ['cannot login'],
      }),
    });
    const out = await classificationService.classify(ticket);
    expect(out.category).toBe('account_access');
    expect(out.confidence).toBe(0.92);
  });

  it('throws ClassificationInvalidResponse on broken JSON', async () => {
    generateContent.mockResolvedValue({ text: 'not json' });
    await expect(classificationService.classify(ticket)).rejects.toThrow(/Classification response invalid/);
  });

  it('throws ClassificationInvalidResponse on schema mismatch', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ category: 'xx', priority: 'urgent', confidence: 1, reasoning: '', keywords: [] }),
    });
    await expect(classificationService.classify(ticket)).rejects.toThrow(/Classification response invalid/);
  });

  it('throws ClassificationProviderFailed on SDK error', async () => {
    generateContent.mockImplementation(async () => { throw new Error('502 from gemini'); });
    await expect(classificationService.classify(ticket)).rejects.toThrow(/Classification provider failed/);
  });

  it('throws when confidence is out of [0,1]', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        category: 'other',
        priority: 'low',
        confidence: 1.5,
        reasoning: 'r',
        keywords: [],
      }),
    });
    await expect(classificationService.classify(ticket)).rejects.toThrow(/Classification response invalid/);
  });
});
