// Base da API. Em produção, defina NEXT_PUBLIC_API_URL (HTTPS) para que as credenciais
// nunca trafeguem em texto claro. Em desenvolvimento cai no localhost padrão.
export const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/+$/, '');
