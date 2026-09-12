import { describe, expect, test } from 'vitest';

import { scoreBusiness } from '../../lib/lead-score';

const baseBusiness = {
  osmId: 'node/123',
  name: 'Atelier Exemplo',
  phone: '(19) 99999-9999',
  website: 'https://atelier.example',
  instagram: '@atelierexemplo'
};

describe('scoreBusiness', () => {
  test('prioritizes a business with no registered phone or digital presence', () => {
    expect(scoreBusiness({ ...baseBusiness, phone: null, website: null, instagram: null })).toEqual({
      score: 70,
      reasons: expect.arrayContaining(['Sem telefone cadastrado', 'Sem presença digital cadastrada'])
    });
  });
});
