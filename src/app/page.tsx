import { AuthButton } from '../components/AuthButton';
import { auth } from '@/auth';
import { runtimeConfiguration } from '@/lib/runtime-config';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();
  if (session?.user?.walletAddress) redirect('/game');
  const { world } = runtimeConfiguration();
  return (
    <main className="world-id-gate"><div className="world-id-gate-card">
      <span className="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1>Civilization</h1><span>Öffne Civilization in World App und melde dich ausdrücklich mit deiner Wallet an.</span>
        <AuthButton worldAppId={world.worldAppId} />
      </div></main>
  );
}
