import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Passwort muss mindestens 8 Zeichen haben.')
  .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten.')
  .regex(/[a-z]/, 'Passwort muss mindestens einen Kleinbuchstaben enthalten.')
  .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten.')
  .regex(/[^A-Za-z0-9]/, 'Passwort muss mindestens ein Sonderzeichen enthalten.');

export const passwordWithConfirmSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Bitte Passwort bestätigen.'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwörter stimmen nicht überein.',
    path: ['confirm'],
  });

export const loginSchema = z.object({
  email: z.string().min(1, 'E-Mail ist erforderlich.').email('Ungültige E-Mail-Adresse.'),
  password: z.string().min(1, 'Passwort ist erforderlich.'),
});

export const emailSchema = z.object({
  email: z.string().min(1, 'Bitte E-Mail-Adresse eingeben.').email('Ungültige E-Mail-Adresse.'),
});
