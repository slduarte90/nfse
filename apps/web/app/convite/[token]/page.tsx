'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import '../../globals.css';
import '../../invite.css';
import { formatCnpj } from '../../document-utils';

interface InvitationData {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  permissions?: string[];
  status: string;
  expiresAt: string;
  canAccept: boolean;
  isExpired: boolean;
  company: {
    id: string;
    legalName: string;
    tradeName?: string | null;
    cnpj: string;
    city: string;
    state: string;
  };
}

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadInvitation() {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`http://localhost:3333/invitations/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Convite não encontrado.');
          return;
        }

        setInvitation(data);
        setName(data.name || '');
      } catch {
        setError('Não foi possível carregar o convite. Verifique se a API está rodando.');
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      void loadInvitation();
    }
  }, [token]);

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

    setIsSubmitting(true);

    try {
      const response = await fetch(`http://localhost:3333/invitations/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Não foi possível aceitar o convite.');
        return;
      }

      setSuccess('Convite aceito com sucesso. Redirecionando para o login...');
      setTimeout(() => router.push('/login'), 1200);
    } catch {
      setError('Não foi possível aceitar o convite. Verifique se a API está rodando.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-brand">
          <img src="/zip-logo.png" alt="Logo ZIP Contabilidade" />
          <p>Zip NFS-e</p>
        </div>

        {isLoading ? <p className="invite-message">Carregando convite...</p> : null}

        {!isLoading && error && !invitation ? <p className="invite-alert invite-alert--error">{error}</p> : null}

        {invitation ? (
          <>
            <div className="invite-header">
              <p className="invite-eyebrow">Convite de acesso</p>
              <h1>Acesse o portal da empresa</h1>
              <p>
                Você foi convidado para acessar a empresa <strong>{invitation.company.legalName}</strong> no ambiente de emissão de NFS-e da ZIP Contabilidade.
              </p>
            </div>

            <div className="invite-company">
              <span>{formatCnpj(invitation.company.cnpj)}</span>
              <span>{invitation.company.city}/{invitation.company.state}</span>
              <span>Acesso modular liberado</span>
            </div>

            {!invitation.canAccept ? (
              <p className="invite-alert invite-alert--error">
                Este convite não está mais disponível. Status atual: {invitation.status}.
              </p>
            ) : (
              <form className="invite-form" onSubmit={handleSubmit}>
                <label>
                  Nome
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" required />
                </label>
                <label>
                  E-mail
                  <input value={invitation.email} disabled />
                </label>
                <label>
                  Senha
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma senha" required />
                </label>
                <label>
                  Confirmar senha
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repita a senha" required />
                </label>

                {error ? <p className="invite-alert invite-alert--error">{error}</p> : null}
                {success ? <p className="invite-alert invite-alert--success">{success}</p> : null}

                <button className="invite-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Aceitando convite...' : 'Aceitar convite e criar acesso'}
                </button>
              </form>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
