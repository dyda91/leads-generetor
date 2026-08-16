import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';

import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

// Mirrors the backend contract (password-policy.ts); never imported at runtime.
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_MAX_UTF8_BYTES = 512;

export function validateNewPassword(value: string): string | null {
  if (value.length === 0) {
    return 'Informe a nova senha.';
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return 'A nova senha deve ter pelo menos 12 caracteres.';
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return 'A nova senha deve ter no máximo 128 caracteres.';
  }
  if (new TextEncoder().encode(value).byteLength > PASSWORD_MAX_UTF8_BYTES) {
    return 'A nova senha deve ocupar no máximo 512 bytes.';
  }
  if (value.trim().length === 0) {
    return 'A nova senha não pode conter apenas espaços.';
  }
  return null;
}

function mapChangePasswordError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'http':
        switch (error.status) {
          case 400:
            return 'Verifique os dados informados.';
          case 401:
            return 'Sua sessão expirou. Entre novamente.';
          case 403:
            return 'A solicitação não pôde ser validada. Tente novamente.';
          case 409:
            return 'Houve um conflito de sessão. Recarregue a página e tente novamente.';
          case 429:
            return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
          default:
            return 'Não foi possível alterar a senha. Tente novamente.';
        }
      case 'network':
      case 'timeout':
        return 'Não foi possível conectar. Tente novamente.';
      default:
        return 'Ocorreu um erro inesperado. Tente novamente.';
    }
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/**
 * Protected account-security page: password change only (no recovery, MFA,
 * sessions/devices or account deletion). Submits exclusively through
 * `auth.changePassword()` — the AuthProvider supplies the CSRF internally.
 * Passwords are never trimmed, normalized, stored, copied to the router,
 * context or logs, and the confirmation is never sent to the backend.
 */
export function SecurityPage() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const submittingRef = useRef(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const currentValidation = currentPassword.length === 0 ? 'Informe a senha atual.' : null;
    const newValidation = validateNewPassword(newPassword);
    const confirmValidation =
      newPassword === confirmation ? null : 'A confirmação não coincide com a nova senha.';

    setCurrentError(currentValidation);
    setNewError(newValidation);
    setConfirmError(confirmValidation);
    setGeneralError(null);
    setSuccessMessage(null);

    if (currentValidation !== null || newValidation !== null || confirmValidation !== null) {
      if (currentValidation !== null) {
        currentRef.current?.focus();
      } else if (newValidation !== null) {
        newRef.current?.focus();
      } else {
        confirmationRef.current?.focus();
      }
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setSuccessMessage('Senha alterada com sucesso.');
      statusRef.current?.focus();
    } catch (error) {
      setGeneralError(mapChangePasswordError(error));
      alertRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const currentDescribedBy = currentError !== null ? 'current-password-error' : undefined;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Segurança da conta</h1>
        <p className="text-sm text-muted-foreground">
          Altere a senha de acesso ao sistema. A nova senha vale imediatamente e mantém a sua sessão
          atual ativa.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-busy={submitting}
            aria-label="Alterar senha"
            className="space-y-4"
          >
            <div>
              <Label htmlFor="current-password">Senha atual</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  ref={currentRef}
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="pr-10"
                  aria-describedby={currentDescribedBy}
                  {...(currentError !== null ? { 'aria-invalid': true } : {})}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  aria-pressed={showCurrent}
                  onClick={() => setShowCurrent((current) => !current)}
                >
                  <span className="sr-only">
                    {showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                  </span>
                  {showCurrent ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </div>
              {currentError !== null && (
                <p id="current-password-error" className="mt-1 text-sm text-destructive">
                  {currentError}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  ref={newRef}
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="pr-10"
                  aria-describedby={
                    newError !== null
                      ? 'new-password-requirements new-password-error'
                      : 'new-password-requirements'
                  }
                  {...(newError !== null ? { 'aria-invalid': true } : {})}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  aria-pressed={showNew}
                  onClick={() => setShowNew((current) => !current)}
                >
                  <span className="sr-only">
                    {showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                  </span>
                  {showNew ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </div>
              <ul
                id="new-password-requirements"
                className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground"
              >
                <li>Entre 12 e 128 caracteres.</li>
                <li>No máximo 512 bytes em UTF-8.</li>
                <li>Não pode conter apenas espaços.</li>
              </ul>
              {newError !== null && (
                <p id="new-password-error" className="mt-1 text-sm text-destructive">
                  {newError}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirm-password">Confirme a nova senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  ref={confirmationRef}
                  type={showConfirmation ? 'text' : 'password'}
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="pr-10"
                  aria-describedby={confirmError !== null ? 'confirm-password-error' : undefined}
                  {...(confirmError !== null ? { 'aria-invalid': true } : {})}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  aria-pressed={showConfirmation}
                  onClick={() => setShowConfirmation((current) => !current)}
                >
                  <span className="sr-only">
                    {showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                  </span>
                  {showConfirmation ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </div>
              {confirmError !== null && (
                <p id="confirm-password-error" className="mt-1 text-sm text-destructive">
                  {confirmError}
                </p>
              )}
            </div>

            {generalError !== null && (
              <p
                role="alert"
                ref={alertRef}
                tabIndex={-1}
                className="rounded-md border border-destructive/30 bg-surface-error p-3 text-sm text-foreground focus:outline-none"
              >
                {generalError}
              </p>
            )}
            {successMessage !== null && (
              <p
                role="status"
                ref={statusRef}
                tabIndex={-1}
                className="rounded-md border border-success/30 bg-surface-success p-3 text-sm text-foreground focus:outline-none"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 text-success" />
                  {successMessage}
                </span>
              </p>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Alterar senha
            </Button>
            {submitting && (
              <p role="status" className="text-sm text-muted-foreground">
                Alterando senha…
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
