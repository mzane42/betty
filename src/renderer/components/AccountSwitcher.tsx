import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';
import { toast } from '../lib/toast.js';

export function AccountSwitcher(): JSX.Element | null {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    Promise.all([pokerApi.listAccounts(), pokerApi.getActiveAccount()]).then(([list, cur]) => {
      setAccounts(list);
      setActive(cur);
    });
  }, []);

  async function pick(account: string): Promise<void> {
    await pokerApi.setActiveAccount(account);
    setActive(account);
    toast.success(`Compte actif: ${account}. Rafraîchis l'app pour recalculer.`, 4000);
  }

  if (accounts.length <= 1) return null;

  return (
    <select
      className="account-switcher"
      value={active}
      onChange={(e) => pick(e.target.value)}
      title="Changer de compte"
    >
      {accounts.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}
