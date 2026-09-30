import { describe, expect, test } from 'vitest';
import { googleMapsSearchUrl } from '../../lib/google-maps-url';

describe('googleMapsSearchUrl', () => {
  test('searches the known business and address before falling back to coordinates', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'HR Car Wash, Rua das Flores, Campinas', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Rua%20das%20Flores%2C%20Campinas%2C%20Brasil');
  });

  test('searches the exact address when the trade name is missing', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado', category: 'Oficina mecânica', address: 'Rua das Flores, Campinas', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20Campinas%2C%20Brasil');
  });

  test('uses the verified business name and address when coordinates are unavailable', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'Rua das Flores, Campinas' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Rua%20das%20Flores%2C%20Campinas%2C%20Brasil');
  });

  test('falls back to text search when the coordinates are incomplete', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'Rua das Flores, Campinas', latitude: -22.901 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Rua%20das%20Flores%2C%20Campinas%2C%20Brasil');
  });

  test('uses coordinates only when no business address is available', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=-22.901%2C-47.061');
  });

  test('does not create an empty Google Maps link when there is no address or coordinate', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado' })).toBeNull();
  });
});
