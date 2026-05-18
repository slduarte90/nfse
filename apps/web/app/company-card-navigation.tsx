'use client';

import { useEffect } from 'react';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

type CompanyCardTarget = {
  id: string;
  legalName: string;
  cnpj: string;
};

export function CompanyCardNavigation() {
  useEffect(() => {
    async function findCompany(button: HTMLButtonElement): Promise<CompanyCardTarget | null> {
      const token = localStorage.getItem('nfse_access_token');
      if (!token) return null;

      const title = button.querySelector('h2')?.textContent?.trim().toLowerCase() || '';
      const cnpj = onlyDigits(button.querySelector('p')?.textContent || '');

      try {
        const response = await fetch('http://localhost:3333/companies', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        const companies = (await response.json()) as CompanyCardTarget[];
        return companies.find((company) => onlyDigits(company.cnpj) === cnpj) || companies.find((company) => company.legalName.trim().toLowerCase() === title) || null;
      } catch {
        return null;
      }
    }

    async function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.company-card__content');
      if (!button) return;
      event.preventDefault();
      const company = await findCompany(button);
      if (company) window.location.href = `/empresas/${company.id}`;
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return null;
}
