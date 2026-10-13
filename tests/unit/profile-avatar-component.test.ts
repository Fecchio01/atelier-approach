import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ProfileAvatar } from '../../components/profile-avatar';

describe('ProfileAvatar', () => {
  test('renders the saved photo in the navigation avatar', () => {
    const markup = renderToStaticMarkup(createElement(ProfileAvatar, { name: 'João Fecchio', src: '/api/profile/avatar/123' }));

    expect(markup).toContain('src="/api/profile/avatar/123"');
    expect(markup).toContain('aria-label="João Fecchio: foto de perfil"');
  });

  test('shows initials when no profile photo exists', () => {
    const markup = renderToStaticMarkup(createElement(ProfileAvatar, { name: 'João Fecchio', src: null }));

    expect(markup).toContain('>JF</span>');
    expect(markup).not.toContain('<img');
  });
});
