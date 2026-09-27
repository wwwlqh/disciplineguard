// Add MT5: download the Windows app, click Allow, tick your MetaTrader (EXPERIENCE §5.7, SPEC §9.5).
import { useEffect, useState } from 'react';
import { api, type Me } from '../api.ts';

export const APP_FILE = '/downloads/DisciplineGuard-Setup.exe';

/** Polls until a new MT connection reports in. */
function useNewConnection(before: number, onConnected?: () => void): Me['connections'][number] | null {
  const [conn, setConn] = useState<Me['connections'][number] | null>(null);
  useEffect(() => {
    let live = true;
    const id = setInterval(async () => {
      const me = await api<Me>('GET', '/api/me').catch(() => null);
      if (!live || !me || me.connections.length <= before) return;
      setConn(me.connections[me.connections.length - 1]);
      clearInterval(id);
      onConnected?.();
    }, 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [before]);
  return conn;
}

export function ConnectMt5({ me, onConnected }: { me: Me; onConnected?(): void }) {
  const conn = useNewConnection(me.connections.length, onConnected);
  return (
    <div className="stack">
      <ol className="steps">
        <li>
          <a className="btn primary" href={APP_FILE} download>Download DisciplineGuard for Windows</a>
          <div className="small muted">It sets up MetaTrader for you. No files to copy, no settings to change.</div>
        </li>
        <li>Open it and click <strong>Allow</strong> in the browser tab it opens.</li>
        <li>Tick your MetaTrader and press <strong>Protect</strong>.</li>
      </ol>
      <p className={conn ? 'banner' : 'small muted'} role="status">
        {conn ? <><strong>{conn.name}</strong> · On</> : 'Waiting for your computer… This updates on its own.'}
      </p>
      <details className="small muted">
        <summary>Trouble?</summary>
        <ul>
          <li>My MetaTrader isn't listed: press Browse in the app and pick its folder.</li>
          <li>I trade on a VPS: install the app on the VPS too.</li>
          <li>Antivirus blocked it: the app is signed by DisciplineGuard. Allow it, then run it again.</li>
          <li>Beta users can book a 10-minute setup call from Account → Report a problem.</li>
        </ul>
      </details>
    </div>
  );
}
