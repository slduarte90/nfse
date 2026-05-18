'use client';

import { useEffect } from 'react';

const keys: Record<string, string> = {
  '000000001': '312026051812345678000190000000001',
  '000000002': '312026051812345678900900000000002',
};

function addAccessKeys(section: HTMLElement) {
  const rows = Array.from(section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr'));
  rows.forEach((row) => {
    const cell = row.querySelector<HTMLTableCellElement>('td:first-child');
    if (!cell || cell.querySelector('.nfse-access-key')) return;
    const number = cell.textContent?.trim() || '';
    const accessKey = keys[number];
    if (!accessKey) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'nfse-invoice-number';
    const strong = document.createElement('strong');
    strong.textContent = number;
    const small = document.createElement('small');
    small.className = 'nfse-access-key';
    small.textContent = `Chave: ${accessKey}`;
    wrapper.append(strong, small);
    cell.replaceChildren(wrapper);
    row.dataset.accessKey = accessKey;
  });
}

function bindFilters(section: HTMLElement) {
  const search = section.querySelector<HTMLInputElement>('.nfse-search-row input');
  const status = section.querySelector<HTMLSelectElement>('.nfse-search-row select');
  if (!search || !status || status.dataset.nfseReady === 'true') return;
  status.dataset.nfseReady = 'true';
  search.placeholder = 'Buscar por tomador, número, chave de acesso, valor ou status...';
  Array.from(status.options).forEach((option) => { option.value = option.textContent?.includes('Todos') ? '' : option.textContent || ''; });
  const apply = () => {
    const term = search.value.toLowerCase().trim();
    const selected = status.value.toLowerCase().trim();
    section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr').forEach((row) => {
      const rowStatus = row.querySelector('.nfse-chip')?.textContent?.toLowerCase().trim() || '';
      const text = `${row.textContent || ''} ${row.dataset.accessKey || ''}`.toLowerCase();
      row.style.display = (!term || text.includes(term)) && (!selected || selected === rowStatus) ? '' : 'none';
    });
  };
  search.addEventListener('input', apply);
  status.addEventListener('change', apply);
  apply();
}

export function NfseListEnhancer() {
  useEffect(() => {
    const enhance = () => {
      const section = Array.from(document.querySelectorAll<HTMLElement>('.nfse-section')).find((item) => item.textContent?.includes('Notas Fiscais'));
      if (!section) return;
      addAccessKeys(section);
      bindFilters(section);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
