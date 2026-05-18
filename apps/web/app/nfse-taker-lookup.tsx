'use client';

import { useEffect } from 'react';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits.length === 14 ? digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : value;
}

function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length === 8 ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : value;
}

function findField(form: HTMLFormElement, text: string) {
  const labels = Array.from(form.querySelectorAll('label'));
  const label = labels.find((item) => item.textContent?.toLowerCase().includes(text.toLowerCase()));
  return label?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
}

function setField(field: HTMLInputElement | HTMLSelectElement | null, value?: string) {
  if (!field || !value) return;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function setMessage(form: HTMLFormElement, text: string) {
  let message = form.querySelector<HTMLParagraphElement>('.nfse-form-message');
  if (!message) {
    message = document.createElement('p');
    message.className = 'nfse-form-message';
    const footer = form.querySelector('.companies-form-footer');
    form.insertBefore(message, footer || null);
  }
  message.textContent = text;
}

async function lookup(input: HTMLInputElement) {
  const form = input.closest('form') as HTMLFormElement | null;
  if (!form) return;
  const digits = onlyDigits(input.value);
  if (digits.length !== 14) return;

  const token = localStorage.getItem('nfse_access_token');
  if (!token) return;

  input.value = formatCnpj(digits);
  setMessage(form, 'Consultando CNPJ...');

  try {
    const response = await fetch(`http://localhost:3333/companies/lookup/cnpj?cnpj=${digits}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || 'Não foi possível consultar o CNPJ.');

    setField(findField(form, 'Tipo'), 'Pessoa Jurídica');
    setField(findField(form, 'Razão social'), data.legalName || data.tradeName);
    setField(findField(form, 'E-mail'), data.email);
    setField(findField(form, 'Inscrição Municipal'), data.municipalRegistration);
    setField(findField(form, 'Telefone'), data.phone);
    setField(findField(form, 'Endereço'), data.address);
    setField(findField(form, 'Número'), data.number);
    setField(findField(form, 'CEP'), formatCep(data.zipCode || ''));
    setField(findField(form, 'Bairro'), data.neighborhood);
    setField(findField(form, 'Cidade'), data.city);
    setField(findField(form, 'UF'), data.state);
    setMessage(form, 'Dados do CNPJ preenchidos automaticamente.');
  } catch (error) {
    setMessage(form, error instanceof Error ? error.message : 'Não foi possível consultar o CNPJ.');
  }
}

function bindModal() {
  const input = document.querySelector<HTMLInputElement>('.nfse-modal input[placeholder="Documento do tomador"]');
  if (!input || input.dataset.takerLookupReady === 'true') return;
  input.dataset.takerLookupReady = 'true';
  input.addEventListener('blur', () => void lookup(input));
}

export function NfseTakerLookup() {
  useEffect(() => {
    bindModal();
    const observer = new MutationObserver(bindModal);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
