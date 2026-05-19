import { useEffect, useState } from 'react';
import { toastBus, type Toast } from '../lib/toast.js';

export function ToastHost(): JSX.Element {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    return toastBus.subscribe((t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.duration);
    });
  }, []);

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
