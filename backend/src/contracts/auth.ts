import { z } from 'zod';

/**
 * A person's access, chosen when an admin adds them: Edit only (EDITOR), Edit & publish (PUBLISHER) or Admin.
 * Everyone can edit everything that is not admin-only (pages, brands, media, templates); only publishing
 * differs between EDITOR and PUBLISHER.
 */
export const ROLES = ['ADMIN', 'PUBLISHER', 'EDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Admin', PUBLISHER: 'Edit & publish', EDITOR: 'Edit only' };

/** What each access level means, as the panel explains it when adding a person. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  EDITOR: 'Edit pages, brands, images and templates. Cannot publish.',
  PUBLISHER: 'Everything in Edit only, plus publish, unpublish and archive pages.',
  ADMIN: 'Everything, plus users, occasions, header & footer, deleting pages and the audit log.',
};

/** What each role may do. Kept here so the API and the UI agree. */
export const PERMISSIONS = {
  'pages.read': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'pages.write': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'pages.publish': ['ADMIN', 'PUBLISHER'],
  'pages.delete': ['ADMIN'],
  'brands.write': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'media.write': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'media.delete': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'templates.write': ['ADMIN', 'PUBLISHER', 'EDITOR'],
  'settings.write': ['ADMIN'],
  'users.manage': ['ADMIN'],
  'audit.read': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

/** Minimum 12 chars with letters and digits. */
export const passwordSchema = z
  .string()
  .min(12, 'At least 12 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/[0-9]/, 'Must contain a number');

export const createUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  password: passwordSchema,
});

export const updateUserInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** The sign-in address. Changing someone else's signs them out; they sign in with the new one. */
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** True while the password is one the user was given: only changing it is allowed. */
  mustChangePassword: boolean;
}
