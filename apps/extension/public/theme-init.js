(() => {
  const root = document.documentElement;
  let finished = false;
  const finish = (candidate) => {
    if (finished) return;
    finished = true;
    const theme = ['system', 'light', 'dark'].includes(candidate) ? candidate : 'system';
    root.dataset.theme = theme;
    root.removeAttribute('data-theme-loading');
    try {
      localStorage.setItem('vittix-theme', theme);
    } catch {
      // Theme remains available from the IndexedDB-backed settings record.
    }
  };

  const fallback = () => {
    try {
      finish(localStorage.getItem('vittix-theme') || 'system');
    } catch {
      finish('system');
    }
  };

  try {
    const request = indexedDB.open('vittix-seo');
    request.onerror = fallback;
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('settings')) {
        database.close();
        fallback();
        return;
      }
      const transaction = database.transaction('settings', 'readonly');
      const get = transaction.objectStore('settings').get('app-settings');
      get.onsuccess = () => {
        finish(get.result?.value?.theme || 'system');
        database.close();
      };
      transaction.onerror = () => {
        database.close();
        fallback();
      };
    };
  } catch {
    fallback();
  }
})();
