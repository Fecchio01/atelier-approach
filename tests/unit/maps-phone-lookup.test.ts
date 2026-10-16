import { describe, expect, it } from 'vitest';
import { matchMapsPhoneCandidate, normalizeMapsPhoneText, type MapsPhoneCandidate, type MapsPhoneLookupInput } from '../../lib/maps-phone-lookup';

const input: MapsPhoneLookupInput = {
  name: 'Auto Peças São José Ltda.',
  address: 'Rua das Flores, 100',
  city: 'São Paulo',
  region: 'SP'
};

function candidate(overrides: Partial<MapsPhoneCandidate> = {}): MapsPhoneCandidate {
  return {
    name: 'AUTO PECAS SAO JOSE',
    phone: '+55 11 3333-4444',
    address: 'R. das Flores nº 100',
    city: 'São Paulo',
    region: 'São Paulo',
    ...overrides
  };
}

describe('matchMapsPhoneCandidate', () => {
  it('removes known legal suffixes such as S.A. while keeping ordinary business words', () => {
    expect(normalizeMapsPhoneText('Oficina São José S.A.')).toBe('oficina sao jose');
    expect(normalizeMapsPhoneText('Oficina São José Comércio')).toBe('oficina sao jose comercio');
  });

  it('matches normalized name, city, UF, and compatible address', () => {
    expect(matchMapsPhoneCandidate(input, [candidate()])).toEqual({ status: 'matched', candidate: candidate() });
  });

  it('rejects a candidate from another city', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ city: 'Campinas' })])).toEqual({ status: 'none' });
  });

  it('rejects a candidate from another UF', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ region: 'RJ' })])).toEqual({ status: 'none' });
  });

  it('rejects incompatible non-empty addresses', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ address: 'Avenida Central, 900' })])).toEqual({ status: 'none' });
  });

  it('rejects matching street names with conflicting explicit house numbers', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ address: 'Rua das Flores, 900' })])).toEqual({ status: 'none' });
    expect(matchMapsPhoneCandidate(input, [candidate({ address: 'Rua das Flores 900' })])).toEqual({ status: 'none' });
  });

  it('does not require address similarity when either address is absent', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ address: null })])).toEqual({ status: 'matched', candidate: candidate({ address: null }) });
    expect(matchMapsPhoneCandidate({ ...input, address: null }, [candidate({ address: 'Avenida Central, 900' })])).toEqual({
      status: 'matched',
      candidate: candidate({ address: 'Avenida Central, 900' })
    });
  });

  it('does not match similar names below the strong-match threshold', () => {
    expect(matchMapsPhoneCandidate(input, [candidate({ name: 'Auto Serviços São José' })])).toEqual({ status: 'none' });
  });

  it('returns ambiguous when two candidates pass all constraints', () => {
    expect(matchMapsPhoneCandidate(input, [candidate(), candidate({ phone: '+55 11 99999-0000' })])).toEqual({ status: 'ambiguous' });
  });

  it('returns none when there are no candidates', () => {
    expect(matchMapsPhoneCandidate(input, [])).toEqual({ status: 'none' });
  });
});
