import { describe, it, expect } from 'vitest';
import { loginSchema, emailSchema, passwordWithConfirmSchema } from './schemas';

describe('loginSchema', () => {
  it('validates correct login data', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('validates correct email', () => {
    const result = emailSchema.safeParse({ email: 'user@firma.de' });
    expect(result.success).toBe(true);
  });

  it('rejects empty email', () => {
    const result = emailSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});

describe('passwordWithConfirmSchema', () => {
  it('validates strong matching passwords', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'MyPass1!x',
      confirm: 'MyPass1!x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects password under 8 chars', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'Ab1!',
      confirm: 'Ab1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'mypass1!x',
      confirm: 'mypass1!x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'MYPASS1!X',
      confirm: 'MYPASS1!X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without number', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'MyPasswo!',
      confirm: 'MyPasswo!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without special char', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'MyPass12x',
      confirm: 'MyPass12x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched passwords', () => {
    const result = passwordWithConfirmSchema.safeParse({
      password: 'MyPass1!x',
      confirm: 'Different1!',
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('confirm');
  });
});
