import { describe, expect, it } from 'vitest';
import { leavingTo } from './leave-guard';

const HERE = 'https://edurank.test/profile/edit';
const plain = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const link = (href: string, extra: { target?: string; download?: boolean } = {}) => ({
  href: new URL(href, HERE).href,
  target: extra.target ?? '',
  download: extra.download ?? false,
});

describe('leavingTo — which clicks leave the page with unsaved work', () => {
  it('catches an in-app link: the sidebar, a breadcrumb, «Скасувати»', () => {
    expect(leavingTo(plain, link('/profile'), HERE)).toBe('/profile');
    expect(leavingTo(plain, link('/staff?tab=npp#top'), HERE)).toBe('/staff?tab=npp#top');
  });

  it('lets a link that opens somewhere else through — this page stays open', () => {
    expect(leavingTo(plain, link('/profile', { target: '_blank' }), HERE)).toBeNull();
    expect(leavingTo({ ...plain, ctrlKey: true }, link('/profile'), HERE)).toBeNull();
    expect(leavingTo({ ...plain, metaKey: true }, link('/profile'), HERE)).toBeNull();
    expect(leavingTo({ ...plain, shiftKey: true }, link('/profile'), HERE)).toBeNull();
    expect(leavingTo({ ...plain, button: 1 }, link('/profile'), HERE)).toBeNull();
  });

  it('lets a download and a jump within the page through', () => {
    expect(leavingTo(plain, link('/api/export/ratings', { download: true }), HERE)).toBeNull();
    expect(leavingTo(plain, link('/profile/edit#education'), HERE)).toBeNull();
  });

  it('leaves another site to the browser’s own question', () => {
    expect(leavingTo(plain, link('https://orcid.org/0000-0001'), HERE)).toBeNull();
  });

  it('leaves a click somebody already handled alone', () => {
    expect(leavingTo({ ...plain, defaultPrevented: true }, link('/profile'), HERE)).toBeNull();
  });
});
