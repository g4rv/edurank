import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  AVATAR_PICK_MAX_BYTES,
  avatarKeyFor,
  avatarPickProblem,
  avatarProblem,
  avatarSrc,
  canSetOwnAvatar,
  isAvatarKeyOf,
} from './avatar';

describe('avatarProblem', () => {
  it('accepts a JPEG and a PNG within the size limit', () => {
    expect(avatarProblem({ declaredType: 'image/jpeg', sizeBytes: 300_000 })).toBeNull();
    expect(avatarProblem({ declaredType: 'image/png', sizeBytes: AVATAR_MAX_BYTES })).toBeNull();
  });

  it('refuses a PDF, which is an evidence type but never a face', () => {
    expect(avatarProblem({ declaredType: 'application/pdf', sizeBytes: 1000 })).toMatch(
      /JPG і PNG/
    );
  });

  it('refuses an empty file and one over the limit', () => {
    expect(avatarProblem({ declaredType: 'image/png', sizeBytes: 0 })).toBe('Файл порожній');
    expect(avatarProblem({ declaredType: 'image/png', sizeBytes: AVATAR_MAX_BYTES + 1 })).toMatch(
      /не більше 2 МБ/
    );
  });
});

describe('avatarPickProblem', () => {
  it('lets a phone photo be picked, because it is cropped small before it is uploaded', () => {
    expect(
      avatarPickProblem({ declaredType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 })
    ).toBeNull();
    expect(
      avatarProblem({ declaredType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 })
    ).not.toBeNull();
  });

  it('still refuses a wrong type, an empty file and an absurd size', () => {
    expect(avatarPickProblem({ declaredType: 'application/pdf', sizeBytes: 1000 })).toMatch(/JPG/);
    expect(avatarPickProblem({ declaredType: 'image/png', sizeBytes: 0 })).toBe('Файл порожній');
    expect(
      avatarPickProblem({ declaredType: 'image/png', sizeBytes: AVATAR_PICK_MAX_BYTES + 1 })
    ).toMatch(/не більше 15 МБ/);
  });
});

describe('avatar keys', () => {
  it('builds a key inside the person own folder, one new key per upload', () => {
    const a = avatarKeyFor('staff1', 'jpg');
    expect(a).toMatch(/^avatars\/staff1\/[0-9a-f-]{36}\.jpg$/);
    expect(avatarKeyFor('staff1', 'jpg')).not.toBe(a);
  });

  it('recognises only a key in the person own folder', () => {
    expect(isAvatarKeyOf('staff1', 'avatars/staff1/abc.png')).toBe(true);
    expect(isAvatarKeyOf('staff1', 'avatars/staff2/abc.png')).toBe(false);
    // A prefix trick: staff10 starts with staff1
    expect(isAvatarKeyOf('staff1', 'avatars/staff10/abc.png')).toBe(false);
    // Climbing out of the folder
    expect(isAvatarKeyOf('staff1', 'avatars/staff1/../staff2/abc.png')).toBe(false);
    expect(isAvatarKeyOf('staff1', 'evidence/t1/abc.png')).toBe(false);
  });
});

describe('avatarSrc', () => {
  it('is null without a photo, so the initials show', () => {
    expect(avatarSrc({ id: 's1', avatarKey: null })).toBeNull();
  });

  it('carries the key uuid as a version, so a new upload is a new URL', () => {
    expect(avatarSrc({ id: 's1', avatarKey: 'avatars/s1/abc-123.jpg' })).toBe(
      '/api/avatar/s1?v=abc-123'
    );
    expect(avatarSrc({ id: 's1', avatarKey: 'avatars/s1/def-456.png' })).not.toBe(
      avatarSrc({ id: 's1', avatarKey: 'avatars/s1/abc-123.jpg' })
    );
  });
});

describe('canSetOwnAvatar', () => {
  it('is ADMIN only for now', () => {
    expect(canSetOwnAvatar('ADMIN')).toBe(true);
    expect(canSetOwnAvatar('EDITOR')).toBe(false);
    expect(canSetOwnAvatar('USER')).toBe(false);
  });
});
