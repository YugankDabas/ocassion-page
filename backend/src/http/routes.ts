import { Router } from 'express';
import type { Container } from '../container';
import {
  apiRateLimit,
  authenticate,
  csrfProtection,
  csvUpload,
  imageUpload,
  loginRateLimit,
  requireOwnPassword,
  requirePermission as allow,
} from './middleware';

/** Admin API (cookie session + CSRF). Mounted at /api/v1. */
export function adminRouter(c: Container): Router {
  const r = Router();
  const { auth, pages, brands, media, catalog, users } = c.controllers;

  r.use(apiRateLimit);

  // Public auth endpoints
  r.post('/auth/login', loginRateLimit, auth.login);

  // Everything below requires a valid session; mutations also require the CSRF token.
  r.use(authenticate(c.services.auth));
  r.use(csrfProtection);
  // Until a given password is replaced with the user's own, only the account endpoints work.
  r.use(requireOwnPassword);

  r.get('/auth/me', auth.me);
  r.post('/auth/logout', auth.logout);
  r.post('/auth/logout-all', auth.logoutEverywhere);
  r.post('/auth/change-password', auth.changePassword);

  r.get('/config', allow('pages.read'), pages.config);

  r.get('/pages', allow('pages.read'), pages.list);
  r.post('/pages', allow('pages.write'), pages.create);
  r.get('/pages/:id', allow('pages.read'), pages.get);
  r.put('/pages/:id/draft', allow('pages.write'), pages.saveDraft);
  r.post('/pages/:id/publish', allow('pages.publish'), pages.publish);
  r.post('/pages/:id/unpublish', allow('pages.publish'), pages.unpublish);
  r.post('/pages/:id/archive', allow('pages.publish'), pages.archive);
  r.post('/pages/:id/unarchive', allow('pages.publish'), pages.unarchive);
  r.post('/pages/:id/duplicate', allow('pages.write'), pages.duplicate);
  r.delete('/pages/:id', allow('pages.delete'), pages.remove);
  r.get('/pages/:id/revisions', allow('pages.read'), pages.revisions);
  r.post('/pages/:id/restore', allow('pages.write'), pages.restoreRevision);
  r.post('/pages/:id/preview', allow('pages.read'), pages.preview);
  r.get('/pages/:id/download', allow('pages.read'), pages.download);
  r.get('/pages/:id/published-view', allow('pages.read'), pages.publishedView);
  r.post('/pages/:id/save-as-template', allow('templates.write'), pages.saveAsTemplate);

  r.get('/brands', allow('pages.read'), brands.list);
  r.get('/brands/categories', allow('pages.read'), brands.categories);
  r.post('/brands/import', allow('brands.write'), csvUpload(), brands.importCsv);
  r.get('/brands/sync', allow('pages.read'), brands.syncStatus);
  r.post('/brands/sync', allow('brands.write'), brands.startSync);
  r.post('/brands/:id/reset-to-gyftr', allow('brands.write'), brands.resetToGyftr);
  r.post('/brands', allow('brands.write'), brands.create);
  r.get('/brands/:id', allow('pages.read'), brands.get);
  r.put('/brands/:id', allow('brands.write'), brands.update);
  r.delete('/brands/:id', allow('brands.write'), brands.remove);

  r.get('/media', allow('pages.read'), media.list);
  r.post('/media', allow('media.write'), imageUpload(c.env.MAX_UPLOAD_MB), media.upload);
  r.patch('/media/:id', allow('media.write'), media.update);
  r.delete('/media/:id', allow('media.delete'), media.remove);

  r.get('/occasions', allow('pages.read'), catalog.listOccasions);
  r.post('/occasions', allow('settings.write'), catalog.createOccasion);
  r.put('/occasions/:id', allow('settings.write'), catalog.updateOccasion);

  r.get('/templates', allow('pages.read'), catalog.listTemplates);
  r.delete('/templates/:id', allow('templates.write'), catalog.deleteTemplate);

  r.get('/settings/site', allow('pages.read'), catalog.getSite);
  r.put('/settings/site', allow('settings.write'), catalog.updateSite);

  r.get('/audit', allow('audit.read'), catalog.auditLog);

  r.get('/users', allow('users.manage'), users.list);
  r.post('/users', allow('users.manage'), users.create);
  r.put('/users/:id', allow('users.manage'), users.update);

  return r;
}
