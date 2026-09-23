import { describe, expect, test } from 'vitest';
import { googleMapsSearchUrl } from '../../lib/google-maps-url';

describe('googleMapsSearchUrl', () => {
  test('opens the exact source coordinates when they are available', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'HR Car Wash, Rua das Flores, Campinas', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=-22.901%2C-47.061');
  });

  test('uses coordinates instead of a text search when a trade name is missing', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado', category: 'Oficina mecânica', address: 'Rua das Flores, Campinas', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=-22.901%2C-47.061');
  });

  test('uses the verified business name and address only if coordinates are unavailable', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'Rua das Flores, Campinas' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Rua%20das%20Flores%2C%20Campinas');
  });

  test('does not create an empty Google Maps link when there is no address or coordinate', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado' })).toBeNull();
  });
});
