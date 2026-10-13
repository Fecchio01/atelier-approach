import { describe, expect, test } from 'vitest';

import { getProfileAvatarImage, isValidProfileAvatar } from '../../lib/profile-avatar';

describe('isValidProfileAvatar', () => {
  test('accepts a compressed JPEG data URL with a matching file signature', () => {
    expect(isValidProfileAvatar('data:image/jpeg;base64,/9j/AA==')).toBe(true);
  });

  test('rejects image data whose declared format does not match its file signature', () => {
    expect(isValidProfileAvatar('data:image/png;base64,/9j/AA==')).toBe(false);
  });

  test('rejects SVG data URLs instead of persisting active markup as an image', () => {
    expect(isValidProfileAvatar('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  test('rejects compressed image data that exceeds the server-side limit', () => {
    const oversizedJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300 * 1024)]);
    expect(isValidProfileAvatar(`data:image/jpeg;base64,${oversizedJpeg.toString('base64')}`)).toBe(false);
  });

  test('continues to accept previously saved HTTP image URLs', () => {
    expect(isValidProfileAvatar('https://images.example.com/avatar.jpg')).toBe(true);
  });

  test('decodes a persisted image for the authenticated navigation image endpoint', () => {
    const image = getProfileAvatarImage('data:image/jpeg;base64,/9j/AA==');

    expect(image?.contentType).toBe('image/jpeg');
    expect(image?.bytes).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  });

  test('does not proxy external avatar URLs through the authenticated image endpoint', () => {
    expect(getProfileAvatarImage('https://images.example.com/avatar.jpg')).toBeNull();
  });
});
