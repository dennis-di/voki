import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { myProfile } from './lib/data';
import type { Profile } from './lib/types';
import { Background, Toaster } from './ui/common';
import { IBook, ICheck, IGear, IPlus } from './ui/icons';
import { stopPlayer } from './lib/speech';
import Auth from './screens/Auth';
import Home from './screens/Home';
import UnitView from './screens/UnitView';
import Editor from './screens/Editor';
import Test from './screens/Test';
import Settings from './screens/Settings';
import Admin from './screens/Admin';

export type Route = { n: 'home' } | { n: 'unit'; id: string } | { n: 'edit'; id?: string } | { n: 'test' } | { n: 'settings' } | { n: 'admin' };
export type Go = (r: Route) => void;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [route, setRoute] = useState<Route>({ n: 'home' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const reloadProfile = useCallback(() => { myProfile().then(setProfile); }, []);
  useEffect(() => { if (session) reloadProfile(); else setProfile(null); }, [session, reloadProfile]);

  const go: Go = (r) => { stopPlayer(); setRoute(r); window.scrollTo({ top: 0 }); };

  if (session === undefined) return <><Background /><main className="app"><p className="muted center">Lädt …</p></main></>;
  if (!session) return <><Background /><Auth /><Toaster /></>;
  if (!profile) return <><Background /><main className="app"><div className="glass pad stack"><p>Profil wird geladen …</p><button className="btn" onClick={() => supabase.auth.signOut()}>Abmelden</button></div></main></>;

  const tabs: { n: Route['n']; label: string; icon: JSX.Element }[] = [
    { n: 'home', label: 'Lernen', icon: <IBook /> },
    { n: 'test', label: 'Test', icon: <ICheck /> },
    { n: 'edit', label: 'Neu', icon: <IPlus /> },
    { n: 'settings', label: 'Einstellungen', icon: <IGear /> },
  ];
  const showTabs = route.n !== 'unit' && !(route.n === 'edit' && route.id);

  return (
    <>
      <Background />
      {route.n === 'home' && <Home profile={profile} go={go} />}
      {route.n === 'unit' && <UnitView id={route.id} go={go} />}
      {route.n === 'edit' && <Editor key={route.id || 'new'} id={route.id} profile={profile} go={go} />}
      {route.n === 'test' && <Test go={go} />}
      {route.n === 'settings' && <Settings profile={profile} onProfile={reloadProfile} go={go} />}
      {route.n === 'admin' && profile.role === 'admin' && <Admin me={profile} go={go} />}
      {showTabs && (
        <nav className="dock" aria-label="Hauptmenü">
          <div className="tabbar glass" style={{ ['--n' as string]: tabs.length }}>
            {tabs.map((t) => (
              <button key={t.n} className={'tab' + (t.n === 'edit' ? ' plus' : '')} aria-current={route.n === t.n || (t.n === 'settings' && route.n === 'admin') ? 'page' : undefined} onClick={() => go({ n: t.n } as Route)}>
                {t.n === 'edit' ? <span className="fab">{t.icon}</span> : t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <Toaster />
    </>
  );
}
