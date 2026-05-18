'use client';

import { useEffect } from 'react';

const accessKeys: Record<string, string> = {
  '000000001': '312026051812345678000190000000001',
  '000000002': '312026051812345678900900000000002',
};

function getInvoiceSection() {
  return Array.from(document.querySelectorAll<HTMLElement>('.nfse-section')).find((section) => section.textContent?.includes('Notas Fiscais')) || null;
}

function enhanceRows(section: HTMLElement) {
  section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr').forEach((row) => {
    const firstCell = row.querySelector<HTMLTableCellElement>('td:first-child');
    if (!firstCell) return;

    const rawNumber = (firstCell.querySelector('strong')?.textContent || firstCell.childNodes[0]?.textContent || firstCell.textContent || '').trim().split(/\s+/)[0];
    const accessKey = accessKeys[rawNumber];
    if (!accessKey) return;

    row.dataset.accessKey = accessKey;
    row.dataset.status = row.querySelector('.nfse-chip')?.textContent?.trim() || '';
    row.dataset.search = `${row.textContent || ''} ${accessKey}`.toLowerCase();

    if (firstCell.querySelector('.nfse-access-key')) return;

    const number = document.createElement('strong');
    number.textContent = rawNumber;

    const key = document.createElement('small');
    key.className = 'nfse-access-key';
    key.textContent = `Chave: ${accessKey}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'nfse-invoice-number';
    wrapper.append(number, key);

    firstCell.textContent = '';
    firstCell.appendChild(wrapper);
  });
}

function bindFilters(section: HTMLElement) {
  const search = section.querySelector<HTMLInputElement>('.nfse-search-row input');
  const status = section.querySelector<HTMLSelectElement>('.nfse-search-row select');
  if (!search || !status) return;

  search.placeholder = 'Buscar por tomador, número, chave de acesso, valor ou status...';
  Array.from(status.options).forEach((option) => {
    option.value = option.textContent?.includes('Todos') ? '' : option.textContent || '';
  });

  const apply = () => {
    enhanceRows(section);
    const term = search.value.toLowerCase().trim();
    const selected = status.value.toLowerCase().trim();

    section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr').forEach((row) => {
      const rowStatus = (row.dataset.status || row.querySelector('.nfse-chip')?.textContent || '').toLowerCase().trim();
      const rowSearch = row.dataset.search || `${row.textContent || ''} ${row.dataset.accessKey || ''}`.toLowerCase();
      row.style.display = (!term || rowSearch.includes(term)) && (!selected || selected === rowStatus) ? '' : 'none';
    });
  };

  if (search.dataset.nfseFilterReady !== 'true') {
    search.dataset.nfseFilterReady = 'true';
    search.addEventListener('input', apply);
    status.addEventListener('change', apply);
  }

  apply();
}

export function NfseListEnhancer() {
  useEffect(() => {
    const enhance = () => {
      const section = getInvoiceSection();
      if (!section) return;
      enhanceRows(section);
      bindFilters(section);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
