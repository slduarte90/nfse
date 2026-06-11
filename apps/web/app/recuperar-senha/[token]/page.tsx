'use client';

import { FormEvent, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiBase } from '../../api-base';

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmação de senha não confere.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Não foi possível redefinir a senha.');
        return;
      }
      setSuccess(data.message || 'Senha redefinida com sucesso.');
      setTimeout(() => router.push('/login'), 900);
    } catch {
      setError('Não foi possível conectar com a API. Verifique se o backend está rodando.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="nfse-login-page">
      <section className="nfse-brand-panel" aria-label="Logo principal">
        <div className="nfse-logo-showcase">
          <img className="nfse-brand-logo" src="/zip-logo.png" alt="Logo ZIP Contabilidade" />
          <div className="nfse-brand-copy">
            <h1>Portal do Cliente</h1>
            <p>Crie uma nova senha para voltar ao atendimento com segurança.</p>
          </div>
        </div>
      </section>

      <section className="nfse-login-panel" aria-labelledby="reset-title">
        <form className={`nfse-login-form ${error ? 'is-invalid' : ''}`} method="post" onSubmit={handleSubmit}>
          <div className="nfse-login-form__header">
            <h2 id="reset-title">Redefinir senha</h2>
          </div>

          <label className="nfse-field" htmlFor="password">
            <span>Nova senha</span>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          <label className="nfse-field" htmlFor="confirmPassword">
            <span>Confirmar senha</span>
            <input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>

          <button className="nfse-login-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Salvando...' : 'Salvar nova senha'}
          </button>

          {error ? <p className="nfse-login-error" role="alert">{error}</p> : null}
          {success ? <p className="nfse-login-success" role="status">{success}</p> : null}
        </form>
      </section>
    </main>
  );
}
