'use client';

import { useEffect } from 'react';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function getInvoicesSection() {
  return Array.from(document.querySelectorAll<HTMLElement>('.nfse-section')).find((section) => section.textContent?.includes('Notas Fiscais')) || null;
}

function getRows(section: HTMLElement) {
  return Array.from(section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr')).filter((row) => !row.textContent?.includes('Nenhuma nota encontrada'));
}

function getState(section: HTMLElement) {
  const page = Math.max(Number(section.dataset.nfsePage || '1'), 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(section.dataset.nfsePageSize)) ? Number(section.dataset.nfsePageSize) : 20;
  return { page, pageSize };
}

function setState(section: HTMLElement, page: number, pageSize: number) {
  section.dataset.nfsePage = String(Math.max(page, 1));
  section.dataset.nfsePageSize = String(pageSize);
}

function isRowCurrentlyFilterVisible(row: HTMLTableRowElement) {
  return row.style.display !== 'none';
}

function ensurePageSizeControl(section: HTMLElement) {
  const pagination = section.querySelector<HTMLElement>('.nfse-pagination');
  if (!pagination || pagination.querySelector('.nfse-page-size')) return;

  const wrapper = document.createElement('label');
  wrapper.className = 'nfse-page-size';
  wrapper.append('Notas por página');

  const select = document.createElement('select');
  PAGE_SIZE_OPTIONS.forEach((size) => {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = String(size);
    select.appendChild(option);
  });
  select.value = '20';
  select.addEventListener('change', () => {
    setState(section, 1, Number(select.value));
    applyPagination(section);
  });

  wrapper.appendChild(select);
  pagination.insertBefore(wrapper, pagination.firstChild);
}

function applyPagination(section: HTMLElement) {
  ensurePageSizeControl(section);

  const pagination = section.querySelector<HTMLElement>('.nfse-pagination');
  const allRows = getRows(section);
  const filterVisibleRows = allRows.filter(isRowCurrentlyFilterVisible);
  const state = getState(section);
  const totalPages = Math.max(Math.ceil(filterVisibleRows.length / state.pageSize), 1);
  const currentPage = Math.min(state.page, totalPages);
  setState(section, currentPage, state.pageSize);

  const start = (currentPage - 1) * state.pageSize;
  const end = start + state.pageSize;

  allRows.forEach((row) => {
    if (!isRowCurrentlyFilterVisible(row)) {
      row.hidden = false;
      return;
    }
    const index = filterVisibleRows.indexOf(row);
    row.hidden = index < start || index >= end;
  });

  const select = pagination?.querySelector<HTMLSelectElement>('.nfse-page-size select');
  if (select && select.value !== String(state.pageSize)) select.value = String(state.pageSize);

  const buttons = pagination ? Array.from(pagination.querySelectorAll<HTMLButtonElement>('button')) : [];
  const previous = buttons.find((button) => button.textContent?.trim() === 'Anterior');
  const next = buttons.find((button) => button.textContent?.trim() === 'Próxima');

  if (previous && previous.dataset.nfseBound !== 'true') {
    previous.dataset.nfseBound = 'true';
    previous.addEventListener('click', () => {
      const current = getState(section);
      setState(section, current.page - 1, current.pageSize);
      applyPagination(section);
    });
  }

  if (next && next.dataset.nfseBound !== 'true') {
    next.dataset.nfseBound = 'true';
    next.addEventListener('click', () => {
      const current = getState(section);
      setState(section, current.page + 1, current.pageSize);
      applyPagination(section);
    });
  }

  if (previous) previous.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;

  const pageLabel = pagination?.querySelector('span');
  const nextText = `Página ${currentPage} de ${totalPages}`;
  if (pageLabel && pageLabel.textContent !== nextText) pageLabel.textContent = nextText;
}

export function NfsePaginationEnhancer() {
  useEffect(() => {
    let isApplying = false;
    let frame = 0;

    const enhance = () => {
      if (isApplying) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = getInvoicesSection();
        if (!section) return;
        isApplying = true;
        try {
          if (!section.dataset.nfsePageSize) setState(section, 1, 20);
          applyPagination(section);
        } finally {
          isApplying = false;
        }
      });
    };

    enhance();
    document.addEventListener('input', enhance);
    document.addEventListener('change', enhance);
    document.addEventListener('click', enhance);

    const observer = new MutationObserver(() => {
      if (!isApplying) enhance();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('input', enhance);
      document.removeEventListener('change', enhance);
      document.removeEventListener('click', enhance);
      observer.disconnect();
    };
  }, []);

  return null;
}
