import { describe, expect, test } from 'vitest';
import { googleMapsSearchUrl } from '../../lib/google-maps-url';

describe('googleMapsSearchUrl', () => {
  test('searches by business name and locality without sending the full street address', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'HR Car Wash, Rua das Flores, Campinas, SP, Brasil', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Campinas%2C%20SP');
  });

  test('searches the exact address when the trade name is missing', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado', category: 'Oficina mecânica', address: 'Rua das Flores, Campinas', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20Campinas%2C%20Brasil');
  });

  test('uses the business name and locality when coordinates are unavailable', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'Rua das Flores, Campinas' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Campinas');
  });

  test('falls back to text search when the coordinates are incomplete', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', address: 'Rua das Flores, Campinas', latitude: -22.901 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash%2C%20Campinas');
  });

  test('uses only the business identity when locality is unavailable', () => {
    expect(googleMapsSearchUrl({ name: 'HR Car Wash', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=HR%20Car%20Wash');
  });

  test('extracts a city before a full Brazilian state name', () => {
    expect(googleMapsSearchUrl({ name: 'Clínica Central', address: 'Rua A, São José dos Campos, São Paulo, Brasil' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Cl%C3%ADnica%20Central%2C%20S%C3%A3o%20Jos%C3%A9%20dos%20Campos%2C%20S%C3%A3o%20Paulo');
  });

  test('uses a coordinate pin only when neither a name nor address exists', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado', latitude: -22.901, longitude: -47.061 }))
      .toBe('https://www.google.com/maps/search/?api=1&query=-22.901%2C-47.061');
  });

  test('does not create an empty Google Maps link when there is no address or coordinate', () => {
    expect(googleMapsSearchUrl({ name: 'Nome comercial não informado' })).toBeNull();
  });
});
